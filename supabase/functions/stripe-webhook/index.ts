/**
 * stripe-webhook edge function
 *
 * The only writer of featured_subscriptions. Stripe calls it directly, so it
 * runs with verify_jwt = false (supabase/config.toml) and authenticates every
 * request by its Stripe-Signature instead.
 *
 * Handled events:
 *   checkout.session.completed            (mode = subscription)
 *   customer.subscription.created|updated|deleted
 * For each, the subscription is re-fetched from Stripe and mirrored as-is —
 * Stripe is the source of truth, so out-of-order or repeated deliveries
 * converge on the same row. Then sync_tool_featured() recomputes the tool's
 * is_featured / featured_until, and if that flipped, the Vercel deploy hook
 * rebuilds the prerendered pages so the placement shows (or disappears).
 *
 * Processed event ids are recorded in stripe_events; a redelivery of one is
 * acknowledged without reprocessing.
 *
 * Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, VERCEL_DEPLOY_HOOK_URL (optional)
 */
import { type SupabaseClient, createClient } from "npm:@supabase/supabase-js@2";
import {
  type StripeSubscription,
  periodEnd,
  stripe,
  verifyStripeSignature,
} from "../_shared/stripe.ts";

interface StripeEvent {
  id: string;
  type: string;
  data: { object: { id: string; mode?: string; subscription?: string | null } };
}

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return text(405, "POST only");

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return text(500, "STRIPE_WEBHOOK_SECRET is not set");

  const payload = await req.text();
  if (!(await verifyStripeSignature(payload, req.headers.get("Stripe-Signature"), secret))) {
    return text(400, "Bad signature");
  }

  const event = JSON.parse(payload) as StripeEvent;
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: seen } = await supabaseAdmin
    .from("stripe_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();
  if (seen) return text(200, "duplicate");

  let subscriptionId: string | null = null;
  if (event.type === "checkout.session.completed" && event.data.object.mode === "subscription") {
    subscriptionId = event.data.object.subscription ?? null;
  } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
    subscriptionId = event.data.object.id;
  }

  if (subscriptionId) {
    try {
      await syncSubscription(supabaseAdmin, subscriptionId);
    } catch (err) {
      // Non-2xx makes Stripe retry with backoff; the event isn't recorded yet.
      console.error(`stripe-webhook ${event.type} ${event.id}:`, err);
      return text(500, "sync failed");
    }
  }

  await supabaseAdmin.from("stripe_events").insert({ id: event.id, type: event.type });
  return text(200, "ok");
});

async function syncSubscription(
  supabaseAdmin: SupabaseClient,
  subscriptionId: string,
): Promise<void> {
  const sub = await stripe<StripeSubscription>("GET", `/subscriptions/${subscriptionId}`);
  const toolId = sub.metadata?.tool_id;
  const userId = sub.metadata?.user_id;
  if (!toolId || !userId) {
    // Not one of ours (e.g. created by hand in the dashboard) — nothing to mirror.
    console.warn(`stripe-webhook: subscription ${sub.id} has no tool_id/user_id metadata; skipped`);
    return;
  }

  const { data: before } = await supabaseAdmin
    .from("tools")
    .select("is_featured")
    .eq("id", toolId)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("featured_subscriptions").upsert(
    {
      tool_id: toolId,
      user_id: userId,
      stripe_customer_id: sub.customer,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_end: periodEnd(sub),
      cancel_at_period_end: sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (error) throw new Error(`upsert featured_subscriptions: ${error.message}`);

  const { data: nowFeatured, error: rpcError } = await supabaseAdmin.rpc("sync_tool_featured", {
    p_tool_id: toolId,
  });
  if (rpcError) throw new Error(`sync_tool_featured: ${rpcError.message}`);

  if (before && before.is_featured !== nowFeatured) await triggerRebuild();
}

/** Prerendered listings only change on a build — kick one off when placement flips. */
async function triggerRebuild(): Promise<void> {
  const hook = Deno.env.get("VERCEL_DEPLOY_HOOK_URL");
  if (!hook) {
    console.warn(
      "stripe-webhook: featured state changed but VERCEL_DEPLOY_HOOK_URL is not set — deploy manually",
    );
    return;
  }
  const res = await fetch(hook, { method: "POST" });
  await res.body?.cancel();
  if (!res.ok) console.error(`stripe-webhook: deploy hook returned ${res.status}`);
}
