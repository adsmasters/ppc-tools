import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LEXOFFICE_API_KEY = Deno.env.get("LEXOFFICE_API_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

async function sendEmail(to: string, subject: string, text: string) {
  if (!RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "AdsMasters PPC Tools <noreply@adsmasters.de>",
      to: [to],
      subject,
      text,
    }),
  });
}

async function sendNewCustomerNotification(customerName: string, customerEmail: string, plan: string) {
  const body = [
    `🎉 Neuer Kunde!`,
    ``,
    `Name: ${customerName || "–"}`,
    `E-Mail: ${customerEmail}`,
    `Plan: ${plan}`,
    `Zeitpunkt: ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`,
  ].join("\n");
  await sendEmail("hallo@adsmasters.de", `🎉 Neuer Kunde: ${customerName || customerEmail}`, body);
}

async function sendWelcomeEmail(customerEmail: string, customerName: string, periodEnd: string) {
  const body = [
    `Hallo${customerName ? " " + customerName : ""},`,
    ``,
    `dein Zugang zu den AdsMasters PPC Tools ist jetzt aktiv! 🎉`,
    ``,
    `Du kannst dich ab sofort hier einloggen:`,
    `https://adsmasters.github.io/ppc-tools-app/login.html`,
    ``,
    `Dein Abo läuft monatlich und verlängert sich automatisch.`,
    `Aktuelle Abrechnungsperiode bis: ${periodEnd}`,
    ``,
    `Bei Fragen erreichst du uns jederzeit über das Kontaktformular im Tool`,
    `oder direkt per E-Mail an hallo@adsmasters.de.`,
    ``,
    `Viel Erfolg mit deinen Kampagnen!`,
    `Dein AdsMasters Team`,
  ].join("\n");
  await sendEmail(customerEmail, "Dein Zugang zu den AdsMasters PPC Tools ist aktiv", body);
}

interface BillingAddress { street?: string; zip?: string; city?: string; country?: string; }

