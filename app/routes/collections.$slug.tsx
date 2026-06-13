import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Trophy } from "lucide-react";
import type { Route } from "./+types/collections.$slug";
import { supabase } from "@/lib/supabase.client";
import { ToolCard } from "@/components/tool/ToolCard";
import { Skeleton } from "@/components/ui/skeleton";

interface CollectionData {
  id: string;
  slug: string;
  title: string;
  h1: string;
  description: string;
  meta_description: string | null;
  icon: string | null;
}

interface CollectionTool {
  rank: number;
  blurb: string | null;
  tool: {
    id: string;
    slug: string;
    name: string;
    tagline: string;
    logo_url: string | null;
    pricing_tier: string;
    has_free_tier: boolean;
    audience_fit: string;
    api_available: boolean;
    open_source: boolean;
    avg_stars: number | null;
    rating_count: number | null;
    category_name: string | null;
    category_slug: string | null;
  };
}

async function fetchCollection(slug: string): Promise<CollectionData | null> {
  const { data } = await supabase
    .from("collections")
    .select("id, slug, title, h1, description, meta_description, icon")
    .eq("slug", slug)
    .single();
  return data ?? null;
}

async function fetchCollectionTools(collectionId: string): Promise<CollectionTool[]> {
  const { data, error } = await supabase
    .from("collection_tools")
    .select(`
      rank,
      blurb,
      tools (
        id, slug, name, tagline, logo_url, pricing_tier, has_free_tier,
        audience_fit, api_available, open_source,
        categories ( name, slug )
      )
    `)
    .eq("collection_id", collectionId)
    .order("rank");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const t = row.tools as unknown as {
      id: string; slug: string; name: string; tagline: string;
      logo_url: string | null; pricing_tier: string; has_free_tier: boolean;
      audience_fit: string; api_available: boolean; open_source: boolean;
      categories: { name: string; slug: string } | null;
    };
    return {
      rank: row.rank,
      blurb: row.blurb,
      tool: {
        id: t.id,
        slug: t.slug,
        name: t.name,
        tagline: t.tagline,
        logo_url: t.logo_url,
        pricing_tier: t.pricing_tier,
        has_free_tier: t.has_free_tier,
        audience_fit: t.audience_fit,
        api_available: t.api_available,
        open_source: t.open_source,
        avg_stars: null,
        rating_count: null,
        category_name: t.categories?.name ?? null,
        category_slug: t.categories?.slug ?? null,
      },
    };
  });
}

export function meta({ params }: Route.MetaArgs) {
  return [
    { title: `${params.slug?.replace(/-/g, " ")} — AI Wiki Collections` },
  ];
}

function ToolRowSkeleton() {
  return (
    <div className="flex items-start gap-4 py-4 border-b border-border last:border-0">
      <Skeleton className="w-7 h-7 rounded flex-shrink-0 mt-1" />
      <div className="rounded-xl border border-border bg-surface p-4 flex-1 space-y-2">
        <div className="flex items-start gap-3">
          <Skeleton className="w-9 h-9 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function CollectionPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: collection, isLoading: colLoading } = useQuery({
    queryKey: ["collection", slug],
    queryFn: () => fetchCollection(slug!),
    staleTime: 5 * 60 * 1000,
    enabled: !!slug,
  });

  const { data: items = [], isLoading: toolsLoading } = useQuery({
    queryKey: ["collection-tools", collection?.id],
    queryFn: () => fetchCollectionTools(collection!.id),
    staleTime: 5 * 60 * 1000,
    enabled: !!collection?.id,
  });

  const isLoading = colLoading || toolsLoading;

  if (!isLoading && !collection) {
    return (
      <div className="container py-20 text-center">
        <p className="text-text-muted">Collection not found.</p>
        <Link to="/collections" className="text-accent text-sm mt-2 inline-block hover:underline">
          Browse all collections
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-3xl">
      {/* Back */}
      <Link
        to="/collections"
        className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors mb-6"
      >
        <ChevronLeft size={13} />
        All collections
      </Link>

      {/* Hero */}
      <div className="mb-8 relative">
        <div
          className="absolute -left-6 top-0 w-72 h-24 pointer-events-none opacity-[0.15]"
          style={{
            background:
              "radial-gradient(ellipse at left top, var(--accent), transparent 65%)",
          }}
        />
        {colLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl leading-none">{collection?.icon}</span>
              <h1 className="text-2xl sm:text-3xl font-bold text-text tracking-tight">
                {collection?.h1}
              </h1>
            </div>
            <p className="text-text-muted leading-relaxed max-w-2xl">
              {collection?.description}
            </p>
          </>
        )}
      </div>

      {/* Ranked list */}
      <div>
        {isLoading
          ? Array.from({ length: 8 }, (_, i) => `skel-${i}`).map((id) => (
              <ToolRowSkeleton key={id} />
            ))
          : items.map((item) => (
              <div
                key={item.tool.id}
                className="flex items-start gap-3 sm:gap-4 py-4 border-b border-border last:border-0"
              >
                {/* Rank badge */}
                <div className="flex-shrink-0 w-8 flex flex-col items-center pt-1 gap-1">
                  {RANK_MEDAL[item.rank] ? (
                    <span className="text-xl leading-none">{RANK_MEDAL[item.rank]}</span>
                  ) : (
                    <span className="text-xs font-bold text-text-subtle tabular-nums">
                      #{item.rank}
                    </span>
                  )}
                </div>

                {/* Tool card + optional blurb */}
                <div className="flex-1 min-w-0">
                  <ToolCard tool={item.tool} />
                  {item.blurb && (
                    <p className="mt-2 text-xs text-text-muted leading-relaxed pl-1">
                      {item.blurb}
                    </p>
                  )}
                </div>
              </div>
            ))}

        {!isLoading && items.length === 0 && (
          <div className="py-16 text-center">
            <Trophy size={32} className="mx-auto text-text-subtle mb-3" />
            <p className="text-text-muted text-sm">No tools in this collection yet.</p>
          </div>
        )}
      </div>

      {/* CTA */}
      {!isLoading && items.length > 0 && (
        <div className="mt-10 pt-8 border-t border-border text-center">
          <p className="text-text-muted text-sm mb-3">
            Know a tool that belongs here?
          </p>
          <Link
            to="/suggest"
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline font-medium"
          >
            Suggest a tool
          </Link>
        </div>
      )}
    </div>
  );
}
