import { useSearchParams, useLoaderData } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Route } from "./+types/tools._index";
import { supabase } from "@/lib/supabase.client";
import { createBuildClient } from "@/lib/supabase.server";
import { DirectoryGrid } from "@/components/directory/DirectoryGrid";
import { FilterBar } from "@/components/directory/FilterBar";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { baseMeta, jsonLd, breadcrumbLd } from "@/lib/seo";

export function meta(_: Route.MetaArgs) {
  return [
    ...baseMeta({
      title: "Browse AI Tools — AI Wiki",
      description:
        "Discover and compare the best AI tools. Filter by category, pricing, audience, and more across our community-curated directory.",
      path: "/tools",
    }),
    jsonLd(
      breadcrumbLd([
        { name: "Home", path: "/" },
        { name: "Tools", path: "/tools" },
      ]),
    ),
  ];
}

interface ToolResult {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logo_url: string | null;
  primary_category_id: string | null;
  pricing_tier: string;
  has_free_tier?: boolean;
  audience_fit: string;
  api_available?: boolean;
  open_source?: boolean;
  self_hostable?: boolean | null;
  model_provider?: string | null;
  avg_stars?: number | null;
  rating_count?: number | null;
  category_name?: string | null;
  category_slug?: string | null;
  is_featured?: boolean;
  github_stars?: number | null;
  pricing_detail?: string | null;
  integrations?: string[] | null;
  traffic_tier?: string | null;
  rank: number;
}

interface Category {
  id: string;
  slug: string;
  name: string;
}

async function fetchCategories(client: SupabaseClient): Promise<Category[]> {
  const { data } = await client
    .from("categories")
    .select("id, slug, name")
    .order("sort_order");
  return data ?? [];
}

async function fetchTools(
  client: SupabaseClient,
  params: {
    q: string;
    cats: string[];
    pricing: string[];
    audiences: string[];
    api: boolean | null;
    oss: boolean | null;
  },
): Promise<ToolResult[]> {
  const { data, error } = await client.rpc("search_tools", {
    query: params.q || undefined,
    cat_slugs: params.cats.length > 0 ? params.cats : undefined,
    pricing_tiers: params.pricing.length > 0 ? params.pricing : undefined,
    audiences: params.audiences.length > 0 ? params.audiences : undefined,
    has_api: params.api ?? undefined,
    open_source: params.oss ?? undefined,
    page_size: 500,
    page_offset: 0,
  });
  if (error) throw new Error(error.message);
  return (data as ToolResult[]) ?? [];
}

const EMPTY_FILTERS = {
  q: "",
  cats: [] as string[],
  pricing: [] as string[],
  audiences: [] as string[],
  api: null,
  oss: null,
} as const;

interface DirectoryData {
  categories: Category[];
  tools: ToolResult[];
}

async function fetchDirectoryData(client: SupabaseClient): Promise<DirectoryData> {
  const [categories, tools] = await Promise.all([
    fetchCategories(client),
    fetchTools(client, EMPTY_FILTERS),
  ]);
  return { categories, tools };
}

// Prerender the unfiltered directory so the full tool grid ships in static HTML.
export async function loader(_: Route.LoaderArgs) {
  return fetchDirectoryData(createBuildClient());
}

export async function clientLoader(_: Route.ClientLoaderArgs) {
  return fetchDirectoryData(supabase);
}

export default function ToolsIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState(searchParams.get("q") ?? "");
  const debouncedInput = useDebounce(inputValue, 300);

  const cats = searchParams.getAll("cat");
  const pricing = searchParams.getAll("pricing");
  const audiences = searchParams.getAll("audience");
  const api = searchParams.get("api") === "true" ? true : null;
  const oss = searchParams.get("oss") === "true" ? true : null;
  const q = searchParams.get("q") ?? "";

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally omit searchParams/setSearchParams — adding them causes infinite re-render
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (debouncedInput) {
      next.set("q", debouncedInput);
    } else {
      next.delete("q");
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [debouncedInput]);

  const initial = useLoaderData<typeof loader>();
  const noFilters =
    !q &&
    cats.length === 0 &&
    pricing.length === 0 &&
    audiences.length === 0 &&
    api === null &&
    oss === null;

  const { data: categories = [], isLoading: catsLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => fetchCategories(supabase),
    initialData: initial.categories,
    staleTime: 5 * 60 * 1000,
  });

  const { data: tools = [], isLoading: toolsLoading } = useQuery({
    queryKey: ["tools", q, cats, pricing, audiences, api, oss],
    queryFn: () => fetchTools(supabase, { q, cats, pricing, audiences, api, oss }),
    // Seed only the unfiltered view (the prerendered canonical /tools page).
    initialData: noFilters ? initial.tools : undefined,
    staleTime: 60 * 1000,
  });

  return (
    <div className="container py-8">
      {/* Page header */}
      <div className="mb-7 relative">
        <div
          className="absolute -left-6 top-0 w-72 h-24 pointer-events-none opacity-[0.15]"
          style={{ background: "radial-gradient(ellipse at left top, var(--accent), transparent 65%)" }}
        />
        <h1 className="text-3xl font-bold text-text tracking-tight relative">
          AI Tools Directory
        </h1>
        <p className="text-text-muted mt-1.5 relative">
          Community-curated. Every workflow covered.
        </p>
      </div>

      {/* Toolbar: search + filters grouped into one panel */}
      <div className="rounded-xl border border-border bg-surface/40 p-3 sm:p-4 space-y-3.5 mb-6">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" size={15} />
          <Input
            type="search"
            placeholder="Search tools, categories, use cases…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="pl-9 pr-9 h-10 bg-surface border-border focus:border-accent/50 transition-colors"
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => {
                setInputValue("");
                const next = new URLSearchParams(searchParams);
                next.delete("q");
                setSearchParams(next, { replace: true });
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter bar */}
        {!catsLoading && (
          <FilterBar
            categories={categories}
            resultCount={tools.length}
            loading={toolsLoading}
          />
        )}
      </div>

      {/* Grid */}
      <DirectoryGrid tools={tools} loading={toolsLoading} />
    </div>
  );
}
