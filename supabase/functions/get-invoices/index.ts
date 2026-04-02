import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LEXOFFICE_API_KEY = Deno.env.get("LEXOFFICE_API_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Handle PDF download: GET /get-invoices?invoiceId=xxx
  const url = new URL(req.url);
  const invoiceId = url.searchParams.get("invoiceId");

  try {
    const authHeader = req.headers.get("Authorization");
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader?.replace("Bearer ", "") || "";
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Nicht eingeloggt" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PDF download mode
    if (invoiceId) {
      // Verify the invoice belongs to this user
      const { data: inv } = await sb.from("ppc_invoices")
        .select("lexoffice_invoice_id")
        .eq("user_id", user.id)
        .eq("lexoffice_invoice_id", invoiceId)
        .single();
      if (!inv) {
        return new Response(JSON.stringify({ error: "Rechnung nicht gefunden" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Get document file ID from LexOffice
      const docRes = await fetch(`https://api.lexoffice.io/v1/invoices/${invoiceId}/document`, {
        headers: { Authorization: `Bearer ${LEXOFFICE_API_KEY}` },
      });
      const docData = await docRes.json();
      if (!docData.documentFileId) {
        return new Response(JSON.stringify({ error: "PDF nicht verfügbar" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Stream PDF
      const pdfRes = await fetch(`https://api.lexoffice.io/v1/files/${docData.documentFileId}`, {
        headers: { Authorization: `Bearer ${LEXOFFICE_API_KEY}` },
      });
      const pdfBuffer = await pdfRes.arrayBuffer();
      return new Response(pdfBuffer, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="Rechnung-${invoiceId}.pdf"`,
        },
      });
    }

    // List mode: return all invoices for this user
    const { data: invoices, error: dbError } = await sb.from("ppc_invoices")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (dbError) {
      return new Response(JSON.stringify({ error: dbError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ invoices: invoices || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
