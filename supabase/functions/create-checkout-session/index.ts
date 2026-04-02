import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// TODO: Replace with actual Stripe Price IDs after creating products in Stripe Dashboard
const PRICE_IDS: Record<string, string> = {
  starter: Deno.env.get("STRIPE_PRICE_STARTER") || "price_starter_TODO",
  professional: Deno.env.get("STRIPE_PRICE_PROFESSIONAL") || "price_professional_TODO",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function stripePost(path: string, body: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  return res.json();
}

async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET}` },
  });
  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify auth via Supabase getUser (works without gateway JWT verification)
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") || "";
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Nicht eingeloggt. Bitte neu anmelden." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse plan
    const { plan } = await req.json();
    if (!plan || !PRICE_IDS[plan]) {
      return new Response(JSON.stringify({ error: "Invalid plan. Use 'starter' or 'professional'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find or create Stripe customer
    const { data: profile } = await sb.from("ppc_profiles").select("stripe_customer_id, company_name").eq("user_id", user.id).single();
    let customerId = profile?.stripe_customer_id;
    const companyName = profile?.company_name || "";

    if (!customerId) {
      // Search by email first
      const searchRes = await stripeGet(`/customers/search?query=email:'${user.email}'`);
      if (searchRes.data && searchRes.data.length > 0) {
        customerId = searchRes.data[0].id;
      } else {
        const customer = await stripePost("/customers", {
          email: user.email || "",
          name: companyName,
          "metadata[user_id]": user.id,
          "metadata[source]": "ppc_tools",
        });
        customerId = customer.id;
      }
      // Save to profile
      await sb.from("ppc_profiles").update({ stripe_customer_id: customerId }).eq("user_id", user.id);
    } else if (companyName) {
      // Update existing customer with company name
      await stripePost(`/customers/${customerId}`, { name: companyName });
    }

    // Create checkout session
    const priceId = PRICE_IDS[plan];
    console.log("[Checkout] Plan:", plan, "Price ID:", priceId, "Customer:", customerId);

    const session = await stripePost("/checkout/sessions", {
      customer: customerId,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      mode: "subscription",
      billing_address_collection: "required",
      "customer_update[address]": "auto",
      "customer_update[name]": "auto",
      "custom_fields[0][key]": "company_name",
      "custom_fields[0][label][type]": "custom",
      "custom_fields[0][label][custom]": "Unternehmensname",
      "custom_fields[0][type]": "text",
      "custom_fields[0][optional]": "false",
      success_url: "https://adsmasters.github.io/ppc-tools-app/dashboard.html?checkout=success",
      cancel_url: "https://adsmasters.github.io/ppc-tools-app/pricing.html",
      "metadata[user_id]": user.id,
      "metadata[plan]": plan,
      "subscription_data[metadata][user_id]": user.id,
      "subscription_data[metadata][plan]": plan,
    });

    console.log("[Checkout] Stripe response:", JSON.stringify(session));

    if (session.error) {
      return new Response(JSON.stringify({ error: session.error.message || session.error.type }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!session.url) {
      return new Response(JSON.stringify({ error: "Stripe hat keine Checkout-URL zurückgegeben", debug: session }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
