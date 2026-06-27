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
          .select("id, verify_url, private_key, wallet_address, face_photo_url, face_label, status, failed_reason, failed_at, is_used, added_by, created_at")
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

    // ═══ Admin: edit generated/failed pool item (key, face, label, status) ═══
    if (action === "update_pool_item") {
      const { id, private_key, face_photo_url, face_label, status, failed_reason } = data || {};
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing pool id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const patch: any = {};
      if (typeof private_key === "string" && private_key.trim()) {
        patch.private_key = private_key.trim();
        try {
          const { ethers } = await import("https://esm.sh/ethers@6.16.0");
          patch.wallet_address = new ethers.Wallet(private_key.trim()).address;
        } catch (_) {
          return new Response(JSON.stringify({ error: "Invalid private_key" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      if (typeof face_photo_url === "string" && face_photo_url) patch.face_photo_url = face_photo_url;
      if (typeof face_label === "string") patch.face_label = face_label.trim().slice(0, 60) || null;
      if (typeof status === "string" && status) patch.status = status;
      if (typeof failed_reason === "string") patch.failed_reason = failed_reason.trim() || null;

      const { error } = await supabase.from("verification_pool").update(patch).eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, wallet_address: patch.wallet_address }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    // ═══ Admin: edit an existing reverify queue item (key, face, label owner) ═══
    if (action === "update_queue_item") {
      const { id, private_key, face_photo_url, face_label, assigned_user_id, wallet_address: walletAddrIn } = data || {};
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing queue id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const patch: any = {};
      let walletAddress = typeof walletAddrIn === "string" && walletAddrIn ? walletAddrIn : "";
      if (typeof private_key === "string" && private_key.trim()) {
        patch.private_key = private_key.trim();
        if (!walletAddress) {
          try {
            const { ethers } = await import("https://esm.sh/ethers@6.16.0");
            walletAddress = new ethers.Wallet(private_key.trim()).address;
          } catch (_) {
            return new Response(JSON.stringify({ error: "Invalid private_key" }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }
      if (walletAddress) patch.wallet_address = walletAddress;
      if (typeof face_photo_url === "string" && face_photo_url) patch.face_photo_url = face_photo_url;
      if (typeof assigned_user_id === "number") patch.assigned_user_id = assigned_user_id;

      const { data: existing } = await supabase
        .from("reverify_queue")
        .select("binding_id, wallet_address")
        .eq("id", id)
        .maybeSingle();

      const { error } = await supabase.from("reverify_queue").update(patch).eq("id", id);
      if (error) throw error;

      const bindingPatch: any = {};
      if (patch.private_key) bindingPatch.private_key = patch.private_key;
      if (patch.wallet_address) bindingPatch.wallet_address = patch.wallet_address;
      if (patch.face_photo_url) bindingPatch.face_photo_url = patch.face_photo_url;
      if (typeof face_label === "string") bindingPatch.face_label = face_label.trim().slice(0, 60) || null;
      if (patch.assigned_user_id) bindingPatch.user_id = patch.assigned_user_id;

      if (Object.keys(bindingPatch).length > 0) {
        if (existing?.binding_id) {
          await supabase.from("face_wallet_bindings").update(bindingPatch).eq("id", existing.binding_id);
        } else if (existing?.wallet_address || patch.wallet_address) {
          await supabase.from("face_wallet_bindings").update(bindingPatch).eq("wallet_address", existing?.wallet_address || patch.wallet_address);
        }
      }

      return new Response(JSON.stringify({ success: true, wallet_address: patch.wallet_address }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══ Admin: move a failed/generated pool item to re-verify queue without deleting it ═══
    if (action === "add_pool_to_queue") {
      const { pool_id, assigned_user_id } = data || {};
      if (!pool_id) {
        return new Response(JSON.stringify({ error: "Missing pool_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: poolItem } = await supabase
        .from("verification_pool")
        .select("id, private_key, wallet_address, face_photo_url, face_label, added_by")
        .eq("id", pool_id)
        .maybeSingle();
      if (!poolItem?.private_key) {
        return new Response(JSON.stringify({ error: "Pool key not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!poolItem.face_photo_url) {
        return new Response(JSON.stringify({ error: "Face photo missing" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let walletAddress = poolItem.wallet_address || "";
      try {
        const { ethers } = await import("https://esm.sh/ethers@6.16.0");
        walletAddress = walletAddress || new ethers.Wallet(poolItem.private_key).address;
      } catch (_) {
        return new Response(JSON.stringify({ error: "Invalid private_key" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let ownerId = Number(assigned_user_id) || 0;
      if (!ownerId && poolItem.added_by) {
        const { data: uByGuest } = await supabase.from("users").select("id").eq("guest_id", poolItem.added_by).maybeSingle();
        ownerId = uByGuest?.id || 0;
        if (!ownerId && /^\d+$/.test(String(poolItem.added_by))) {
          const { data: uById } = await supabase.from("users").select("id").eq("id", Number(poolItem.added_by)).maybeSingle();
          ownerId = uById?.id || 0;
        }
      }
      if (!ownerId) {
        return new Response(JSON.stringify({ error: "Assigned User ID required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existing } = await supabase
        .from("face_wallet_bindings")
        .select("id")
        .eq("wallet_address", walletAddress)
        .maybeSingle();

      let bindingId = existing?.id || null;
      if (existing?.id) {
        await supabase.from("face_wallet_bindings").update({
          private_key: poolItem.private_key,
          face_photo_url: poolItem.face_photo_url,
          face_label: poolItem.face_label || null,
          user_id: ownerId,
        }).eq("id", existing.id);
      } else {
        const { data: ins, error: insErr } = await supabase.from("face_wallet_bindings").insert({
          wallet_address: walletAddress,
          private_key: poolItem.private_key,
          face_photo_url: poolItem.face_photo_url,
          face_label: poolItem.face_label || null,
          user_id: ownerId,
        }).select("id").maybeSingle();
        if (insErr) throw insErr;
        bindingId = ins?.id || null;
      }

      const { data: pending } = await supabase.from("reverify_queue")
        .select("id")
        .eq("wallet_address", walletAddress)
        .eq("status", "pending")
        .maybeSingle();
      if (pending?.id) {
        await supabase.from("reverify_queue").update({
          private_key: poolItem.private_key,
          face_photo_url: poolItem.face_photo_url,
          assigned_user_id: ownerId,
          binding_id: bindingId,
        }).eq("id", pending.id);
      } else {
        const { error: qErr } = await supabase.from("reverify_queue").insert({
          wallet_address: walletAddress,
          private_key: poolItem.private_key,
          face_photo_url: poolItem.face_photo_url,
          assigned_user_id: ownerId,
          binding_id: bindingId,
          status: "pending",
        });
        if (qErr) throw qErr;
      }

      await supabase.from("verification_pool").update({
        wallet_address: walletAddress,
        status: "queued",
        failed_reason: "Admin manually added to reverify queue",
      }).eq("id", pool_id);

      return new Response(JSON.stringify({ success: true, wallet_address: walletAddress, assigned_user_id: ownerId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══ Admin: update an existing face_wallet_binding ═══
    if (action === "update_binding") {
      const { id, face_photo_url, face_label, private_key, wallet_address, user_id } = data || {};
      if (!id) {
        return new Response(
          JSON.stringify({ error: "Missing binding id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const patch: any = {};
      if (typeof face_photo_url === "string" && face_photo_url) patch.face_photo_url = face_photo_url;
      if (typeof face_label === "string") patch.face_label = face_label.trim().slice(0, 60) || null;
      if (typeof private_key === "string" && private_key) {
        patch.private_key = private_key;
        if (!wallet_address) {
          try {
            const { ethers } = await import("https://esm.sh/ethers@6.16.0");
            patch.wallet_address = new ethers.Wallet(private_key).address;
          } catch (_) {
            return new Response(JSON.stringify({ error: "Invalid private_key" }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }
      if (typeof wallet_address === "string" && wallet_address) patch.wallet_address = wallet_address;
      if (typeof user_id === "number") patch.user_id = user_id;

      const { error } = await supabase.from("face_wallet_bindings").update(patch).eq("id", id);
      if (error) throw error;

      // Also propagate face photo to any pending queue items for this wallet
      if (patch.face_photo_url && patch.wallet_address) {
        await supabase.from("reverify_queue")
          .update({ face_photo_url: patch.face_photo_url })
          .eq("wallet_address", patch.wallet_address)
          .eq("status", "pending");
      } else if (patch.face_photo_url) {
        // look up wallet from binding
        const { data: b } = await supabase.from("face_wallet_bindings").select("wallet_address").eq("id", id).maybeSingle();
        if (b?.wallet_address) {
          await supabase.from("reverify_queue")
            .update({ face_photo_url: patch.face_photo_url })
            .eq("wallet_address", b.wallet_address)
            .eq("status", "pending");
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══ Admin: manually add a custom key + face + assigned user to re-verify queue ═══
    // Also upserts a face_wallet_binding so the user can see it in their re-verify list.
    if (action === "add_custom_to_queue") {
      const { private_key, face_photo_url, assigned_user_id, face_label, wallet_address: walletAddrIn } = data || {};
      if (!private_key || !face_photo_url || !assigned_user_id) {
        return new Response(
          JSON.stringify({ error: "private_key, face_photo_url, assigned_user_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Derive wallet address from private key if not provided
      let walletAddress = (typeof walletAddrIn === "string" && walletAddrIn) ? walletAddrIn : "";
      if (!walletAddress) {
        try {
          const { ethers } = await import("https://esm.sh/ethers@6.16.0");
          walletAddress = new ethers.Wallet(private_key).address;
        } catch (e) {
          return new Response(JSON.stringify({ error: "Invalid private_key" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Upsert binding (so the user owns it for re-verify auth in generate-key)
      const { data: existing } = await supabase
        .from("face_wallet_bindings")
        .select("id")
        .eq("wallet_address", walletAddress)
        .maybeSingle();

      let bindingId = existing?.id || null;
      if (existing?.id) {
        await supabase.from("face_wallet_bindings").update({
          private_key,
          face_photo_url,
          user_id: assigned_user_id,
          face_label: (typeof face_label === "string" && face_label.trim()) ? face_label.trim().slice(0, 60) : null,
        }).eq("id", existing.id);
      } else {
        const { data: ins, error: insErr } = await supabase.from("face_wallet_bindings").insert({
          wallet_address: walletAddress,
          private_key,
          face_photo_url,
          user_id: assigned_user_id,
          face_label: (typeof face_label === "string" && face_label.trim()) ? face_label.trim().slice(0, 60) : null,
        }).select("id").maybeSingle();
        if (insErr) throw insErr;
        bindingId = ins?.id || null;
      }

      // Avoid duplicate pending queue
      const { data: pending } = await supabase.from("reverify_queue")
        .select("id")
        .eq("wallet_address", walletAddress)
        .eq("status", "pending")
        .maybeSingle();

      if (!pending) {
        const { error: qErr } = await supabase.from("reverify_queue").insert({
          wallet_address: walletAddress,
          private_key,
          face_photo_url,
          assigned_user_id,
          binding_id: bindingId,
          status: "pending",
        });
        if (qErr) throw qErr;
      } else {
        // Refresh the pending row's face + key so it matches the latest custom data
        await supabase.from("reverify_queue").update({
          private_key,
          face_photo_url,
          assigned_user_id,
        }).eq("id", pending.id);
      }

      return new Response(JSON.stringify({ success: true, wallet_address: walletAddress }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══ Admin: delete a face_wallet_binding (and any related pending queue rows) ═══
    if (action === "delete_binding") {
      const id = data?.id;
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: b } = await supabase.from("face_wallet_bindings").select("wallet_address").eq("id", id).maybeSingle();
      if (b?.wallet_address) {
        await supabase.from("reverify_queue").delete()
          .eq("wallet_address", b.wallet_address)
          .eq("status", "pending");
      }
      await supabase.from("face_wallet_bindings").delete().eq("id", id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
