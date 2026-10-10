/**
 * featured-billing edge function
 *
 * Signed-in makers buy or manage a Featured listing for a tool they've claimed.
 *
 * POST body: { action: "checkout" | "portal", slug: string }
 *   checkout → { url } of a Stripe Checkout session for the Featured plan.
 *              Requires a VERIFIED tool_claims row for (tool, caller), and
 *              refuses when the tool already has a live subscription.
 *   portal   → { url } of a Stripe Billing Portal session for the caller's
 *              Featured subscription on that tool (cancel, update card, invoices).
 *
 * Nothing here grants placement: the stripe-webhook function does that once
 * Stripe confirms payment. Redirect URLs are built from SITE_URL only, never
 * from the request, so this can't be used as an open redirect.
 *
 * Env: STRIPE_SECRET_KEY, STRIPE_FEATURED_PRICE_ID, SITE_URL (default https://aiwiki.io)
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { stripe } from "../_shared/stripe.ts";

const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://aiwiki.io").replace(/\/$/, "");
const LIVE_STATUSES = ["active", "trialing", "past_due"];

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const token = req.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  const {
    data: { user },
  } = token ? await supabaseAdmin.auth.getUser(token) : { data: { user: null } };
  if (!user) return json(401, { error: "Sign in required" });

  let body: { action?: unknown; slug?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  const action = body.action;
  const slug = typeof body.slug === "string" ? body.slug : "";
  if ((action !== "checkout" && action !== "portal") || !slug) {
    return json(400, { error: "Expected { action: 'checkout' | 'portal', slug }" });
  }

  const { data: tool } = await supabaseAdmin
    .from("tools")
    .select("id, slug, name")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!tool) return json(404, { error: "Tool not found" });

  const returnUrl = `${SITE_URL}/claim/${encodeURIComponent(tool.slug)}`;

  try {
    if (action === "portal") {
      const { data: sub } = await supabaseAdmin
        .from("featured_subscriptions")
        .select("stripe_customer_id")
        .eq("tool_id", tool.id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!sub) return json(404, { error: "No Featured subscription for this tool" });
      const session = await stripe<{ url: string }>("POST", "/billing_portal/sessions", {
        customer: sub.stripe_customer_id,
        return_url: returnUrl,
      });
      return json(200, { url: session.url });
    }

    // ── checkout ──────────────────────────────────────────────────────────────
    const priceId = Deno.env.get("STRIPE_FEATURED_PRICE_ID");
    if (!priceId) return json(500, { error: "Featured plan is not configured" });

    const { data: claim } = await supabaseAdmin
      .from("tool_claims")
      .select("status")
      .eq("tool_id", tool.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (claim?.status !== "verified") {
      return json(403, { error: "Claim and verify this listing before featuring it" });
    }

    const { data: live } = await supabaseAdmin
      .from("featured_subscriptions")
      .select("id")
      .eq("tool_id", tool.id)
      .in("status", LIVE_STATUSES)
      .limit(1);
    if (live && live.length > 0) return json(409, { error: `${tool.name} is already featured` });

    // Reuse the caller's Stripe customer if they've paid before, so invoices
    // and saved cards stay in one place.
    const { data: prior } = await supabaseAdmin
      .from("featured_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const metadata = { tool_id: tool.id, user_id: user.id, tool_slug: tool.slug };
    const session = await stripe<{ url: string }>("POST", "/checkout/sessions", {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      ...(prior?.stripe_customer_id
        ? { customer: prior.stripe_customer_id }
        : { customer_email: user.email }),
      metadata,
      subscription_data: { metadata, description: `Featured listing: ${tool.name}` },
      allow_promotion_codes: true,
      success_url: `${returnUrl}?featured=success`,
      cancel_url: `${returnUrl}?featured=cancelled`,
    });
    return json(200, { url: session.url });
  } catch (err) {
    console.error("featured-billing:", err);
    return json(502, { error: "Couldn't reach the payment provider. Please try again." });
  }
});
