import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LEXOFFICE_API_KEY = Deno.env.get("LEXOFFICE_API_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

async function sendNewCustomerNotification(customerName: string, customerEmail: string, plan: string) {
  if (!RESEND_API_KEY) return;
  const body = [
    `🎉 Neuer Kunde!`,
    ``,
    `Name: ${customerName || "–"}`,
    `E-Mail: ${customerEmail}`,
    `Plan: ${plan}`,
    `Zeitpunkt: ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`,
  ].join("\n");
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "PPC Tools <noreply@adsmasters.de>",
      to: ["hallo@adsmasters.de"],
      subject: `🎉 Neuer Kunde: ${customerName || customerEmail}`,
      text: body,
    }),
  });
}

async function createLexOfficeInvoice(customerName: string, customerEmail: string, periodLabel: string, periodStartDate?: Date, periodEndDate?: Date): Promise<string | null> {
  if (!LEXOFFICE_API_KEY) return null;
  const start = periodStartDate || new Date();
  const end = periodEndDate || new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  const body = {
    voucherDate: start.toISOString(),
    address: { name: customerName || customerEmail, countryCode: "DE" },
    lineItems: [{
      type: "custom",
      name: "AdsMasters PPC Tools – Professional",
      description: periodLabel,
      quantity: 1,
      unitName: "Monat",
      unitPrice: { currency: "EUR", netAmount: 99.00, taxRatePercentage: 19 },
      discountPercentage: 0,
    }],
    taxConditions: { taxType: "net" },
    paymentConditions: { paymentTermLabel: "Sofort fällig", paymentTermDuration: 0 },
    shippingConditions: {
      shippingDate: start.toISOString(),
      shippingEndDate: end.toISOString(),
      shippingType: "serviceperiod",
    },
    totalPrice: { currency: "EUR" },
    title: "Rechnung",
  };
  const res = await fetch("https://api.lexoffice.io/v1/invoices?finalize=true", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LEXOFFICE_API_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("[LexOffice] Invoice creation failed:", JSON.stringify(data));
    return null;
  }
  console.log("[LexOffice] Invoice created:", data.id);
  return data.id as string;
}

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

      const periodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // fallback: +30 days

      const periodStart = sub.current_period_start
        ? new Date(sub.current_period_start * 1000)
        : new Date();

      // Upsert subscription
      await sb.from("ppc_subscriptions").upsert({
        user_id: userId,
        stripe_subscription_id: subscriptionId,
        plan: plan,
        status: "active",
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      // Store customer ID in profile
      if (session.customer) {
        await sb.from("ppc_profiles").update({ stripe_customer_id: session.customer }).eq("user_id", userId);
      }

      console.log(`[PPC Webhook] Subscription activated: ${userId} -> ${plan}`);

      // Notify AdsMasters about new customer
      const notifyEmail = session.customer_details?.email || session.customer_email || "";
      const notifyName = session.custom_fields?.find((f: { key: string }) => f.key === "company_name")?.text?.value || session.customer_details?.name || "";
      await sendNewCustomerNotification(notifyName, notifyEmail, plan);

      // Create LexOffice invoice for first payment
      // Prefer company name from custom_fields, fall back to customer name
      const companyField = session.custom_fields?.find((f: { key: string }) => f.key === "company_name");
      const companyName = companyField?.text?.value || session.customer_details?.name || "";
      const customerName = companyName;
      const customerEmail = session.customer_details?.email || session.customer_email || "";

      // Save company name to ppc_profiles for future use
      if (companyName) {
        await sb.from("ppc_profiles").update({ company_name: companyName }).eq("user_id", userId);
      }
      const periodStartStr = periodStart.toLocaleDateString("de-DE");
      const periodEndStr = new Date(periodEnd).toLocaleDateString("de-DE");
      const periodLabel = `Abonnement ${periodStartStr} – ${periodEndStr}`;
      const lexInvoiceId = await createLexOfficeInvoice(customerName, customerEmail, periodLabel, periodStart, new Date(periodEnd));
      if (lexInvoiceId) {
        await sb.from("ppc_invoices").insert({
          user_id: userId,
          lexoffice_invoice_id: lexInvoiceId,
          amount_net: 99.00,
          amount_gross: 117.81,
          period_label: periodLabel,
        });
      }
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

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      // Skip the first invoice (already handled by checkout.session.completed)
      if (invoice.billing_reason === "subscription_create") {
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const customerEmail = invoice.customer_email || "";
      // Look up company name from ppc_profiles (saved at checkout)
      const { data: subRowForInvoice } = await sb.from("ppc_subscriptions")
        .select("user_id")
        .eq("stripe_subscription_id", invoice.subscription)
        .single();
      let customerName = invoice.customer_name || "";
      if (subRowForInvoice?.user_id) {
        const { data: profileForInvoice } = await sb.from("ppc_profiles")
          .select("company_name")
          .eq("user_id", subRowForInvoice.user_id)
          .single();
        if (profileForInvoice?.company_name) customerName = profileForInvoice.company_name;
      }
      const periodStart = new Date(invoice.lines?.data?.[0]?.period?.start * 1000).toLocaleDateString("de-DE");
      const periodEnd = new Date(invoice.lines?.data?.[0]?.period?.end * 1000).toLocaleDateString("de-DE");
      const recurringLabel = `Abonnement ${periodStart} – ${periodEnd}`;
      const recurringStart = new Date(invoice.lines?.data?.[0]?.period?.start * 1000);
      const recurringEnd = new Date(invoice.lines?.data?.[0]?.period?.end * 1000);
      const recurringLexId = await createLexOfficeInvoice(customerName, customerEmail, recurringLabel, recurringStart, recurringEnd);
      if (recurringLexId && subRowForInvoice?.user_id) {
        await sb.from("ppc_invoices").insert({
          user_id: subRowForInvoice.user_id,
          lexoffice_invoice_id: recurringLexId,
          amount_net: 99.00,
          amount_gross: 117.81,
          period_label: recurringLabel,
        });
      }
      console.log(`[PPC Webhook] Recurring invoice created for ${customerEmail}`);
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const customerId = charge.customer;
      if (!customerId) {
        return new Response(JSON.stringify({ received: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Find user by stripe_customer_id
      const { data: profile } = await sb.from("ppc_profiles")
        .select("user_id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (!profile?.user_id) {
        console.log(`[PPC Webhook] No user found for customer ${customerId}`);
        return new Response(JSON.stringify({ received: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Find the most recent LexOffice invoice for this user
      const { data: invoiceRow } = await sb.from("ppc_invoices")
        .select("lexoffice_invoice_id, period_label, amount_net")
        .eq("user_id", profile.user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!invoiceRow?.lexoffice_invoice_id) {
        console.log(`[PPC Webhook] No LexOffice invoice found for user ${profile.user_id}`);
        return new Response(JSON.stringify({ received: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get customer name for credit note
      const { data: profileFull } = await sb.from("ppc_profiles")
        .select("company_name")
        .eq("user_id", profile.user_id)
        .single();
      const customerName = profileFull?.company_name || "Kunde";

      // Create LexOffice credit note (Gutschrift) as counter-booking
      // Note: LexOffice API v1 has no cancel endpoint for finalized invoices.
      // The credit note offsets the amount; manual storno in LexOffice UI is required to change invoice status.
      const now = new Date().toISOString();
      const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const creditNoteRes = await fetch("https://api.lexoffice.io/v1/credit-notes?finalize=true", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LEXOFFICE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          relatedVouchers: [{ id: invoiceRow.lexoffice_invoice_id, voucherType: "invoice" }],
          voucherDate: now,
          address: { name: customerName, countryCode: "DE" },
          lineItems: [{
            type: "custom",
            name: "Storno: AdsMasters PPC Tools – Professional",
            description: invoiceRow.period_label || "",
            quantity: 1,
            unitName: "Monat",
            unitPrice: { currency: "EUR", netAmount: invoiceRow.amount_net || 99.00, taxRatePercentage: 19 },
            discountPercentage: 0,
          }],
          taxConditions: { taxType: "net" },
          shippingConditions: { shippingDate: now, shippingEndDate: endDate, shippingType: "serviceperiod" },
          totalPrice: { currency: "EUR" },
          title: "Gutschrift",
        }),
      });

      if (creditNoteRes.ok) {
        const creditNote = await creditNoteRes.json();
        console.log(`[PPC Webhook] Credit note created: ${creditNote.id} for user ${profile.user_id}`);
      } else {
        const err = await creditNoteRes.json();
        console.error("[PPC Webhook] Credit note failed:", JSON.stringify(err));
      }
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
