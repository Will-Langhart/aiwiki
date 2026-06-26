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
      {/* Hero header */}
      <div className="relative mb-8 rounded-2xl border border-border bg-surface/50 overflow-hidden px-6 py-12 text-center">
        {/* Background radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 70% 60% at 50% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%)" }}
        />
        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{ backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)", backgroundSize: "32px 32px" }}
        />
        {/* Accent top line */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(to right, transparent, var(--accent) 30%, var(--accent) 70%, transparent)" }}
        />

        <div className="relative">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-accent/25 bg-accent/8 text-accent text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Community-curated directory
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-text tracking-tight">
            AI Tools Directory
          </h1>
          <p className="text-text-muted mt-3 text-lg max-w-md mx-auto">
            Every workflow covered. Find the right tool fast.
          </p>
        </div>
      </div>

      {/* Toolbar: search + filters */}
      <div className="relative rounded-xl border border-border bg-surface/60 backdrop-blur-sm p-4 sm:p-5 space-y-4 mb-6 shadow-sm overflow-hidden">
        {/* Accent top border */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(to right, transparent, var(--accent) 30%, var(--accent) 70%, transparent)" }}
        />

        {/* Search bar */}
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors pointer-events-none" size={16} />
          <Input
            type="search"
            placeholder="Search 463 AI tools by name, category, or use case…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="pl-11 pr-24 h-12 text-sm bg-bg border-border/70 focus:border-accent/60 focus:ring-2 focus:ring-accent/10 transition-all rounded-lg"
          />
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {inputValue ? (
              <button
                type="button"
                onClick={() => {
                  setInputValue("");
                  const next = new URLSearchParams(searchParams);
                  next.delete("q");
                  setSearchParams(next, { replace: true });
                }}
                className="text-text-muted hover:text-text transition-colors"
              >
                <X size={14} />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border/60 bg-surface text-[10px] text-text-subtle font-mono">
                ⌘K
              </kbd>
            )}
          </div>
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
