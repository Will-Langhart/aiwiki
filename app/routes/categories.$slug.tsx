import { useMemo } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Bot,
  BrainCircuit,
  Briefcase,
  Code2,
  Database,
  Eye,
  GraduationCap,
  Headphones,
  Image,
  Layers,
  LayoutGrid,
  Mic,
  PenLine,
  Presentation,
  Scale,
  Search,
  Shield,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  Users,
  Video,
  Wallet,
  Workflow,
  Wrench,
} from "lucide-react";
import type { Route } from "./+types/categories.$slug";
import { supabase } from "@/lib/supabase.client";
import { createBuildClient } from "@/lib/supabase.server";
import { ToolCard } from "@/components/tool/ToolCard";
import { baseMeta, breadcrumbLd, itemListLd, jsonLd } from "@/lib/seo";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

interface CategoryTool {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logo_url: string | null;
  primary_category_id: string | null;
  pricing_tier: string;
  pricing_detail?: string | null;
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
  integrations?: string[] | null;
  traffic_tier?: string | null;
  rank: number;
}

interface CategoryData {
  category: Category | null;
  tools: CategoryTool[];
  others: Array<Category & { count: number }>;
}

// ── Copy ──────────────────────────────────────────────────────────────────────
// Most rows in public.categories have no description yet; these one-liners fill
// the gap (the DB value wins when it exists).
const BLURBS: Record<string, string> = {
  "chat-assistants":
    "General-purpose AI assistants and chat interfaces for writing, research, analysis and everyday questions.",
  coding:
    "AI coding assistants, editors, terminals, code review and app builders that write code with you.",
  "image-generation":
    "Generate, edit and upscale images and artwork from text prompts or references.",
  video: "Create and edit video with AI — avatars, text-to-video, clipping, captions and dubbing.",
  "audio-music": "Generate music, separate stems, and edit or enhance audio with AI.",
  "search-research":
    "AI search engines, research assistants and web-data APIs that cite their sources.",
  writing: "Draft, rewrite and polish copy, long-form writing and documents with AI.",
  "presentations-docs": "Build slide decks, documents and visuals from a prompt or an outline.",
  design: "AI tools for UI/UX, branding, graphics and design systems.",
  "data-analytics":
    "Ask questions of spreadsheets and databases, build charts and analyze data with AI.",
  automation: "Automate workflows and business processes across your apps with AI agents.",
  infrastructure: "Model inference APIs, GPU clouds and LLM gateways for building AI products.",
  voice: "Text-to-speech, speech-to-text, voice cloning and voice-agent platforms.",
  "marketing-sales": "AI for marketing content, SEO, ads and sales outreach.",
  "vector-databases": "Purpose-built databases for embeddings, semantic search and retrieval.",
  "mlops-training": "Train, fine-tune, label, track and serve machine-learning models.",
  "agent-frameworks": "Libraries and SDKs for building AI agents and LLM pipelines.",
  "ai-observability": "Trace, monitor and evaluate LLM applications in production.",
  productivity: "Notes, tasks, calendars, meetings and knowledge tools with AI built in.",
  "customer-support": "AI agents and helpdesk tools that resolve customer questions.",
  education: "AI tutors, teaching assistants and learning tools for students and educators.",
  "no-code": "Build websites and apps without code, with AI doing the heavy lifting.",
  security: "Security for and with AI — LLM guardrails, threat detection and SOC automation.",
  legal: "AI for legal research, contract review, drafting and compliance.",
  "hr-recruiting": "Source, screen and interview candidates and run HR with AI.",
  finance: "AI for accounting, financial research, FP&A and spend management.",
  healthcare: "Clinical documentation, medical AI and biotech research tools.",
};

const ICONS: Record<string, React.ElementType> = {
  "chat-assistants": BrainCircuit,
  coding: Code2,
  "image-generation": Image,
  video: Video,
  "audio-music": Headphones,
  "search-research": BookOpen,
  writing: PenLine,
  "presentations-docs": Presentation,
  design: Sparkles,
  "data-analytics": BarChart3,
  automation: Workflow,
  infrastructure: Database,
  voice: Mic,
  "marketing-sales": ShoppingBag,
  "vector-databases": Layers,
  "mlops-training": Wrench,
  "agent-frameworks": Bot,
  "ai-observability": Eye,
  productivity: LayoutGrid,
  "customer-support": Users,
  education: GraduationCap,
  "no-code": Sparkles,
  security: Shield,
  legal: Scale,
  "hr-recruiting": Briefcase,
  finance: Wallet,
  healthcare: Stethoscope,
};

