import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "./+types/search";
import { supabase } from "@/lib/supabase.client";
import { useDebounce } from "@/hooks/useDebounce";
import { ToolCard } from "@/components/tool/ToolCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, X, Sparkles, Zap } from "lucide-react";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Search AI Tools — AI Wiki" },
    { name: "description", content: "Search hundreds of AI tools by name, use case, or description." },
  ];
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface SearchResult {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logo_url: string | null;
  primary_category_id: string | null;
  pricing_tier: string;
  audience_fit: string;
  has_free_tier: boolean;
  api_available: boolean;
  open_source: boolean;
  self_hostable?: boolean | null;
  model_provider?: string | null;
  avg_stars?: number | null;
  rating_count?: number | null;
  category_name?: string | null;
  github_stars?: number | null;
  traffic_tier?: string | null;
  rank: number;
  source?: "fts" | "vector" | "both";
}

async function runFtsSearch(query: string): Promise<SearchResult[]> {
  const { data } = await supabase.rpc("search_tools", {
    query,
    page_size: 24,
    page_offset: 0,
  });
  return ((data as SearchResult[]) ?? []).map((r) => ({ ...r, source: "fts" as const }));
}

async function runVectorSearch(query: string): Promise<SearchResult[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const authHeader = session?.access_token
      ? `Bearer ${session.access_token}`
      : `Bearer ${ANON_KEY}`;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/semantic-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({ query, limit: 24 }),
    });
    if (!res.ok) return [];
    const json = await res.json() as { results?: SearchResult[] };
    return (json.results ?? []).map((r) => ({ ...r, source: "vector" as const }));
  } catch {
    return [];
  }
}

/** Merge FTS + vector results using reciprocal rank fusion */
function mergeResults(fts: SearchResult[], vector: SearchResult[]): SearchResult[] {
  const K = 60;
  const scores = new Map<string, number>();
  const byId = new Map<string, SearchResult>();

  fts.forEach((r, i) => {
    scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (K + i + 1));
    byId.set(r.id, r);
  });
  vector.forEach((r, i) => {
    scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (K + i + 1));
    if (!byId.has(r.id)) byId.set(r.id, r);
    else {
      const existing = byId.get(r.id);
      if (existing) byId.set(r.id, { ...existing, source: "both" });
    }
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => byId.get(id))
    .filter((r): r is SearchResult => !!r);
}

function ResultSkeleton() {
  const keys = ["sk0", "sk1", "sk2", "sk3", "sk4", "sk5"];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {keys.map((k) => <Skeleton key={k} className="h-40 rounded-xl" />)}
    </div>
  );
}

type SourceBadgeProps = { source?: "fts" | "vector" | "both" };
function SourceBadge({ source }: SourceBadgeProps) {
  if (!source || source === "fts") return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
      source === "both" ? "bg-accent/10 text-accent" : "bg-purple-500/10 text-purple-500"
    }`}>
      {source === "both" ? <><Zap size={9} />exact + semantic</> : <><Sparkles size={9} />semantic</>}
    </span>
  );
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [inputVal, setInputVal] = useState(initialQ);
  const debouncedQ = useDebounce(inputVal, 350);
  const inputRef = useRef<HTMLInputElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally omit searchParams/setSearchParams — adding them causes infinite re-render
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (debouncedQ) params.set("q", debouncedQ);
    else params.delete("q");
    setSearchParams(params, { replace: true });
  }, [debouncedQ]);

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["search", debouncedQ],
    queryFn: async () => {
      if (!debouncedQ.trim()) return [];
      // Run FTS + vector in parallel; merge results
      const [fts, vector] = await Promise.all([
        runFtsSearch(debouncedQ),
        debouncedQ.length > 3 ? runVectorSearch(debouncedQ) : Promise.resolve([] as SearchResult[]),
      ]);
      return mergeResults(fts, vector);
    },
    enabled: !!debouncedQ.trim(),
    staleTime: 30 * 1000,
  });

  return (
    <div className="container py-8 max-w-5xl">
      {/* Search input */}
      <div className="relative mb-8">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Search AI tools by name, use case, or description…"
          className="w-full h-12 rounded-xl border border-border bg-surface pl-11 pr-10 text-sm text-text placeholder:text-text-subtle focus:outline-none focus:border-accent transition-colors"
        />
        {inputVal && (
          <button
            type="button"
            onClick={() => { setInputVal(""); inputRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-text-muted hover:text-text transition-colors"
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Results */}
      {!debouncedQ.trim() ? (
        <div className="text-center py-16 text-text-muted">
          <Search size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-base font-medium">Type to search AI tools</p>
          <p className="text-sm mt-1">Searches by name, tagline, and meaning.</p>
        </div>
      ) : isLoading ? (
        <ResultSkeleton />
      ) : results.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-text font-medium mb-2">No results for "{debouncedQ}"</p>
          <p className="text-text-muted text-sm mb-6">Try different keywords or browse by category.</p>
          <Link to="/tools" className="text-accent hover:underline text-sm">Browse all tools →</Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-text-muted mb-4">
            {results.length} result{results.length !== 1 ? "s" : ""} for "{debouncedQ}"
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((r) => (
              <div key={r.id} className="relative">
                <div className="absolute top-2 right-2 z-10">
                  <SourceBadge source={r.source} />
                </div>
                <ToolCard
                  tool={{
                    id: r.id,
                    slug: r.slug,
                    name: r.name,
                    tagline: r.tagline,
                    logo_url: r.logo_url,
                    pricing_tier: r.pricing_tier,
                    audience_fit: r.audience_fit,
                    has_free_tier: r.has_free_tier,
                    api_available: r.api_available,
                    open_source: r.open_source,
                  }}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
