import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { type, subject, message, what, why, output, tool } = body;

    // Get user plan
    const { data: sub } = await sb.from("ppc_subscriptions")
      .select("plan")
      .eq("user_id", user.id)
      .single();
    const plan = sub?.plan || "kein Abo";

    // Get company name
    const { data: profile } = await sb.from("ppc_profiles")
      .select("company_name")
      .eq("user_id", user.id)
      .single();
    const company = profile?.company_name || "";

    let emailTo: string;
    let emailSubject: string;
    let emailBody: string;

    if (type === "feature_request") {
      emailTo = "hi@adsmasters.de";
      emailSubject = `[Feature Request] ${what?.substring(0, 80) || "Neuer Wunsch"}`;
      emailBody = [
        `FEATURE REQUEST`,
        ``,
        `Von: ${company ? company + " — " : ""}${user.email}`,
        `Plan: ${plan}`,
        `Tool: ${tool || "Allgemein"}`,
        ``,
        `WAS: ${what}`,
        ``,
        `WARUM: ${why}`,
        ``,
        `ERWARTETER OUTPUT: ${output}`,
      ].join("\n");
    } else {
      emailTo = "hi@adsmasters.de";
      emailSubject = `[PPC Tools Support] ${subject || "Neue Anfrage"}`;
      emailBody = [
        `SUPPORT-ANFRAGE`,
        ``,
        `Von: ${company ? company + " — " : ""}${user.email}`,
        `Plan: ${plan}`,
        `Betreff: ${subject}`,
        ``,
        `${message}`,
      ].join("\n");
    }

    // Send via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "PPC Tools <noreply@adsmasters.de>",
        to: [emailTo],
        reply_to: user.email,
        subject: emailSubject,
        text: emailBody,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error("[send-contact] Resend error:", result);
      return new Response(JSON.stringify({ error: "E-Mail konnte nicht gesendet werden" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send-contact] Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
