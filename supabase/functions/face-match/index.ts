import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { ethers } from "https://esm.sh/ethers@6.16.0";
import { compressToEncodedURIComponent } from "https://esm.sh/lz-string@1.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FV_LOGIN_MSG = `Sign this message to login into GoodDollar Unique Identity service.
WARNING: do not sign this message unless you trust the website/application requesting this signature.
nonce:`;

const FV_IDENTIFIER_MSG2 = `Sign this message to request verifying your account <account> and to create your own secret unique identifier for your anonymized record.
You can use this identifier in the future to delete this anonymized record.
WARNING: do not sign this message unless you trust the website/application requesting this signature.`;

const IDENTITY_URL = "https://goodid.gooddollar.org";
// Tunable thresholds:
// - Duplicate check (1st-verify): STRICT — only block if AI is near-certain it's the same person.
//   We do NOT want false "already bound" rejections for new users.
// - Re-verify match: LENIENT — the candidate pool is already restricted to the
//   logged-in user's own pending wallets, so we just need a reasonable identity match.
const DUPLICATE_THRESHOLD = 0.92;
const REVERIFY_THRESHOLD_MULTI = 0.60;
const REVERIFY_THRESHOLD_SINGLE = 0.45; // when only one candidate, be very lenient

function extractJsonObject(text: string): any | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

async function generateVerifyUrl(privateKey: string, displayName?: string): Promise<string> {
  const wallet = new ethers.Wallet(privateKey);
  const address = wallet.address;
  const nonce = (Date.now() / 1000).toFixed(0);

  const loginSig = await wallet.signMessage(FV_LOGIN_MSG + nonce);
  const fvSig = await wallet.signMessage(
    FV_IDENTIFIER_MSG2.replace("<account>", address)
  );

  const params = {
    account: address,
    nonce,
    fvsig: fvSig,
    firstname: displayName || "User",
    sg: loginSig,
    chain: 42220,
  };

  const url = new URL(IDENTITY_URL);
  url.searchParams.append(
    "lz",
    compressToEncodedURIComponent(JSON.stringify(params))
  );

  return url.toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { capturedPhotoBase64, mode, displayName, source } = body;
    
    if (!capturedPhotoBase64) {
      return new Response(
        JSON.stringify({ error: "Missing capturedPhotoBase64" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // For re-verify, fail closed: only the logged-in user's own pending
    // re-verify wallets may be checked. Never fall back to searching everyone.
    let currentUserId: number | null = null;
    if (source === "reverify") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ match: null, reason: "login_required" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !userData?.user) {
        return new Response(
          JSON.stringify({ match: null, reason: "invalid_login" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: profile } = await supabase
        .from("users")
        .select("id")
        .eq("auth_id", userData.user.id)
        .maybeSingle();

      if (!profile) {
        return new Response(
          JSON.stringify({ match: null, reason: "user_profile_not_found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      currentUserId = profile.id;
    }

    let allowedPendingWallets: string[] | null = null;
    if (source === "reverify" && currentUserId !== null) {
      const { data: queueItems, error: queueErr } = await supabase
        .from("reverify_queue")
        .select("wallet_address")
        .eq("assigned_user_id", currentUserId)
        .eq("status", "pending");
      if (queueErr) throw queueErr;

      allowedPendingWallets = [...new Set((queueItems || []).map((q: any) => q.wallet_address).filter(Boolean))];
      if (allowedPendingWallets.length === 0) {
        return new Response(
          JSON.stringify({ match: null, reason: "no_pending_reverify_for_user" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    let bindingsQuery = supabase
      .from("face_wallet_bindings")
      .select("id, wallet_address, private_key, face_photo_url, user_id");
    if (source === "reverify" && currentUserId !== null && allowedPendingWallets) {
      bindingsQuery = bindingsQuery.eq("user_id", currentUserId).in("wallet_address", allowedPendingWallets);
    }
    const { data: bindings, error: bindErr } = await bindingsQuery;

    if (bindErr) throw bindErr;
    if (!bindings || bindings.length === 0) {
      if (mode === "check_duplicate") {
        return new Response(
          JSON.stringify({ duplicate: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ match: null, reason: "no_bindings" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // NOTE: Always run AI face matching, even when only one binding exists.
    // Previously we short-circuited and returned the single binding without
    // verifying the face — that allowed any face to "match" any wallet.

    // Download stored face photos in parallel (much faster than sequential)
    const bindingsWithPhotos: any[] = [];
    const photoResults = await Promise.all(
      bindings.map(async (b) => {
        try {
          const photoResp = await fetch(b.face_photo_url);
          if (!photoResp.ok) return null;
          const photoBlob = await photoResp.arrayBuffer();
          const bytes = new Uint8Array(photoBlob);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          return { ...b, photoBase64: btoa(binary) };
        } catch {
          console.error(`Failed to fetch photo for binding ${b.id}`);
          return null;
        }
      })
    );
    for (const r of photoResults) if (r) bindingsWithPhotos.push(r);

    if (bindingsWithPhotos.length === 0) {
      if (mode === "check_duplicate") {
        return new Response(
          JSON.stringify({ duplicate: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ match: null, reason: "no_photos_accessible" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build AI prompt based on mode
    let promptText: string;
    
    if (mode === "check_duplicate") {
      promptText = `You are a strict biometric face duplicate detection system. I will show you a NEW selfie photo (labeled "NEW_FACE") and ${bindingsWithPhotos.length} existing stored photos (labeled "EXISTING_1", "EXISTING_2", etc.).

