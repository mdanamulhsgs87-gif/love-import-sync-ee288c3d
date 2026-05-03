import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VAULT_PASSWORD = "Anamul*984516";

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { password, action, data } = await req.json();

    if (password !== VAULT_PASSWORD) {
      return new Response(
        JSON.stringify({ error: "Invalid password" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === "get_bindings") {
      const { data: bindings } = await supabase
        .from("face_wallet_bindings")
        .select("*")
        .order("created_at", { ascending: false });
      return new Response(
        JSON.stringify({ bindings: bindings || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_reverify_queue") {
      const { data: queue } = await supabase
        .from("reverify_queue")
        .select("*")
        .order("created_at", { ascending: false });
      return new Response(
        JSON.stringify({ queue: queue || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "add_to_queue") {
      const binding = data?.binding;
      if (!binding) {
        return new Response(
          JSON.stringify({ error: "Missing binding data" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { error } = await supabase.from("reverify_queue").insert({
        wallet_address: binding.wallet_address,
        private_key: binding.private_key,
        face_photo_url: binding.face_photo_url,
        assigned_user_id: binding.user_id,
        binding_id: binding.id,
        status: "pending",
      });
      if (error) throw error;
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "add_all_to_queue") {
      const bindings = data?.bindings;
      if (!bindings?.length) {
        return new Response(
          JSON.stringify({ added: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Check existing
      const { data: existing } = await supabase
        .from("reverify_queue")
        .select("binding_id")
        .eq("status", "pending");
      const existingIds = new Set((existing || []).map((e: any) => e.binding_id));

      const toAdd = bindings
        .filter((b: any) => !existingIds.has(b.id))
        .map((b: any) => ({
          wallet_address: b.wallet_address,
          private_key: b.private_key,
          face_photo_url: b.face_photo_url,
          assigned_user_id: b.user_id,
          binding_id: b.id,
          status: "pending",
        }));

      if (toAdd.length === 0) {
        return new Response(
          JSON.stringify({ added: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { error } = await supabase.from("reverify_queue").insert(toAdd);
      if (error) throw error;
      return new Response(
        JSON.stringify({ added: toAdd.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "delete_queue_item") {
      const id = data?.id;
      if (!id) {
        return new Response(
          JSON.stringify({ error: "Missing id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      await supabase.from("reverify_queue").delete().eq("id", id);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "clear_completed") {
      await supabase.from("reverify_queue").delete().eq("status", "completed");
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_queue_status") {
      // Return wallet_address + status for whitelist checking
      const { data: queue } = await supabase
        .from("reverify_queue")
        .select("wallet_address, status")
        .in("status", ["pending", "completed"]);
      return new Response(
        JSON.stringify({ queue: queue || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_recharge_history") {
      const { data: txData } = await supabase
        .from("transactions")
        .select("*")
        .eq("type", "recharge")
        .order("created_at", { ascending: false });
      if (!txData || txData.length === 0) {
        return new Response(
          JSON.stringify({ history: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const userIds = [...new Set(txData.map((t: any) => t.user_id))];
      const { data: usersData } = await supabase
        .from("users")
        .select("id, display_name, guest_id, key_count")
        .in("id", userIds);
      const userMap: Record<number, any> = {};
      (usersData || []).forEach((u: any) => { userMap[u.id] = u; });
      const history = txData.map((t: any) => ({ ...t, user: userMap[t.user_id] || null }));
      return new Response(
        JSON.stringify({ history }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_pool") {
      let allData: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data: batch } = await supabase
          .from("verification_pool")
          .select("id, verify_url, private_key, is_used, added_by, created_at")
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (!batch || batch.length === 0) break;
        allData = allData.concat(batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }
      return new Response(
        JSON.stringify({ pool: allData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "delete_pool_key") {
      const id = data?.id;
      if (!id) {
        return new Response(
          JSON.stringify({ error: "Missing id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      await supabase.from("verification_pool").delete().eq("id", id);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "delete_used_keys") {
      await supabase.from("verification_pool").delete().eq("is_used", true);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "delete_all_keys") {
      await supabase.from("verification_pool").delete().neq("id", 0);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("admin-vault error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
