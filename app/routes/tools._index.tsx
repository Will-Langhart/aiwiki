import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import type { Route } from "./+types/tools._index";
import { supabase } from "@/lib/supabase.client";
import { DirectoryGrid } from "@/components/directory/DirectoryGrid";
import { FilterSidebar } from "@/components/directory/FilterSidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SlidersHorizontal, Search, X } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Browse AI Tools — AI Wiki" },
    { name: "description", content: "Discover and compare the best AI tools. Filter by category, pricing, audience, and more." },
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
  rank: number;
}

interface Category {
  id: string;
  slug: string;
  name: string;
}

async function fetchCategories(): Promise<Category[]> {
  const { data } = await supabase
    .from("categories")
    .select("id, slug, name")
    .order("sort_order");
  return data ?? [];
}

async function fetchTools(params: {
  q: string;
  cats: string[];
  pricing: string[];
  audiences: string[];
  api: boolean | null;
  oss: boolean | null;
}): Promise<ToolResult[]> {
  const { data, error } = await supabase.rpc("search_tools", {
    query: params.q || undefined,
    cat_slugs: params.cats.length > 0 ? params.cats : undefined,
    pricing_tiers: params.pricing.length > 0 ? params.pricing : undefined,
    audiences: params.audiences.length > 0 ? params.audiences : undefined,
    has_api: params.api ?? undefined,
    open_source: params.oss ?? undefined,
    page_size: 60,
    page_offset: 0,
  });
  if (error) throw new Error(error.message);
  return (data as ToolResult[]) ?? [];
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

  // Sync debounced input → URL (must be in useEffect, not during render)
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
  }, [debouncedInput]); // only fire when debounced value changes

  const { data: categories = [], isLoading: catsLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
  });

  const { data: tools = [], isLoading: toolsLoading } = useQuery({
    queryKey: ["tools", q, cats, pricing, audiences, api, oss],
    queryFn: () => fetchTools({ q, cats, pricing, audiences, api, oss }),
    staleTime: 60 * 1000,
  });

  const hasActiveFilters =
    cats.length > 0 || pricing.length > 0 || audiences.length > 0 || api || oss;

  return (
    <div className="container py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-text">AI Tools Directory</h1>
        <p className="text-text-muted mt-1">
          Discover and compare {tools.length > 0 ? `${tools.length} ` : ""}AI tools for every workflow.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
        <Input
          type="search"
          placeholder="Search tools…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="pl-9 pr-9"
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
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex gap-8">
        {/* Desktop sidebar */}
        <div className="hidden lg:block w-52 flex-shrink-0">
          {!catsLoading && (
            <FilterSidebar categories={categories} />
          )}
        </div>

        {/* Mobile filter sheet */}
        <div className="lg:hidden mb-4">
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="outline" size="sm" className="gap-2">
                  <SlidersHorizontal size={14} />
                  Filters
                  {hasActiveFilters && (
                    <span className="ml-1 w-4 h-4 rounded-full bg-accent text-accent-fg text-xs flex items-center justify-center">
                      {cats.length + pricing.length + audiences.length + (api ? 1 : 0) + (oss ? 1 : 0)}
                    </span>
                  )}
                </Button>
              }
            />
            <SheetContent side="left" className="w-72 overflow-y-auto">
              <div className="pt-6">
                <FilterSidebar categories={categories} />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Grid */}
        <div className="flex-1 min-w-0">
          <DirectoryGrid tools={tools} loading={toolsLoading} />
        </div>
      </div>
    </div>
  );
}