async function createLexOfficeInvoice(customerName: string, customerEmail: string, periodLabel: string, periodStartDate?: Date, periodEndDate?: Date, billingAddress?: BillingAddress): Promise<string | null> {
  if (!LEXOFFICE_API_KEY) return null;
  const start = periodStartDate || new Date();
  const end = periodEndDate || new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  const address: Record<string, string> = { name: customerName || customerEmail, countryCode: billingAddress?.country || "DE" };
  if (billingAddress?.street) address.street = billingAddress.street;
  if (billingAddress?.zip) address.zip = billingAddress.zip;
  if (billingAddress?.city) address.city = billingAddress.city;
  const body = {
    voucherDate: start.toISOString(),
    address,
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

      // Check if this is a returning customer (had subscription before)
      const { data: existingSub } = await sb.from("ppc_subscriptions")
        .select("status")
        .eq("user_id", userId)
        .single();
      const isReturningCustomer = !!existingSub;

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

      console.log(`[PPC Webhook] Subscription activated: ${userId} -> ${plan} (returning: ${isReturningCustomer})`);

      const notifyEmail = session.customer_details?.email || session.customer_email || "";
      const notifyName = session.custom_fields?.find((f: { key: string }) => f.key === "company_name")?.text?.value || session.customer_details?.name || "";
      const periodEndStr = new Date(periodEnd).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

      if (isReturningCustomer) {
        // Returning customer: send reactivation notice only
        await sendEmail("hallo@adsmasters.de", `🔄 Reaktivierung: ${notifyName || notifyEmail}`, [
          `Bestehendes Abo reaktiviert`,
          ``,
          `Kunde: ${notifyName || "–"}`,
          `E-Mail: ${notifyEmail}`,
          `Plan: ${plan}`,
          `Neuer Abrechnungszeitraum bis: ${periodEndStr}`,
        ].join("\n"));
        await sendEmail(notifyEmail, "Dein AdsMasters PPC Tools Abo ist wieder aktiv", [
          `Hallo${notifyName ? " " + notifyName : ""},`,
          ``,
          `dein Abo ist wieder aktiv! Du hast ab sofort wieder vollen Zugriff auf alle PPC Tools.`,
          ``,
          `Abrechnungszeitraum bis: ${periodEndStr}`,
          ``,
          `https://adsmasters.github.io/ppc-tools-app/dashboard.html`,
          ``,
          `Dein AdsMasters Team`,
        ].join("\n"));
      } else {
        // New customer: send welcome email + admin notification
        await sendNewCustomerNotification(notifyName, notifyEmail, plan);
        await sendWelcomeEmail(notifyEmail, notifyName, periodEndStr);
      }

      // Create LexOffice invoice for first payment
      // Prefer company name from custom_fields, fall back to customer name
      const companyField = session.custom_fields?.find((f: { key: string }) => f.key === "company_name");
      const companyName = companyField?.text?.value || session.customer_details?.name || "";
      const customerName = companyName;
      const customerEmail = session.customer_details?.email || session.customer_email || "";

      // Extract billing address from checkout session
      const addr = session.customer_details?.address;
      const billingAddress: BillingAddress = {
        street: addr?.line1 || "",
        zip: addr?.postal_code || "",
        city: addr?.city || "",
        country: addr?.country || "DE",
      };

      // Save company name and billing address to ppc_profiles for future use
      await sb.from("ppc_profiles").update({
        ...(companyName ? { company_name: companyName } : {}),
        billing_street: billingAddress.street,
        billing_zip: billingAddress.zip,
        billing_city: billingAddress.city,
        billing_country: billingAddress.country,
      }).eq("user_id", userId);

      const periodStartStr = periodStart.toLocaleDateString("de-DE");
      const periodLabel = `Abonnement ${periodStartStr} – ${periodEndStr}`;
      const lexInvoiceId = await createLexOfficeInvoice(customerName, customerEmail, periodLabel, periodStart, new Date(periodEnd), billingAddress);
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
      let userId = sub.metadata?.user_id;

      // Fallback: look up user by stripe_subscription_id if metadata missing
      if (!userId) {
        const { data: subRow } = await sb.from("ppc_subscriptions")
          .select("user_id")
          .eq("stripe_subscription_id", sub.id)
          .single();
        userId = subRow?.user_id;
      }
      if (!userId) return new Response("ok", { status: 200 });

      const status = sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : "cancelled";
      const periodEnd = new Date(sub.current_period_end * 1000);

      await sb.from("ppc_subscriptions").update({
        status,
        current_period_end: periodEnd.toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);

      console.log(`[PPC Webhook] Subscription updated: ${userId} -> ${status}`);

      // If customer just set cancel_at_period_end → send cancellation notice
      const prev = event.data.previous_attributes;
      if (sub.cancel_at_period_end === true && prev?.cancel_at_period_end === false) {
        const { data: profile } = await sb.from("ppc_profiles").select("company_name").eq("user_id", userId).single();
        const { data: userRow } = await sb.auth.admin.getUserById(userId);
        const customerEmail = userRow?.user?.email || "";
        const customerName = profile?.company_name || "";
        const endStr = periodEnd.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
        const cancelBody = [
          `Hallo${customerName ? " " + customerName : ""},`,
          ``,
          `deine Kündigung wurde bestätigt.`,
          ``,
          `Du hast noch bis zum ${endStr} vollen Zugriff auf alle PPC Tools.`,
          `Danach wird dein Zugang automatisch deaktiviert.`,
          ``,
          `Möchtest du dein Abo doch fortführen? Kein Problem — melde dich einfach bei uns:`,
          `hallo@adsmasters.de`,
          ``,
          `Dein AdsMasters Team`,
        ].join("\n");
        await sendEmail(customerEmail, "Deine Kündigung der AdsMasters PPC Tools", cancelBody);
        // Also notify AdsMasters
        await sendEmail("hallo@adsmasters.de", `⚠️ Kündigung: ${customerName || customerEmail}`, [
          `Kündigung eingegangen`,
          ``,
          `Kunde: ${customerName || "–"}`,
          `E-Mail: ${customerEmail}`,
          `Zugriff bis: ${endStr}`,
        ].join("\n"));
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      let userId = sub.metadata?.user_id;

      // Fallback: look up user by stripe_subscription_id if metadata missing
      if (!userId) {
        const { data: subRow } = await sb.from("ppc_subscriptions")
          .select("user_id")
          .eq("stripe_subscription_id", sub.id)
          .single();
        userId = subRow?.user_id;
      }
      if (!userId) return new Response("ok", { status: 200 });

      await sb.from("ppc_subscriptions").update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);

      console.log(`[PPC Webhook] Subscription canceled: ${userId}`);

      // Send cancellation confirmation email
      const { data: profile } = await sb.from("ppc_profiles").select("company_name").eq("user_id", userId).single();
      const { data: userRow } = await sb.auth.admin.getUserById(userId);
      const customerEmail = userRow?.user?.email || "";
      const customerName = profile?.company_name || "";
      const periodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
        : null;

      if (customerEmail) {
        await sendEmail(customerEmail, "Deine Kündigung der AdsMasters PPC Tools", [
          `Hallo${customerName ? " " + customerName : ""},`,
          ``,
          `deine Kündigung wurde bestätigt.`,
          ``,
          periodEnd
            ? `Du hast noch bis zum ${periodEnd} vollen Zugriff auf alle PPC Tools.`
            : `Dein Zugang wurde deaktiviert.`,
          ``,
          `Möchtest du dein Abo doch fortführen? Kein Problem – melde dich einfach bei uns:`,
          `hallo@adsmasters.de`,
          ``,
          `Dein AdsMasters Team`,
        ].join("\n"));

        await sendEmail("hallo@adsmasters.de", `⚠️ Kündigung: ${customerName || customerEmail}`, [
          `Kündigung eingegangen (sofortige Stornierung)`,
          ``,
          `Kunde: ${customerName || "–"}`,
          `E-Mail: ${customerEmail}`,
          `Zugriff bis: ${periodEnd || "sofort beendet"}`,
        ].join("\n"));
      }
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
      let recurringBillingAddress: BillingAddress = {};
      if (subRowForInvoice?.user_id) {
        const { data: profileForInvoice } = await sb.from("ppc_profiles")
          .select("company_name, billing_street, billing_zip, billing_city, billing_country")
          .eq("user_id", subRowForInvoice.user_id)
          .single();
        if (profileForInvoice?.company_name) customerName = profileForInvoice.company_name;
        recurringBillingAddress = {
          street: profileForInvoice?.billing_street || "",
          zip: profileForInvoice?.billing_zip || "",
          city: profileForInvoice?.billing_city || "",
          country: profileForInvoice?.billing_country || "DE",
        };
      }
      const periodStart = new Date(invoice.lines?.data?.[0]?.period?.start * 1000).toLocaleDateString("de-DE");
      const periodEnd = new Date(invoice.lines?.data?.[0]?.period?.end * 1000).toLocaleDateString("de-DE");
      const recurringLabel = `Abonnement ${periodStart} – ${periodEnd}`;
      const recurringStart = new Date(invoice.lines?.data?.[0]?.period?.start * 1000);
      const recurringEnd = new Date(invoice.lines?.data?.[0]?.period?.end * 1000);
      const recurringLexId = await createLexOfficeInvoice(customerName, customerEmail, recurringLabel, recurringStart, recurringEnd, recurringBillingAddress);
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

        // Email to customer
        const customerEmail = invoice.customer_email || "";
        const { data: prof } = await sb.from("ppc_profiles").select("company_name").eq("user_id", subRow.user_id).single();
        const customerName = prof?.company_name || "";
        const nextAttempt = invoice.next_payment_attempt
          ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
          : null;
        if (customerEmail) {
          await sendEmail(customerEmail, "Zahlung für AdsMasters PPC Tools fehlgeschlagen", [
            `Hallo${customerName ? " " + customerName : ""},`,
            ``,
            `leider konnte deine letzte Zahlung für die AdsMasters PPC Tools nicht verarbeitet werden.`,
            ``,
            nextAttempt
              ? `Stripe versucht die Zahlung automatisch erneut am ${nextAttempt}.`
              : `Bitte aktualisiere deine Zahlungsmethode, damit dein Zugang nicht unterbrochen wird.`,
            ``,
            `Zahlungsmethode aktualisieren:`,
            `https://adsmasters.github.io/ppc-tools-app/dashboard.html`,
            `(→ "Abo verwalten" im Dashboard)`,
            ``,
            `Bei Fragen: hallo@adsmasters.de`,
            ``,
            `Dein AdsMasters Team`,
          ].join("\n"));

          // Also notify AdsMasters
          await sendEmail("hallo@adsmasters.de", `⚠️ Zahlung fehlgeschlagen: ${customerName || customerEmail}`, [
            `Zahlung fehlgeschlagen`,
            ``,
            `Kunde: ${customerName || "–"}`,
            `E-Mail: ${customerEmail}`,
            `Nächster Versuch: ${nextAttempt || "–"}`,
          ].join("\n"));
        }
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