function blurbFor(c: Category) {
  return (
    c.description ||
    BLURBS[c.slug] ||
    `Browse the best ${c.name.toLowerCase()} AI tools on AI Wiki.`
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────
async function fetchCategoryData(client: SupabaseClient, slug: string): Promise<CategoryData> {
  const [{ data: categories }, toolsRes, { data: primaries }] = await Promise.all([
    client.from("categories").select("id, slug, name, description").order("sort_order"),
    client.rpc("search_tools", { cat_slugs: [slug], page_size: 1000, page_offset: 0 }),
    // Primary-category ids of every published tool → counts for the "other
    // categories" chips. One small column, ~550 rows.
    client
      .from("tools")
      .select("primary_category_id")
      .eq("status", "published")
      .range(0, 1999),
  ]);
  if (toolsRes.error) throw new Error(toolsRes.error.message);

  const all = (categories ?? []) as Category[];
  const counts = new Map<string, number>();
  for (const t of (primaries ?? []) as Array<{ primary_category_id: string | null }>) {
    if (t.primary_category_id)
      counts.set(t.primary_category_id, (counts.get(t.primary_category_id) ?? 0) + 1);
  }
  return {
    category: all.find((c) => c.slug === slug) ?? null,
    tools: (toolsRes.data as CategoryTool[]) ?? [],
    others: all
      .filter((c) => c.slug !== slug)
      .map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }))
      .filter((c) => c.count > 0),
  };
}

// Prerendered per category at build time so the full tool list ships in the
// static HTML for crawlers; the client loader serves in-app navigations.
export async function loader({ params }: Route.LoaderArgs) {
  return fetchCategoryData(createBuildClient(), params.slug);
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return fetchCategoryData(supabase, params.slug);
}

export function meta({ data, params }: Route.MetaArgs) {
  const path = `/categories/${params.slug}`;
  const category = data?.category;
  if (!category) {
    return baseMeta({
      title: "Category not found — AI Wiki",
      description: "This category doesn't exist.",
      path,
      noindex: true,
    });
  }
  const n = data.tools.length;
  return [
    ...baseMeta({
      title: `Best ${category.name} AI Tools (${n}) — AI Wiki`,
      description: `${blurbFor(category)} Compare ${n} ${category.name.toLowerCase()} tools by pricing, free tiers, APIs and open-source options.`,
      path,
    }),
    jsonLd(
      breadcrumbLd([
        { name: "AI Wiki", path: "/" },
        { name: "Directory", path: "/tools" },
        { name: category.name, path },
      ]),
    ),
    jsonLd(itemListLd(data.tools.slice(0, 25).map((t) => ({ name: t.name, slug: t.slug })))),
  ];
}

// ── Filters (URL state) ───────────────────────────────────────────────────────
const PRICING_FILTERS = [
  { value: "", label: "All" },
  { value: "free", label: "Free & freemium" },
  { value: "paid", label: "Paid" },
  { value: "enterprise", label: "Enterprise" },
] as const;

const SORTS = [
  { value: "", label: "Popular" },
  { value: "az", label: "A–Z" },
  { value: "rated", label: "Top rated" },
] as const;

function applyFilters(tools: CategoryTool[], params: URLSearchParams) {
  const pricing = params.get("pricing") ?? "";
  const api = params.get("api") === "1";
  const oss = params.get("oss") === "1";
  const sort = params.get("sort") ?? "";
  let out = tools.filter((t) => {
    if (
      pricing === "free" &&
      !(t.pricing_tier === "free" || t.pricing_tier === "freemium" || t.has_free_tier)
    )
      return false;
    if (pricing === "paid" && t.pricing_tier !== "paid") return false;
    if (pricing === "enterprise" && t.pricing_tier !== "enterprise") return false;
    if (api && !t.api_available) return false;
    if (oss && !t.open_source) return false;
    return true;
  });
  if (sort === "az") out = [...out].sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "rated") {
    out = [...out].sort(
      (a, b) =>
        (b.avg_stars ?? 0) - (a.avg_stars ?? 0) || (b.rating_count ?? 0) - (a.rating_count ?? 0),
    );
  }
  return out;
}

