import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { formEncode, periodEnd, verifyStripeSignature } from "./stripe";

const SECRET = "whsec_test";
const NOW = 1_760_000_000;
const sign = (payload: string, t: number, secret = SECRET) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;

describe("verifyStripeSignature", () => {
  const payload = '{"id":"evt_1","type":"customer.subscription.updated"}';

  it("accepts a valid signature", async () => {
    expect(await verifyStripeSignature(payload, sign(payload, NOW), SECRET, 300, NOW)).toBe(true);
  });

  it("accepts when any of several v1 signatures matches (secret rotation)", async () => {
    const header = `${sign(payload, NOW)},v1=${"0".repeat(64)}`;
    expect(await verifyStripeSignature(payload, header, SECRET, 300, NOW)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    expect(await verifyStripeSignature(`${payload} `, sign(payload, NOW), SECRET, 300, NOW)).toBe(
      false,
    );
  });

  it("rejects the wrong secret", async () => {
    expect(
      await verifyStripeSignature(payload, sign(payload, NOW, "whsec_other"), SECRET, 300, NOW),
    ).toBe(false);
  });

  it("rejects a stale timestamp (replay)", async () => {
    expect(await verifyStripeSignature(payload, sign(payload, NOW - 301), SECRET, 300, NOW)).toBe(
      false,
    );
  });

  it("rejects missing or malformed headers", async () => {
    expect(await verifyStripeSignature(payload, null, SECRET, 300, NOW)).toBe(false);
    expect(await verifyStripeSignature(payload, "garbage", SECRET, 300, NOW)).toBe(false);
    expect(await verifyStripeSignature(payload, `t=${NOW}`, SECRET, 300, NOW)).toBe(false);
  });
});

describe("formEncode", () => {
  it("flattens nested objects and arrays the way Stripe expects", () => {
    const out = formEncode({
      mode: "subscription",
      line_items: [{ price: "price_1", quantity: 1 }],
      metadata: { tool_id: "t1" },
      skipped: undefined,
    });
    expect(out.toString()).toBe(
      "mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Btool_id%5D=t1",
    );
  });
});

describe("periodEnd", () => {
  const base = {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    metadata: {},
  };

  it("reads the legacy top-level field", () => {
    expect(periodEnd({ ...base, current_period_end: NOW })).toBe(
      new Date(NOW * 1000).toISOString(),
    );
  });

  it("reads the per-item field on newer API versions", () => {
    expect(periodEnd({ ...base, items: { data: [{ current_period_end: NOW }] } })).toBe(
      new Date(NOW * 1000).toISOString(),
    );
  });

  it("returns null when absent", () => {
    expect(periodEnd(base)).toBeNull();
  });
});