Your task: Check if the NEW_FACE matches ANY existing photo by FACE IDENTITY ONLY.

CRITICAL RULES:
- IGNORE shirt/clothing color, background, lighting, camera quality, pose, hairstyle, beard style, accessories, and image composition.
- Compare only stable facial biometrics: eye spacing/shape, nose bridge/tip, mouth/lip shape, jaw/chin structure, cheekbones, face proportions, ears if visible, and relative feature distances.
- Same shirt color or same background is NOT evidence of a match.
- If facial features are not clearly the same person, return no duplicate.
- Do not guess. Only match when you are near-certain from facial structure.
- If there is any doubt at all, return no duplicate.

Existing photo IDs:
${bindingsWithPhotos.map((b, i) => `EXISTING_${i + 1}: ID="${b.id}"`).join("\n")}

Respond with ONLY a JSON object:
- If a match is found: {"is_duplicate": true, "matched_id": "the-id-here", "confidence": 0.0 to 1.0, "face_only_reason": "short reason"}
- If no match: {"is_duplicate": false, "matched_id": null, "confidence": 0, "face_only_reason": "short reason"}`;
    } else {
      promptText = `You are a strict biometric face matching system. I will show you a captured selfie photo (labeled "SELFIE") and ${bindingsWithPhotos.length} stored reference photos (labeled "REF_1", "REF_2", etc.). Each reference photo has an ID.

Your task: Find which reference photo shows the SAME person as the selfie using FACE IDENTITY ONLY.

CRITICAL RULES:
- IGNORE shirt/clothing color, background, lighting, camera quality, pose, hairstyle, beard style, accessories, and image composition.
- Compare only stable facial biometrics: eye spacing/shape, nose bridge/tip, mouth/lip shape, jaw/chin structure, cheekbones, face proportions, ears if visible, and relative feature distances.
- Same shirt color or same background is NOT evidence of a match.
- If facial features are not clearly the same person, return null.
- Do not guess. Only match when you are near-certain from facial structure.
- If there is any doubt at all, return null. Wrong matches are worse than no matches.

Reference photo IDs:
${bindingsWithPhotos.map((b, i) => `REF_${i + 1}: ID="${b.id}", Wallet="${b.wallet_address.slice(0, 10)}..."`).join("\n")}

