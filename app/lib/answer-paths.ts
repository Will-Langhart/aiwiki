/**
 * Published answer-page path discovery, shared by react-router.config.ts
 * (prerender list) and scripts/generate-sitemap.ts. Like compare-paths.ts, it
 * avoids path-alias imports so it resolves from both contexts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AnswerSlug {
  slug: string;
  /** W3C date (YYYY-MM-DD) from the answer's freshness, when parseable. */
  lastmod?: string;
}

function toLastmod(ts?: string | null): string | undefined {
  if (!ts) return undefined;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

export async function getPublishedAnswerSlugs(client: SupabaseClient): Promise<AnswerSlug[]> {
  const { data } = await client
    .from("public_answers")
    .select("slug, updated_at, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  return ((data ?? []) as Array<{ slug: string; updated_at: string | null; published_at: string | null }>).map(
    (a) => ({ slug: a.slug, lastmod: toLastmod(a.updated_at ?? a.published_at) }),
  );
}

export async function getPublishedAnswerPaths(client: SupabaseClient): Promise<string[]> {
  const slugs = await getPublishedAnswerSlugs(client);
  return slugs.map((s) => `/answers/${s.slug}`);
}
