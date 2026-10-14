/**
 * "My AI stack" (SPEC §19, migration 0041). Data access for `stack_items` /
 * `my_stack()` plus the pure summary logic behind /account/stack — totals,
 * overlaps, listed-vs-paid and cheaper alternatives — kept free of React and
 * Supabase so it's unit-testable.
 *
 * Privacy (§19.4): nothing in here may reach analytics, URLs or logs.
 */
import { z } from "zod";
import { supabase } from "@/lib/supabase.client";
import type { RankedAlternative } from "@/lib/alternatives";

export type StackStatus = "active" | "trial" | "cancelled";
export type BillingPeriod = "month" | "year";

/** One row of `my_stack()`. The generated types mark every column non-null; these don't. */
export interface StackItem {
  tool_id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  is_listed: boolean;
  category_name: string | null;
  plan_label: string | null;
  cost_usd: number;
  billing_period: BillingPeriod;
  monthly_cost: number;
  status: StackStatus;
  renews_on: string | null;
  notes: string | null;
  pricing_tier: string;
  has_free_tier: boolean;
  pricing_starts_at: number | null;
  last_verified_at: string | null;
  overlap_group: string | null;
  added_at: string;
}

/** The user's own row for one tool, as the tool page needs it. */
export interface StackEntry {
  plan_label: string | null;
  cost_usd: number;
  billing_period: BillingPeriod;
  status: StackStatus;
  renews_on: string | null;
  notes: string | null;
}

// ── Form ────────────────────────────────────────────────────────────────────

export const stackItemSchema = z.object({
  plan_label: z.string().trim().max(80, "Max 80 characters").optional(),
  cost: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{1,7}(\.\d{1,2})?$/.test(v), "Enter an amount like 20 or 19.99"),
  billing_period: z.enum(["month", "year"]),
  status: z.enum(["active", "trial", "cancelled"]),
  renews_on: z.string().optional(),
  notes: z.string().trim().max(500, "Max 500 characters").optional(),
});

export type StackItemForm = z.infer<typeof stackItemSchema>;

export function toFormValues(entry: StackEntry | null, listedPrice: number | null): StackItemForm {
  return {
    plan_label: entry?.plan_label ?? "",
    cost: entry ? String(entry.cost_usd) : listedPrice ? String(listedPrice) : "",
    billing_period: entry?.billing_period ?? "month",
    status: entry?.status ?? "active",
    renews_on: entry?.renews_on ?? "",
    notes: entry?.notes ?? "",
  };
}

export function toEntry(item: StackItem): StackEntry {
  const { plan_label, cost_usd, billing_period, status, renews_on, notes } = item;
  return { plan_label, cost_usd, billing_period, status, renews_on, notes };
}

// ── Data access (browser client, RLS: owner-only) ─────────────────────────────

export async function fetchMyStack(): Promise<StackItem[]> {
  const { data, error } = await supabase.rpc("my_stack");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    cost_usd: Number(row.cost_usd),
    monthly_cost: Number(row.monthly_cost),
    pricing_starts_at: row.pricing_starts_at === null ? null : Number(row.pricing_starts_at),
  })) as StackItem[];
}

export async function fetchStackEntry(toolId: string, userId: string): Promise<StackEntry | null> {
  const { data } = await supabase
    .from("stack_items")
    .select("plan_label, cost_usd, billing_period, status, renews_on, notes")
    .eq("tool_id", toolId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as StackEntry | null) ?? null;
}

export async function saveStackItem(toolId: string, userId: string, form: StackItemForm): Promise<void> {
  const { error } = await supabase.from("stack_items").upsert(
    {
      user_id: userId,
      tool_id: toolId,
      plan_label: form.plan_label || null,
      cost_usd: form.cost === "" ? 0 : Number(form.cost),
      billing_period: form.billing_period,
      status: form.status,
      renews_on: form.renews_on || null,
      notes: form.notes || null,
    },
    { onConflict: "user_id,tool_id" },
  );
  if (error) throw error;
}

export async function removeStackItem(toolId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("stack_items").delete().eq("tool_id", toolId).eq("user_id", userId);
  if (error) throw error;
}

// ── Summary logic ─────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Items that cost money now: active and trial (a trial converts unless cancelled). */
export function isLive(item: Pick<StackItem, "status">): boolean {
  return item.status !== "cancelled";
}

export interface OverlapGroup {
  key: string;
  categoryName: string;
  items: StackItem[];
  monthlyTotal: number;
}

export interface StackSummary {
  monthlyTotal: number;
  annualTotal: number;
  liveCount: number;
  overlaps: OverlapGroup[];
  unlisted: StackItem[];
}

export function summarizeStack(items: StackItem[]): StackSummary {
  const live = items.filter(isLive);
  const monthlyTotal = round2(live.reduce((sum, i) => sum + i.monthly_cost, 0));

  const groups = new Map<string, StackItem[]>();
  for (const item of live) {
    if (!item.overlap_group) continue;
    groups.set(item.overlap_group, [...(groups.get(item.overlap_group) ?? []), item]);
  }
  const overlaps = [...groups.entries()]
    .map(([key, group]) => ({
      key,
      categoryName: group[0].category_name ?? "Same category",
      items: group,
      monthlyTotal: round2(group.reduce((sum, i) => sum + i.monthly_cost, 0)),
    }))
    .sort((a, b) => b.monthlyTotal - a.monthlyTotal);

  return {
    monthlyTotal,
    annualTotal: round2(monthlyTotal * 12),
    liveCount: live.length,
    overlaps,
    unlisted: items.filter((i) => !i.is_listed),
  };
}

export type PriceGap =
  | { kind: "unknown" }
  | { kind: "matches" }
  | { kind: "paying_more"; listed: number; diff: number }
  | { kind: "paying_less"; listed: number; diff: number };

/**
 * The user's monthly cost vs. the listed starting price. Paying more is normal
 * for higher plans, so the UI phrases it as information, not a warning. A gap
 * within $2 or 10% counts as a match (taxes, yearly-billing discounts, rounding).
 */
export function priceGap(item: Pick<StackItem, "monthly_cost" | "pricing_starts_at">): PriceGap {
  const listed = item.pricing_starts_at;
  if (listed === null || listed <= 0 || item.monthly_cost <= 0) return { kind: "unknown" };
  const diff = round2(item.monthly_cost - listed);
  if (Math.abs(diff) <= Math.max(2, listed * 0.1)) return { kind: "matches" };
  return diff > 0 ? { kind: "paying_more", listed, diff } : { kind: "paying_less", listed, diff: -diff };
}

/**
 * Alternatives worth showing next to a paid stack item: free-tier tools, or
 * ones listed cheaper than what the user pays. Excludes tools already in the
 * stack. Keeps the RPC's ranking order.
 */
export function cheaperAlternatives(
  item: Pick<StackItem, "monthly_cost">,
  alternatives: RankedAlternative[],
  stackToolIds: Set<string>,
  limit = 3,
): RankedAlternative[] {
  if (item.monthly_cost <= 0) return [];
  return alternatives
    .filter((alt) => !stackToolIds.has(alt.id))
    .filter(
      (alt) =>
        alt.has_free_tier ||
        (alt.pricing_starts_at !== null && alt.pricing_starts_at > 0 && alt.pricing_starts_at < item.monthly_cost),
    )
    .slice(0, limit);
}

export function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