function Chip({
  active,
  onClick,
  children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
        active
          ? "bg-accent/10 border-accent/40 text-accent"
          : "bg-surface border-border text-text-muted hover:text-text hover:border-text-subtle"
      }`}
    >
      {children}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CategoryPage() {
  const { category, tools, others } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const visible = useMemo(() => applyFilters(tools, params), [tools, params]);

  if (!category) {
    return (
      <div className="container py-16 text-center">
        <h1 className="text-2xl font-bold text-text mb-2">Category not found</h1>
        <p className="text-text-muted mb-6">We couldn't find that category.</p>
        <Link to="/tools" className="text-accent hover:underline">
          Browse all tools
        </Link>
      </div>
    );
  }

  const Icon = ICONS[category.slug] ?? Search;
  const freeCount = tools.filter(
    (t) => t.pricing_tier === "free" || t.pricing_tier === "freemium" || t.has_free_tier,
  ).length;
  const apiCount = tools.filter((t) => t.api_available).length;
  const ossCount = tools.filter((t) => t.open_source).length;
  const filtered = !!(params.get("pricing") || params.get("api") || params.get("oss"));

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true, preventScrollReset: true });
  }

  return (
    <div className="container py-[var(--space-section,2.5rem)]">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-5 text-xs text-text-subtle">
        <Link
          to="/tools"
          className="inline-flex items-center gap-1 hover:text-text transition-colors"
        >
          <ArrowLeft size={12} /> Directory
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-text-muted">{category.name}</span>
      </nav>

      {/* Header */}
      <header className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 sm:p-8 mb-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full opacity-[0.12] blur-3xl"
          style={{ background: "var(--accent)" }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-accent/10 border border-accent/20">
            <Icon size={26} className="text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="section-eyebrow">Category</span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text">
              {category.name} AI tools
            </h1>
            <p className="mt-1.5 text-sm sm:text-base text-text-muted max-w-2xl">
              {blurbFor(category)}
            </p>
          </div>
        </div>
        <dl className="relative mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Tools", value: tools.length },
            { label: "Free options", value: freeCount },
            { label: "With API", value: apiCount },
            { label: "Open source", value: ossCount },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border/70 bg-bg/40 px-4 py-3">
              <dt className="text-[11px] uppercase tracking-wide text-text-subtle">{s.label}</dt>
              <dd className="text-xl font-bold text-text">{s.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-2">
          {PRICING_FILTERS.map((f) => (
            <Chip
              key={f.value}
              active={(params.get("pricing") ?? "") === f.value}
              onClick={() => setParam("pricing", f.value)}
            >
              {f.label}
            </Chip>
          ))}
          <span className="mx-1 h-5 w-px bg-border hidden sm:block" aria-hidden="true" />
          <Chip
            active={params.get("api") === "1"}
            onClick={() => setParam("api", params.get("api") === "1" ? "" : "1")}
          >
            Has API
          </Chip>
          <Chip
            active={params.get("oss") === "1"}
            onClick={() => setParam("oss", params.get("oss") === "1" ? "" : "1")}
          >
            Open source
          </Chip>
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          <span className="text-xs text-text-subtle tabular-nums">
            {visible.length} of {tools.length}
          </span>
          <label className="sr-only" htmlFor="cat-sort">
            Sort
          </label>
          <select
            id="cat-sort"
            value={params.get("sort") ?? ""}
            onChange={(e) => setParam("sort", e.target.value)}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-accent/60"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid */}
      {visible.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-[var(--space-section,3rem)]">
          {visible.map((t) => (
            <ToolCard key={t.id} tool={t} dense />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-10 text-center mb-12">
          <p className="text-sm text-text-muted mb-3">
            No {category.name.toLowerCase()} tools match these filters.
          </p>
          {filtered && (
            <button
              type="button"
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
              className="text-sm text-accent hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Other categories */}
      <section aria-labelledby="other-cats" className="border-t border-border pt-8">
        <span className="section-eyebrow">Keep exploring</span>
        <h2 id="other-cats" className="text-lg font-bold text-text mb-4">
          Other categories
        </h2>
        <div className="flex flex-wrap gap-2">
          {others.map((c) => {
            const OtherIcon = ICONS[c.slug] ?? Search;
            return (
              <Link
                key={c.slug}
                to={`/categories/${c.slug}`}
                className="group inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text hover:border-accent/30 transition-colors"
              >
                <OtherIcon
                  size={13}
                  className="text-text-subtle group-hover:text-accent transition-colors"
                />
                {c.name}
                <span className="tabular-nums text-text-subtle">{c.count}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
