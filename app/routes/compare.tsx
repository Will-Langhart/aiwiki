import { useSearchParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "./+types/compare";
import { supabase } from "@/lib/supabase.client";
import { CompareTable } from "@/components/compare/CompareTable";
import { useCompareStore } from "@/stores/compare";
import { Skeleton } from "@/components/ui/skeleton";
import { GitCompare, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Compare AI Tools — AI Wiki" },
    { name: "description", content: "Compare AI tools side-by-side. See pricing, features, and capabilities at a glance." },
  ];
}

interface ComparableTool {
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

async function fetchToolsBySlug(slugs: string[]): Promise<ComparableTool[]> {
  if (slugs.length === 0) return [];

  const { data: tools, error } = await supabase
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
    const { data: categories } = await supabase
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
      category_name: t.primary_category_id ? (categoryMap.get(t.primary_category_id) ?? null) : null,
    }));
}

const SKELETON_COL_KEYS = ["sk-label", "sk-col-1", "sk-col-2", "sk-col-3", "sk-col-4"];
const SKELETON_ROW_KEYS = ["sk-r0", "sk-r1", "sk-r2", "sk-r3", "sk-r4", "sk-r5", "sk-r6", "sk-r7"];

function CompareSkeleton({ count }: { count: number }) {
  return (
    <div className="overflow-x-auto">
      <div className="grid gap-4" style={{ gridTemplateColumns: `9rem repeat(${count}, 1fr)` }}>
        {SKELETON_COL_KEYS.slice(0, count + 1).map((key, i) => (
          <div key={key} className="space-y-3">
            {i > 0 && <Skeleton className="h-12 w-12 rounded-xl mx-auto" />}
            {i > 0 && <Skeleton className="h-4 w-24 mx-auto" />}
            {SKELETON_ROW_KEYS.map((rk) => (
              <Skeleton key={rk} className="h-8 w-full rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ComparePage() {
  const [searchParams] = useSearchParams();
  const { items } = useCompareStore();

  const toolsParam = searchParams.get("tools") ?? "";
  const slugs = toolsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { data: tools = [], isLoading } = useQuery({
    queryKey: ["compare-tools", slugs.join(",")],
    queryFn: () => fetchToolsBySlug(slugs),
    enabled: slugs.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Empty state — no tools specified
  if (slugs.length === 0) {
    return (
      <div className="container py-16 max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 mb-6">
          <GitCompare size={28} className="text-accent" />
        </div>
        <h1 className="text-3xl font-bold text-text mb-3">Compare AI Tools</h1>
        <p className="text-text-muted mb-8 text-base leading-relaxed">
          Select tools from the directory to compare them side-by-side. You can compare up to 4 tools at once.
        </p>
        {items.length >= 2 ? (
          <Link
            to={`/compare?tools=${items.map((i) => i.slug).join(",")}`}
            className={cn(buttonVariants({ variant: "default" }))}
          >
            <GitCompare size={16} className="mr-2" />
            Compare selected tools ({items.length})
          </Link>
        ) : (
          <Link to="/tools" className={cn(buttonVariants({ variant: "outline" }))}>
            <Plus size={16} className="mr-2" />
            Browse tools to compare
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <GitCompare size={20} className="text-accent" />
          <h1 className="text-2xl font-bold text-text">Tool Comparison</h1>
        </div>
        {!isLoading && tools.length > 0 && (
          <p className="text-text-muted text-sm">
            Comparing {tools.map((t) => t.name).join(" vs ")}
          </p>
        )}
      </div>

      {isLoading ? (
        <CompareSkeleton count={slugs.length} />
      ) : tools.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-text-muted mb-4">No tools found for the given slugs.</p>
          <Link to="/tools" className={cn(buttonVariants({ variant: "outline" }))}>
            Browse directory
          </Link>
        </div>
      ) : (
        <>
          <CompareTable tools={tools} />

          {/* Add another tool CTA */}
          {tools.length < 4 && (
            <div className="mt-8 flex justify-center">
              <Link to="/tools" className={cn(buttonVariants({ variant: "outline" }))}>
                <Plus size={15} className="mr-1.5" />
                Add another tool to compare
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
