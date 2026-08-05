/**
 * Popular compare-page path discovery, shared by react-router.config.ts
 * (prerender list) and scripts/generate-sitemap.ts. Deliberately free of
 * path-alias imports so it resolves from both contexts.
 *
 * Two sources, deduped on the canonical slug:
 *  1. The `comparisons` table (AI-summary cache) ordered by view_count —
 *     combos real visitors actually compared.
 *  2. Generated pairs of the two most popular published tools per category —
 *     guarantees every category has at least one indexable comparison page
 *     even before organic view data accumulates.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const VIEWED_COMBOS_LIMIT = 20;

interface ToolRow {
  slug: string;
  primary_category_id: string | null;
  popularity_score: number;
}

interface ComparisonRow {
  slug: string;
  last_generated_at: string | null;
  created_at: string | null;
}

/** A canonical compare slug plus its content-freshness date, when one exists. */
export interface CompareSlug {
  /** e.g. "chatgpt-vs-claude" */
  slug: string;
  /** W3C date (YYYY-MM-DD) from the cached comparison, or undefined for generated pairs. */
  lastmod?: string;
}

/** Coerce a DB timestamp into a W3C-format lastmod, or undefined if unparseable. */
function toLastmod(ts?: string | null): string | undefined {
  if (!ts) return undefined;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/** Returns canonical compare slugs with per-slug lastmod where available. */
export async function getPopularCompareSlugs(client: SupabaseClient): Promise<CompareSlug[]> {
  const [{ data: comparisons }, { data: tools }] = await Promise.all([
    client
      .from("comparisons")
      .select("slug, view_count, last_generated_at, created_at")
      .order("view_count", { ascending: false })
      .limit(VIEWED_COMBOS_LIMIT),
    client
      .from("tools")
      .select("slug, primary_category_id, popularity_score")
      .eq("status", "published")
      .order("popularity_score", { ascending: false })
      .order("slug"),
  ]);

  const published = new Set((tools ?? []).map((t: ToolRow) => t.slug));
  // Keyed on slug; a cached-comparison entry (with lastmod) is never overwritten
  // by a generated pair for the same slug.
  const results = new Map<string, CompareSlug>();

  // 1. Most-viewed cached comparisons whose tools are all still published.
  for (const c of (comparisons ?? []) as ComparisonRow[]) {
    const parts = c.slug.split("-vs-").filter(Boolean);
    if (parts.length >= 2 && parts.every((p) => published.has(p))) {
      results.set(c.slug, {
        slug: c.slug,
        lastmod: toLastmod(c.last_generated_at ?? c.created_at),
      });
    }
  }

  // 2. Top-two tools per category (tools are already popularity-ordered).
  const byCategory = new Map<string, string[]>();
  for (const t of (tools ?? []) as ToolRow[]) {
    if (!t.primary_category_id) continue;
    const bucket = byCategory.get(t.primary_category_id) ?? [];
    if (bucket.length < 2) {
      bucket.push(t.slug);
      byCategory.set(t.primary_category_id, bucket);
    }
  }
  for (const pair of byCategory.values()) {
    if (pair.length === 2) {
      const slug = [...pair].sort().join("-vs-");
      if (!results.has(slug)) results.set(slug, { slug });
    }
  }

  return [...results.values()];
}

export async function getPopularComparePaths(client: SupabaseClient): Promise<string[]> {
  const slugs = await getPopularCompareSlugs(client);
  return slugs.map((s) => `/compare/${s.slug}`);
}
