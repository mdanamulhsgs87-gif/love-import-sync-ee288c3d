import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  guest_id: z.string().min(11).max(20),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Server configuration missing");
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { guest_id } = parsed.data;

    const { data: appUser, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, auth_id, email")
      .eq("guest_id", guest_id)
      .maybeSingle();

    if (userError) throw userError;
    if (!appUser?.auth_id) {
      return new Response(JSON.stringify({ email: appUser?.email || "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: authUserData, error: authError } = await supabaseAdmin.auth.admin.getUserById(appUser.auth_id);
    if (authError) throw authError;

    const authEmail = authUserData.user?.email || "";

    if (authEmail && authEmail !== appUser.email) {
      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update({ email: authEmail })
        .eq("id", appUser.id);

      if (updateError) throw updateError;
    }

    return new Response(JSON.stringify({ email: authEmail || appUser.email || "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});