/**
 * Shared compare-page data helpers. Client-agnostic: every function takes a
 * Supabase client so it works from the build-time loader (prerender), the
 * browser clientLoader, and the interactive /compare SPA page.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ComparableTool {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  website_url: string;
  logo_url: string | null;
  primary_category_id: string | null;
  pricing_tier: string;
  has_free_tier: boolean;
  pricing_starts_at: number | null;
  pricing_currency: string;
  audience_fit: string;
  model_provider: string | null;
  open_source: boolean;
  self_hostable: boolean;
  api_available: boolean;
  founded_year: number | null;
  hq_country: string | null;
  hq_city: string | null;
  key_strengths: string[];
  category_name?: string | null;
}

/** "claude-code-vs-cursor" → ["claude-code", "cursor"] */
export function parseCompareSlug(slug: string): string[] {
  return slug
    .split("-vs-")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Canonical compare slug: tool slugs sorted alphabetically, joined by "-vs-".
 * Matches the cache key format used by the compare-summary Edge Function.
 */
export function canonicalCompareSlug(slugs: string[]): string {
  return [...slugs].sort().join("-vs-");
}

export async function fetchToolsBySlug(
  client: SupabaseClient,
  slugs: string[],
): Promise<ComparableTool[]> {
  if (slugs.length === 0) return [];

  const { data: tools, error } = await client
    .from("tools")
    .select("*")
    .in("slug", slugs)
    .eq("status", "published");

  if (error || !tools) return [];

  // Fetch category names
  const categoryIds = tools
    .map((t) => t.primary_category_id)
    .filter((id): id is string => !!id);

  const categoryMap = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: categories } = await client
      .from("categories")
      .select("id, name")
      .in("id", categoryIds);
    for (const c of categories ?? []) {
      categoryMap.set(c.id, c.name);
    }
  }

  // Preserve input slug order
  const toolMap = new Map(tools.map((t) => [t.slug, t]));
  return slugs
    .map((slug) => toolMap.get(slug))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => ({
      ...(t as ComparableTool),
      category_name: t.primary_category_id
        ? (categoryMap.get(t.primary_category_id) ?? null)
        : null,
    }));
}

export interface ComparePageData {
  /** Canonical slug (sorted) — meta canonical tag points here. */
  canonicalSlug: string;
  tools: ComparableTool[];
  /** Cached AI TL;DR from the comparisons table, if one exists. */
  aiSummary: string | null;
}

/**
 * Everything a prerendered /compare/:slug page needs. Returns null when the
 * slug doesn't resolve to at least two published tools.
 */
export async function fetchComparePageData(
  client: SupabaseClient,
  slug: string,
): Promise<ComparePageData | null> {
  const slugs = parseCompareSlug(slug);
  if (slugs.length < 2) return null;

  const canonical = canonicalCompareSlug(slugs);
  const [tools, { data: comparison }] = await Promise.all([
    fetchToolsBySlug(client, slugs),
    client
      .from("comparisons")
      .select("ai_summary")
      .eq("slug", canonical)
      .maybeSingle(),
  ]);

  if (tools.length < 2) return null;

  return {
    canonicalSlug: canonical,
    tools,
    aiSummary: (comparison as { ai_summary: string | null } | null)?.ai_summary ?? null,
  };
}
