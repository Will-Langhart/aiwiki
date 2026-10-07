/**
 * Ranked alternatives for a tool, via the `tool_alternatives` RPC (embedding
 * similarity + same-category/popularity boost, own-company and duplicate
 * listings excluded — see migration 0033). Client-agnostic so it runs from the
 * build-time loader (prerender) and the browser clientLoader.
 */
import type { AlternativeTool } from "@/components/tool/ToolNextSteps";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RankedAlternative extends AlternativeTool {
  pricing_starts_at: number | null;
}

/** Returns null when the RPC is unavailable, so callers can fall back. */
export async function fetchToolAlternatives(
  client: SupabaseClient,
  slug: string,
  limit: number,
): Promise<RankedAlternative[] | null> {
  const { data, error } = await client.rpc("tool_alternatives", { p_slug: slug, p_limit: limit });
  if (error) return null;
  return (data as RankedAlternative[] | null) ?? [];
}

export interface AlternativesPageData {
  tool: {
    id: string;
    slug: string;
    name: string;
    tagline: string;
    logo_url: string | null;
    pricing_tier: string;
    has_free_tier: boolean;
    pricing_starts_at: number | null;
    api_available: boolean;
    open_source: boolean;
  };
  category: { name: string; slug: string } | null;
  alternatives: RankedAlternative[];
}

const PAGE_ALTERNATIVES = 10;

/**
 * Everything /tools/:slug/alternatives needs. Null for unknown/unpublished
 * slugs and for tools with no alternatives (nothing worth indexing).
 */
export async function fetchAlternativesPageData(
  client: SupabaseClient,
  slug: string,
): Promise<AlternativesPageData | null> {
  if (!slug) return null;
  const { data: tool } = await client
    .from("tools")
    .select(
      "id, slug, name, tagline, logo_url, pricing_tier, has_free_tier, pricing_starts_at, api_available, open_source, primary_category_id",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!tool) return null;

  const [alternatives, { data: category }] = await Promise.all([
    fetchToolAlternatives(client, slug, PAGE_ALTERNATIVES),
    tool.primary_category_id
      ? client
          .from("categories")
          .select("name, slug")
          .eq("id", tool.primary_category_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!alternatives || alternatives.length === 0) return null;

  const { primary_category_id: _cat, ...rest } = tool;
  return {
    tool: rest as AlternativesPageData["tool"],
    category: (category as { name: string; slug: string } | null) ?? null,
    alternatives,
  };
}
