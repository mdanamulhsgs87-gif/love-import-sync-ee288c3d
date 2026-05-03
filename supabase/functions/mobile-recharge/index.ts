const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOPUP_API = "https://api.successtopup.com/api/recharge";
const STATUS_API = "https://api.successtopup.com/api/status";

const OPERATOR_MAP: Record<string, string> = {
  gp: "GP",
  robi: "RB",
  bl: "BL",
  airtel: "AT",
  teletalk: "TT",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUCCESSTOPUP_KEY = Deno.env.get("SUCCESSTOPUP_KEY");
    const SUCCESSTOPUP_SECRET = Deno.env.get("SUCCESSTOPUP_SECRET");
    if (!SUCCESSTOPUP_KEY || !SUCCESSTOPUP_SECRET) {
      return new Response(JSON.stringify({ error: "Topup API credentials not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // Balance check action (no auth needed)
    if (body.action === "check_balance") {
      try {
        const balanceRes = await fetch("https://api.successtopup.com/api/balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            successtopup_key: SUCCESSTOPUP_KEY,
            successtopup_secret: SUCCESSTOPUP_SECRET,
          }),
        });
        const balanceData = await balanceRes.json();
        return new Response(JSON.stringify({
          balance: balanceData.balance ?? 0,
          driveBalance: balanceData.driveBalance ?? 0,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ balance: null }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Auth check for recharge
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { phone, operator, amount, userId, transactionId } = body;

    // Validate
    if (!phone || typeof phone !== "string" || phone.length !== 11) {
      return new Response(JSON.stringify({ error: "Invalid phone number" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!operator || !OPERATOR_MAP[operator]) {
      return new Response(JSON.stringify({ error: "Invalid operator" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!amount || typeof amount !== "number" || amount < 9) {
      return new Response(JSON.stringify({ error: "Invalid amount" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // ========= SERVER-SIDE KEY_COUNT VALIDATION =========
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const RATE = 20;
    const keysNeeded = Math.ceil(amount / RATE);

    if (!userId) {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch current key_count from DB (server-side truth)
    const { data: userData, error: userError } = await adminClient
      .from("users")
      .select("key_count, display_name")
      .eq("id", userId)
      .single();

    if (userError || !userData) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userData.key_count < keysNeeded) {
      console.error(`BLOCKED: User ${userId} (${userData.display_name}) tried recharge ${amount} TK but only has ${userData.key_count} keys (needs ${keysNeeded})`);
      return new Response(JSON.stringify({ 
        error: `আপনার কাউন্ট পর্যাপ্ত নয়। প্রয়োজন: ${keysNeeded}, আছে: ${userData.key_count}` 
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct keys ATOMICALLY on server side (not client)
    const { error: deductErr } = await adminClient
      .from("users")
      .update({ key_count: userData.key_count - keysNeeded })
      .eq("id", userId)
      .eq("key_count", userData.key_count); // optimistic lock: only deduct if count hasn't changed

    if (deductErr) {
      return new Response(JSON.stringify({ error: "কাউন্ট আপডেট ব্যর্থ, আবার চেষ্টা করুন" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trxid = `goodapp_${userId}_${Date.now()}`;

    // Call Success Topup API
    const topupResponse = await fetch(TOPUP_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        number: phone,
        type: "prepaid",
        operator: OPERATOR_MAP[operator],
        amount,
        trxid,
        successtopup_key: SUCCESSTOPUP_KEY,
        successtopup_secret: SUCCESSTOPUP_SECRET,
      }),
    });

    const topupData = await topupResponse.json();

    if (topupData.result === true) {
      // Success - mark transaction completed with before/after counts
      if (transactionId) {
        const afterKeys = userData.key_count - keysNeeded;
        await adminClient.from("transactions").update({
          status: "completed",
          details: `📱 ${OPERATOR_MAP[operator]} রিচার্জ সফল: ${phone} | ${amount} TK | TrxID: ${trxid} | আগে: ${userData.key_count} → পরে: ${afterKeys}`,
        }).eq("id", transactionId);
      }

      return new Response(JSON.stringify({
        success: true,
        message: topupData.message || "Recharge successful",
        trxid,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Failed - refund keys (already deducted server-side)
      const { data: currentUser } = await adminClient.from("users").select("key_count").eq("id", userId).single();
      if (currentUser) {
        await adminClient.from("users").update({ key_count: currentUser.key_count + keysNeeded }).eq("id", userId);
      }

      // Mark transaction failed
      if (transactionId) {
        await adminClient.from("transactions").update({
          status: "failed",
          details: `📱 ${OPERATOR_MAP[operator]} রিচার্জ ব্যর্থ: ${phone} | ${amount} TK | ${topupData.message || "Unknown error"} | কী রিফান্ড হয়েছে`,
        }).eq("id", transactionId);
      }

      return new Response(JSON.stringify({
        success: false,
        message: topupData.message || "Recharge failed",
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("Topup error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
