import { describe, expect, it, vi } from "vitest";

// stack.ts imports the browser Supabase client, which throws without env vars.
vi.mock("@/lib/supabase.client", () => ({ supabase: {} }));

const { cheaperAlternatives, formatUsd, priceGap, stackItemSchema, summarizeStack, toFormValues } = await import(
  "./stack"
);
import type { StackItem } from "./stack";
import type { RankedAlternative } from "./alternatives";

function item(overrides: Partial<StackItem>): StackItem {
  return {
    tool_id: "t1",
    slug: "tool",
    name: "Tool",
    logo_url: null,
    is_listed: true,
    category_name: "General assistants",
    plan_label: null,
    cost_usd: 20,
    billing_period: "month",
    monthly_cost: 20,
    status: "active",
    renews_on: null,
    notes: null,
    pricing_tier: "freemium",
    has_free_tier: true,
    pricing_starts_at: 20,
    last_verified_at: null,
    overlap_group: null,
    added_at: "2026-10-13T00:00:00Z",
    ...overrides,
  };
}

function alt(overrides: Partial<RankedAlternative>): RankedAlternative {
  return {
    id: "a1",
    slug: "alt",
    name: "Alt",
    tagline: "",
    logo_url: null,
    pricing_tier: "paid",
    audience_fit: "both",
    has_free_tier: false,
    pricing_starts_at: null,
    ...overrides,
  };
}

describe("summarizeStack", () => {
  it("totals active and trial items, skips cancelled, and annualises", () => {
    const s = summarizeStack([
      item({ tool_id: "a", monthly_cost: 20 }),
      item({ tool_id: "b", monthly_cost: 18, billing_period: "year", cost_usd: 216 }),
      item({ tool_id: "c", monthly_cost: 10, status: "trial" }),
      item({ tool_id: "d", monthly_cost: 30, status: "cancelled" }),
    ]);
    expect(s.monthlyTotal).toBe(48);
    expect(s.annualTotal).toBe(576);
    expect(s.liveCount).toBe(3);
  });

  it("rounds cents without float drift", () => {
    const s = summarizeStack([item({ tool_id: "a", monthly_cost: 0.1 }), item({ tool_id: "b", monthly_cost: 0.2 })]);
    expect(s.monthlyTotal).toBe(0.3);
  });

  it("groups overlaps by overlap_group, most expensive first, ignoring cancelled", () => {
    const s = summarizeStack([
      item({ tool_id: "a", name: "ChatGPT", monthly_cost: 20, overlap_group: "cat-1" }),
      item({ tool_id: "b", name: "Claude", monthly_cost: 18, overlap_group: "cat-1" }),
      item({ tool_id: "c", name: "Cursor", monthly_cost: 20, overlap_group: "cat-2", category_name: "Coding" }),
      item({ tool_id: "d", name: "Copilot", monthly_cost: 40, overlap_group: "cat-2", category_name: "Coding" }),
      item({ tool_id: "e", name: "Old", monthly_cost: 99, overlap_group: null, status: "cancelled" }),
    ]);
    expect(s.overlaps.map((g) => [g.categoryName, g.items.map((i) => i.name), g.monthlyTotal])).toEqual([
      ["Coding", ["Cursor", "Copilot"], 60],
      ["General assistants", ["ChatGPT", "Claude"], 38],
    ]);
  });

  it("flags tools that are no longer listed", () => {
    const s = summarizeStack([item({ tool_id: "a" }), item({ tool_id: "b", name: "Tome", is_listed: false })]);
    expect(s.unlisted.map((i) => i.name)).toEqual(["Tome"]);
  });

  it("handles an empty stack", () => {
    expect(summarizeStack([])).toEqual({ monthlyTotal: 0, annualTotal: 0, liveCount: 0, overlaps: [], unlisted: [] });
  });
});

describe("priceGap", () => {
  it("is unknown without a listed price or a cost", () => {
    expect(priceGap({ monthly_cost: 20, pricing_starts_at: null })).toEqual({ kind: "unknown" });
    expect(priceGap({ monthly_cost: 0, pricing_starts_at: 20 })).toEqual({ kind: "unknown" });
  });

  it("treats small gaps (≤ $2 or 10%) as a match", () => {
    expect(priceGap({ monthly_cost: 18, pricing_starts_at: 17 })).toEqual({ kind: "matches" });
    expect(priceGap({ monthly_cost: 210, pricing_starts_at: 200 })).toEqual({ kind: "matches" });
    expect(priceGap({ monthly_cost: 23, pricing_starts_at: 20 })).toEqual({ kind: "paying_more", listed: 20, diff: 3 });
  });

  it("reports paying more or less with the difference", () => {
    expect(priceGap({ monthly_cost: 200, pricing_starts_at: 20 })).toEqual({ kind: "paying_more", listed: 20, diff: 180 });
    expect(priceGap({ monthly_cost: 10, pricing_starts_at: 20 })).toEqual({ kind: "paying_less", listed: 20, diff: 10 });
  });
});

describe("cheaperAlternatives", () => {
  const alts = [
    alt({ id: "x", name: "Pricier", pricing_starts_at: 30 }),
    alt({ id: "y", name: "Free", has_free_tier: true }),
    alt({ id: "z", name: "Cheaper", pricing_starts_at: 10 }),
    alt({ id: "in-stack", name: "Mine", has_free_tier: true }),
    alt({ id: "w", name: "Unpriced", pricing_starts_at: null }),
  ];

  it("keeps free-tier or cheaper tools not already in the stack, in ranked order", () => {
    const out = cheaperAlternatives({ monthly_cost: 20 }, alts, new Set(["in-stack"]));
    expect(out.map((a) => a.name)).toEqual(["Free", "Cheaper"]);
  });

  it("returns nothing for free items", () => {
    expect(cheaperAlternatives({ monthly_cost: 0 }, alts, new Set())).toEqual([]);
  });

  it("respects the limit", () => {
    expect(cheaperAlternatives({ monthly_cost: 20 }, alts, new Set(), 1)).toHaveLength(1);
  });
});

describe("form", () => {
  it("prefills a new item from the listed price", () => {
    expect(toFormValues(null, 20)).toMatchObject({ cost: "20", billing_period: "month", status: "active" });
    expect(toFormValues(null, null).cost).toBe("");
  });

  it("validates cost as a plain dollar amount", () => {
    const base = { billing_period: "month", status: "active" } as const;
    expect(stackItemSchema.safeParse({ ...base, cost: "19.99" }).success).toBe(true);
    expect(stackItemSchema.safeParse({ ...base, cost: "" }).success).toBe(true);
    expect(stackItemSchema.safeParse({ ...base, cost: "-5" }).success).toBe(false);
    expect(stackItemSchema.safeParse({ ...base, cost: "20.999" }).success).toBe(false);
    expect(stackItemSchema.safeParse({ ...base, cost: "$20" }).success).toBe(false);
  });
});

describe("formatUsd", () => {
  it("drops cents for whole dollars only", () => {
    expect(formatUsd(20)).toBe("$20");
    expect(formatUsd(18.5)).toBe("$18.50");
    expect(formatUsd(1234)).toBe("$1,234");
  });
});