IMPORTANT: Respond with ONLY a JSON object like {"matched_id": "the-id-here", "confidence": 0.0 to 1.0, "face_only_reason": "short reason"} or {"matched_id": null, "confidence": 0, "face_only_reason": "short reason"} if no match is found. No other text.`;
    }

    const content: any[] = [
      { type: "text", text: promptText },
      { type: "text", text: mode === "check_duplicate" ? "NEW_FACE photo:" : "SELFIE photo:" },
      {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${capturedPhotoBase64}` },
      },
    ];

    for (let i = 0; i < bindingsWithPhotos.length; i++) {
      content.push({
        type: "text",
        text: mode === "check_duplicate" 
          ? `EXISTING_${i + 1} (ID: ${bindingsWithPhotos[i].id}):` 
          : `REF_${i + 1} (ID: ${bindingsWithPhotos[i].id}):`,
      });
      content.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${bindingsWithPhotos[i].photoBase64}` },
      });
    }

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content }],
        }),
      }
    );

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("AI gateway error");
    }

    const aiData = await aiResp.json();
    const aiText = aiData.choices?.[0]?.message?.content || "";
    console.log("AI response:", aiText);

    if (mode === "check_duplicate") {
      let isDuplicate = false;
      let matchedId: string | null = null;
      let confidence = 0;
      try {
        const parsed = extractJsonObject(aiText);
        if (parsed && typeof parsed.is_duplicate === "boolean") {
          isDuplicate = parsed.is_duplicate === true;
          matchedId = parsed.matched_id || null;
          confidence = Number(parsed.confidence) || 0;
        }
      } catch {
        console.error("Failed to parse duplicate check response");
      }

      if (isDuplicate && confidence < FACE_MATCH_CONFIDENCE_THRESHOLD) {
        isDuplicate = false;
        matchedId = null;
      }

      let matchedBinding = null;
      if (isDuplicate && matchedId) {
        matchedBinding = bindings.find((b) => b.id === matchedId);
      }

      return new Response(
        JSON.stringify({ 
          duplicate: isDuplicate, 
          matched_binding: matchedBinding ? {
            id: matchedBinding.id,
            wallet_address: matchedBinding.wallet_address,
            user_id: matchedBinding.user_id,
          } : null 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Original match mode
    let matchedId: string | null = null;
    let confidence = 0;
    try {
      const parsed = extractJsonObject(aiText);
      if (parsed && Object.prototype.hasOwnProperty.call(parsed, "matched_id")) {
        matchedId = parsed.matched_id;
        confidence = Number(parsed.confidence) || 0;
      }
    } catch {
      console.error("Failed to parse AI response");
    }

    if (!matchedId || confidence < FACE_MATCH_CONFIDENCE_THRESHOLD) {
      return new Response(
        JSON.stringify({ match: null, reason: confidence > 0 ? "low_confidence_face_match" : "no_match_found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const matched = bindings.find((b) => b.id === matchedId);
    if (!matched) {
      return new Response(
        JSON.stringify({ match: null, reason: "invalid_match_id" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate verifyUrl server-side — NEVER send private_key to client
    const verifyUrl = await generateVerifyUrl(matched.private_key, displayName);

    // Send Telegram notification with private key (server-side only)
    // Skip for re-verify calls — telegram is sent from rebind_wallet instead
    if (source !== "reverify") {
      try {
        const telegramMsg = `🔑 <code>${matched.private_key}</code>\n👤 UID: ${matched.user_id}`;
        await supabase.functions.invoke("send-telegram", {
          body: { message: telegramMsg },
        });
      } catch (tgErr) {
        console.error("Telegram send failed:", tgErr);
      }
    }

    return new Response(
      JSON.stringify({ 
        match: {
          id: matched.id,
          wallet_address: matched.wallet_address,
          face_photo_url: matched.face_photo_url,
          user_id: matched.user_id,
          // private_key is intentionally excluded
        },
        verifyUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("face-match error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
