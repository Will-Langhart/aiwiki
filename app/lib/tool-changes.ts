/**
 * Public tool change log (migration 0035). Rows are written by the enrichment
 * pipeline's refresh mode. RLS only exposes `is_notable` rows on published
 * tools, but the prerender loader uses the service-role key (bypasses RLS), so
 * every query here filters on both explicitly.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ToolChange {
  id: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

export interface ToolChangeWithTool extends ToolChange {
  tool: { slug: string; name: string; logo_url: string | null };
}

const FIELD_LABELS: Record<string, string> = {
  pricing_tier: "Pricing model",
  has_free_tier: "Free tier",
  pricing_starts_at: "Starting price",
  pricing_detail: "Plans",
  api_available: "API",
  open_source: "Open source",
  self_hostable: "Self-hosting",
  model_provider: "Models",
};

const TIER_LABELS: Record<string, string> = {
  free: "free",
  freemium: "freemium",
  paid: "paid only",
  enterprise: "enterprise",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, " ");
}

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "unlisted";
  if (field === "pricing_starts_at" && typeof value === "number") return `$${value.toLocaleString("en-US")}/mo`;
  if (field === "pricing_tier" && typeof value === "string") return TIER_LABELS[value] ?? value;
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/**
 * One-line, human description of a change, e.g. "Starting price: $20/mo → $25/mo"
 * or "Free tier: now available". Long text (plan details, model lists) shows
 * only the new value — an old→new diff of two paragraphs isn't readable.
 */
export function describeChange(change: Pick<ToolChange, "field" | "old_value" | "new_value">): string {
  const { field, old_value: oldValue, new_value: newValue } = change;
  const label = fieldLabel(field);
  if (typeof newValue === "boolean") {
    if (field === "has_free_tier") return `${label}: ${newValue ? "now available" : "removed"}`;
    return `${label}: ${newValue ? "now available" : "no longer offered"}`;
  }
  if (field === "pricing_detail" || field === "model_provider") {
    return `${label} updated: ${formatValue(field, newValue)}`;
  }
  return `${label}: ${formatValue(field, oldValue)} → ${formatValue(field, newValue)}`;
}

/** Stable (UTC, en-US) date so prerendered HTML matches the client render. */
export function formatChangeDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }): string {
  return new Date(iso).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export async function fetchToolChanges(client: SupabaseClient, toolId: string, limit = 5): Promise<ToolChange[]> {
  const { data } = await client
    .from("tool_changes")
    .select("id, field, old_value, new_value, created_at")
    .eq("tool_id", toolId)
    .eq("is_notable", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ToolChange[];
}

export async function fetchRecentChanges(client: SupabaseClient, days = 60, limit = 300): Promise<ToolChangeWithTool[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await client
    .from("tool_changes")
    .select("id, field, old_value, new_value, created_at, tool:tools!inner(slug, name, logo_url, status)")
    .eq("is_notable", true)
    .eq("tool.status", "published")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as ToolChangeWithTool[];
}

export interface ChangeGroup {
  tool: ToolChangeWithTool["tool"];
  date: string;
  changes: ToolChangeWithTool[];
}

/** Group a newest-first change list into one entry per tool per UTC day. */
export function groupChanges(changes: ToolChangeWithTool[]): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  const index = new Map<string, ChangeGroup>();
  for (const c of changes) {
    const date = c.created_at.slice(0, 10);
    const key = `${c.tool.slug}:${date}`;
    let g = index.get(key);
    if (!g) {
      g = { tool: c.tool, date, changes: [] };
      index.set(key, g);
      groups.push(g);
    }
    g.changes.push(c);
  }
  return groups;
}
