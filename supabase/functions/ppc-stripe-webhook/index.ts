import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    // Verify webhook signature if secret is set
    if (STRIPE_WEBHOOK_SECRET && sig) {
      const crypto = globalThis.crypto;
      const parts = sig.split(",").reduce((acc: Record<string, string>, part: string) => {
        const [key, val] = part.split("=");
        acc[key] = val;
        return acc;
      }, {});
      const timestamp = parts["t"];
      const signedPayload = `${timestamp}.${body}`;
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(STRIPE_WEBHOOK_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
      const expectedSig = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
      if (expectedSig !== parts["v1"]) {
        console.error("Webhook signature verification failed");
        return new Response("Invalid signature", { status: 400 });
      }
    }

    const event = JSON.parse(body);
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    console.log(`[PPC Webhook] Event: ${event.type}`);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      const plan = session.metadata?.plan;
      const subscriptionId = session.subscription;

      if (!userId || !plan) {
        console.error("Missing metadata in checkout session");
        return new Response("Missing metadata", { status: 400 });
      }

      // Get subscription details for period end
      const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
        headers: { Authorization: `Bearer ${STRIPE_SECRET}` },
      });
      const sub = await subRes.json();

      // Upsert subscription
      await sb.from("ppc_subscriptions").upsert({
        user_id: userId,
        stripe_subscription_id: subscriptionId,
        plan: plan,
        status: "active",
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      // Store customer ID in profile
      if (session.customer) {
        await sb.from("ppc_profiles").update({ stripe_customer_id: session.customer }).eq("user_id", userId);
      }

      console.log(`[PPC Webhook] Subscription activated: ${userId} -> ${plan}`);
    }

    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id;
      if (!userId) return new Response("ok", { status: 200 });

      const status = sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : "inactive";

      await sb.from("ppc_subscriptions").update({
        status,
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);

      console.log(`[PPC Webhook] Subscription updated: ${userId} -> ${status}`);
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id;
      if (!userId) return new Response("ok", { status: 200 });

      await sb.from("ppc_subscriptions").update({
        status: "canceled",
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);

      console.log(`[PPC Webhook] Subscription canceled: ${userId}`);
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;
      if (!subscriptionId) return new Response("ok", { status: 200 });

      // Find user by subscription ID
      const { data: subRow } = await sb.from("ppc_subscriptions")
        .select("user_id")
        .eq("stripe_subscription_id", subscriptionId)
        .single();

      if (subRow) {
        await sb.from("ppc_subscriptions").update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        }).eq("user_id", subRow.user_id);

        console.log(`[PPC Webhook] Payment failed: ${subRow.user_id}`);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[PPC Webhook] Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
