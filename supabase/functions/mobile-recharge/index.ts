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

    // Get rates from settings (BDT + USDT are one shared earning pool)
    const { data: settingsRows } = await adminClient
      .from("settings")
      .select("key, value")
      .in("key", ["rewardRate", "usdtToBdtRate"]);
    const settingsMap: Record<string, string> = {};
    settingsRows?.forEach((s: any) => { settingsMap[s.key] = s.value; });
    const RATE = parseInt(settingsMap.rewardRate || "40", 10) || 40;
    const USDT_TO_BDT = parseFloat(settingsMap.usdtToBdtRate || "124") || 124;
    const USDT_RATE = +(RATE / USDT_TO_BDT).toFixed(6);
    const keysNeeded = Math.ceil(amount / RATE);

    if (!userId) {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch current shared wallet state from DB (server-side truth)
    const { data: userData, error: userError } = await adminClient
      .from("users")
      .select("reverify_count, usdt_paid_count, referral_usdt_earnings, display_name")
      .eq("id", userId)
      .single();

    if (userError || !userData) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: spendRows } = await adminClient
      .from("transactions")
      .select("id, amount, type, status")
      .eq("user_id", userId)
      .in("type", ["withdrawal", "recharge"])
      .in("status", ["pending", "processing", "completed"]);
    const spentBdt = (spendRows || [])
      .filter((tx: any) => !transactionId || tx.id !== transactionId)
      .reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0);
    const availableCount = Math.max(0, Number(userData.reverify_count || 0) - Number(userData.usdt_paid_count || 0));
    const referralUsdt = Number(userData.referral_usdt_earnings || 0);
    const availableBdt = Math.max(0, Math.floor((availableCount * USDT_RATE + referralUsdt) * USDT_TO_BDT) - spentBdt);

    if (availableBdt < amount) {
      console.error(`BLOCKED: User ${userId} (${userData.display_name}) tried recharge ${amount} TK but available shared balance is ${availableBdt} TK`);
      return new Response(JSON.stringify({
        error: `পর্যাপ্ত ব্যালেন্স নেই। প্রয়োজন: ${amount}৳, আছে: ${availableBdt}৳`
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        const afterKeys = userData.reverify_count - keysNeeded;
        await adminClient.from("transactions").update({
          status: "completed",
          details: `📱 ${OPERATOR_MAP[operator]} রিচার্জ সফল: ${phone} | ${amount} TK | TrxID: ${trxid} | Re-verify: ${userData.reverify_count} → ${afterKeys}`,
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
      // Failed - refund re-verify count (already deducted server-side)
      const { data: currentUser } = await adminClient.from("users").select("reverify_count").eq("id", userId).single();
      if (currentUser) {
        await adminClient.from("users").update({ reverify_count: currentUser.reverify_count + keysNeeded }).eq("id", userId);
      }

      // Mark transaction failed
      if (transactionId) {
        await adminClient.from("transactions").update({
          status: "failed",
          details: `📱 ${OPERATOR_MAP[operator]} রিচার্জ ব্যর্থ: ${phone} | ${amount} TK | ${topupData.message || "Unknown error"} | Re-verify রিফান্ড হয়েছে`,
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
