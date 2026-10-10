/**
 * Minimal Stripe client for Edge Functions — plain fetch against the REST API
 * plus webhook signature verification with Web Crypto. Avoids pulling the
 * stripe SDK (and its Node shims) into Deno for the handful of calls we make.
 */

const STRIPE_API = "https://api.stripe.com/v1";

/** Flattens `{ a: { b: [ { c: 1 } ] } }` into Stripe's `a[b][0][c]=1` form encoding. */
export function formEncode(params: Record<string, unknown>, prefix = ""): URLSearchParams {
  const out = new URLSearchParams();
  const walk = (value: unknown, key: string) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${key}[${i}]`));
    } else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, key ? `${key}[${k}]` : k);
      }
    } else {
      out.append(key, String(value));
    }
  };
  walk(params, prefix);
  return out;
}

export async function stripe<T>(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  const body = params ? formEncode(params).toString() : undefined;
  const url = method === "GET" && body ? `${STRIPE_API}${path}?${body}` : `${STRIPE_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "POST" ? body : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe ${method} ${path} failed: ${json?.error?.message ?? res.status}`);
  }
  return json as T;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifies a `Stripe-Signature` header (`t=…,v1=…[,v1=…]`) against the raw
 * request body, per https://docs.stripe.com/webhooks#verify-manually.
 * Rejects timestamps more than `toleranceSec` from now (replay protection).
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSec = 300,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!header) return false;
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t") timestamp = v ?? "";
    else if (k === "v1" && v) signatures.push(v);
  }
  const t = Number(timestamp);
  if (!timestamp || !Number.isFinite(t) || signatures.length === 0) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  return signatures.some((s) => timingSafeEqual(s, expected));
}

/** The subset of a Stripe Subscription object we read. */
export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  metadata: Record<string, string>;
  /** Top-level on API versions before 2025-03-31 … */
  current_period_end?: number;
  /** … moved onto each item afterwards. */
  items?: { data: Array<{ current_period_end?: number }> };
}

export function periodEnd(sub: StripeSubscription): string | null {
  const ts = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  return ts ? new Date(ts * 1000).toISOString() : null;
}
