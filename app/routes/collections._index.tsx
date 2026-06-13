import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import type { Route } from "./+types/collections._index";
import { supabase } from "@/lib/supabase.client";
import { Skeleton } from "@/components/ui/skeleton";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "AI Tool Collections — AI Wiki" },
    {
      name: "description",
      content:
        "Curated lists of the best AI tools by category and use case. Updated rankings with editorial blurbs.",
    },
  ];
}

interface Collection {
  slug: string;
  title: string;
  h1: string;
  description: string;
  icon: string | null;
  sort_order: number | null;
  tool_count?: number;
}

async function fetchCollections(): Promise<Collection[]> {
  const { data, error } = await supabase
    .from("collections")
    .select("slug, title, h1, description, icon, sort_order")
    .order("sort_order");
  if (error) throw new Error(error.message);

  if (!data?.length) return [];

  // Get tool counts
  const { data: counts } = await supabase
    .from("collection_tools")
    .select("collection_id, collections!inner(slug)")
    .in(
      "collection_id",
      data.map((c) => c.slug),
    );

  const slugCounts: Record<string, number> = {};
  if (counts) {
    for (const row of counts) {
      const slug = (row.collections as unknown as { slug: string })?.slug;
      if (slug) slugCounts[slug] = (slugCounts[slug] ?? 0) + 1;
    }
  }

  return data.map((c) => ({ ...c, tool_count: slugCounts[c.slug] ?? 0 }));
}

function CollectionSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

export default function CollectionsIndex() {
  const { data: collections = [], isLoading } = useQuery({
    queryKey: ["collections"],
    queryFn: fetchCollections,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="container py-10">
      {/* Header */}
      <div className="mb-9 relative">
        <div
          className="absolute -left-6 top-0 w-80 h-28 pointer-events-none opacity-[0.15]"
          style={{
            background:
              "radial-gradient(ellipse at left top, var(--accent), transparent 65%)",
          }}
        />
        <h1 className="text-3xl font-bold text-text tracking-tight relative">
          AI Tool Collections
        </h1>
        <p className="text-text-muted mt-1.5 relative max-w-xl">
          Curated, ranked lists of the best AI tools for every use case. Updated
          regularly.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 12 }, (_, i) => `skel-${i}`).map((id) => (
              <CollectionSkeleton key={id} />
            ))
          : collections.map((col) => (
              <Link
                key={col.slug}
                to={`/collections/${col.slug}`}
                className="group rounded-xl border border-border bg-surface p-5 flex flex-col gap-3 hover:border-accent/40 hover:shadow-[var(--shadow-card)] transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl leading-none">{col.icon}</span>
                    <h2 className="text-sm font-semibold text-text leading-snug line-clamp-2">
                      {col.h1}
                    </h2>
                  </div>
                  <ArrowRight
                    size={14}
                    className="text-text-subtle group-hover:text-accent transition-colors flex-shrink-0 mt-0.5"
                  />
                </div>
                <p className="text-xs text-text-muted leading-relaxed line-clamp-2">
                  {col.description}
                </p>
                {col.tool_count != null && col.tool_count > 0 && (
                  <span className="text-xs text-text-subtle">
                    {col.tool_count} tools
                  </span>
                )}
              </Link>
            ))}
      </div>
    </div>
  );
}
