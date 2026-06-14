import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, Search, GitCompare, MessageSquare,
  Code2, Video, PenLine, BrainCircuit, Image, Mic,
  Workflow, BarChart3, Presentation, Database, ShoppingBag,
  Headphones, BookOpen, Sparkles,
} from "lucide-react";
import { supabase } from "@/lib/supabase.client";
import { ToolCard } from "@/components/tool/ToolCard";
import { Skeleton } from "@/components/ui/skeleton";

export function meta() {
  return [
    { title: "AI Wiki — Community-curated AI tool directory" },
    {
      name: "description",
      content:
        "Discover, compare, and learn about the best AI tools. Browse 190+ tools by category, compare side-by-side, and ask AI Wiki for recommendations.",
    },
  ];
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface FeaturedTool {
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
  is_featured?: boolean;
}

interface SiteStats {
  tool_count: number;
  category_count: number;
}

// ── Data ──────────────────────────────────────────────────────────────────────
async function fetchFeaturedTools(): Promise<FeaturedTool[]> {
  const { data, error } = await supabase.rpc("search_tools", {
    page_size: 9,
    page_offset: 0,
  });
  if (error) throw new Error(error.message);
  return (data as FeaturedTool[]) ?? [];
}

async function fetchSiteStats(): Promise<SiteStats> {
  const [{ count: tool_count }, { count: category_count }] = await Promise.all([
    supabase.from("tools").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("categories").select("*", { count: "exact", head: true }),
  ]);
  return { tool_count: tool_count ?? 0, category_count: category_count ?? 0 };
}

// ── Static data ───────────────────────────────────────────────────────────────
const categories = [
  { slug: "chat-assistants",   label: "Chat Assistants",      icon: BrainCircuit,  color: "text-blue-500" },
  { slug: "coding",            label: "Coding & Dev",         icon: Code2,         color: "text-blue-500" },
  { slug: "image-generation",  label: "Image Generation",     icon: Image,         color: "text-pink-500" },
  { slug: "video",             label: "Video Generation",     icon: Video,         color: "text-rose-500" },
  { slug: "audio-music",       label: "Audio & Music",        icon: Headphones,    color: "text-emerald-500" },
  { slug: "writing",           label: "Writing & Editing",    icon: PenLine,       color: "text-sky-500" },
  { slug: "search-research",   label: "Search & Research",    icon: BookOpen,      color: "text-sky-500" },
  { slug: "presentations-docs",label: "Presentations & Docs", icon: Presentation,  color: "text-orange-500" },
  { slug: "design",            label: "Design",               icon: Sparkles,      color: "text-fuchsia-500" },
  { slug: "data-analytics",    label: "Data & Analytics",     icon: BarChart3,     color: "text-cyan-500" },
  { slug: "automation",        label: "Automation & Agents",  icon: Workflow,      color: "text-amber-500" },
  { slug: "infrastructure",    label: "AI Infrastructure",    icon: Database,      color: "text-slate-400" },
  { slug: "voice",             label: "Voice & Speech",       icon: Mic,           color: "text-teal-500" },
  { slug: "marketing-sales",   label: "Marketing & Sales",    icon: ShoppingBag,   color: "text-lime-500" },
];

const howItWorks = [
  {
    icon: Search,
    title: "Browse",
    body: "Explore 190+ tools by category, pricing, and audience. Filter to exactly what fits your workflow.",
  },
  {
    icon: GitCompare,
    title: "Compare",
    body: "Side-by-side comparison with structured data. See the real differences, not just marketing copy.",
  },
  {
    icon: MessageSquare,
    title: "Ask AI Wiki",
    body: "Describe your use case and get personalized recommendations from our RAG-powered assistant.",
  },
  {
    icon: GitCompare,
    title: "Contribute",
    body: "Submit a tool you love. Community-driven, curated by practitioners who actually use these tools.",
  },
];

// ── Components ────────────────────────────────────────────────────────────────
function StatStrip({ stats }: { stats: SiteStats | undefined }) {
  const items = [
    { value: stats ? `${stats.tool_count}+` : "190+", label: "Tools indexed" },
    { value: stats ? `${stats.category_count}` : "14", label: "Categories" },
    { value: "Free", label: "Always free" },
    { value: "Community", label: "Driven" },
  ];
  return (
    <div className="flex items-center justify-center gap-8 sm:gap-12 mt-8 flex-wrap">
      {items.map((s) => (
        <div key={s.label} className="text-center">
          <div className="text-2xl font-bold text-text">{s.value}</div>
          <div className="text-xs text-text-subtle mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function ToolCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Skeleton className="w-11 h-11 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-10 rounded-full" />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["site-stats"],
    queryFn: fetchSiteStats,
    staleTime: 5 * 60 * 1000,
  });

  const { data: featuredTools = [], isLoading: toolsLoading } = useQuery({
    queryKey: ["featured-tools-home"],
    queryFn: fetchFeaturedTools,
    staleTime: 2 * 60 * 1000,
  });

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="flex flex-col">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative isolate pt-14 pb-10 sm:pt-20 sm:pb-14 overflow-hidden">
        {/* Background: galaxy glow + grid mesh */}
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
          {/* Nebula color clouds — soft, off-center, brand-tinted */}
          <div
            className="galaxy-nebula absolute inset-0 opacity-[0.13]"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 50% 45% at 22% 18%, var(--accent), transparent 70%)," +
                "radial-gradient(ellipse 45% 40% at 80% 12%, var(--accent-2), transparent 70%)," +
                "radial-gradient(ellipse 55% 55% at 60% 70%, color-mix(in srgb, var(--accent) 60%, #7c3aed), transparent 72%)",
              maskImage: "radial-gradient(ellipse 90% 80% at 50% 5%, #000 30%, transparent 85%)",
              WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 50% 5%, #000 30%, transparent 85%)",
            }}
          />
          {/* Star field — scattered faint dots, fading toward the edges */}
          <div
            className="galaxy-stars absolute inset-0 opacity-[0.45]"
            style={{
              backgroundImage:
                "radial-gradient(1px 1px at 25px 35px, #fff, transparent)," +
                "radial-gradient(1px 1px at 140px 60px, #fff, transparent)," +
                "radial-gradient(1.5px 1.5px at 75px 120px, #fff, transparent)," +
                "radial-gradient(1px 1px at 200px 90px, #fff, transparent)," +
                "radial-gradient(1px 1px at 50px 180px, #fff, transparent)," +
                "radial-gradient(1.5px 1.5px at 250px 160px, #fff, transparent)," +
                "radial-gradient(1px 1px at 310px 40px, #fff, transparent)",
              backgroundSize: "340px 340px",
              backgroundRepeat: "repeat",
              maskImage: "radial-gradient(ellipse 80% 75% at 50% 0%, #000 20%, transparent 80%)",
              WebkitMaskImage: "radial-gradient(ellipse 80% 75% at 50% 0%, #000 20%, transparent 80%)",
            }}
          />
          {/* Grid mesh — fades out toward the edges */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(to right, color-mix(in srgb, var(--border) 55%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--border) 55%, transparent) 1px, transparent 1px)",
              backgroundSize: "54px 54px",
              maskImage: "radial-gradient(ellipse 75% 70% at 50% 0%, #000 35%, transparent 78%)",
              WebkitMaskImage: "radial-gradient(ellipse 75% 70% at 50% 0%, #000 35%, transparent 78%)",
            }}
          />
        </div>

        <div className="container max-w-3xl mx-auto text-center">
        {/* Logo + badge */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <img src="/logo.png" alt="AI Wiki" className="w-10 h-10 object-contain" />
          <div className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-accent/8 border border-accent/20 text-accent">
            Community-curated AI tool directory
          </div>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-5 leading-[1.1]">
          The AI tool directory
          <br />
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)" }}
          >
            built by the community
          </span>
        </h1>

        <p className="text-base sm:text-lg text-text-muted mb-8 leading-relaxed max-w-xl mx-auto">
          Real practitioners curating real tools. Browse 190+ AI tools with structured data,
          honest comparisons, and community ratings — or just ask our AI assistant.
        </p>

        {/* Search */}
        <form onSubmit={handleSearch} className="relative max-w-lg mx-auto mb-6">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none" />
          <input
            name="q"
            type="text"
            placeholder="Search tools, categories, use cases…"
            className="w-full pl-10 pr-28 py-3.5 rounded-xl border border-border bg-surface text-text placeholder:text-text-subtle text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/60 transition-all shadow-[var(--shadow-card)]"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium hover:opacity-90 transition-opacity"
          >
            Search
          </button>
        </form>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/tools"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-fg font-semibold hover:opacity-90 transition-opacity text-sm shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_30%,transparent)]"
          >
            Browse all tools <ArrowRight size={15} />
          </Link>
          <Link
            to="/chat"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border text-text-muted hover:text-text hover:border-text-subtle transition-colors font-medium text-sm"
          >
            Ask AI Wiki <MessageSquare size={15} />
          </Link>
        </div>

        {/* Stats strip */}
        <StatStrip stats={stats} />
        </div>
      </section>

      {/* ── Featured tools ────────────────────────────────────────────────── */}
      <section className="container pb-14">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-text">Top AI Tools</h2>
            <p className="text-sm text-text-muted mt-0.5">Trending tools from the community</p>
          </div>
          <Link
            to="/tools"
            className="text-sm text-accent hover:underline flex items-center gap-1"
          >
            View all <ArrowRight size={13} />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {toolsLoading
            ? Array.from({ length: 9 }, (_, i) => `s${i}`).map((k) => <ToolCardSkeleton key={k} />)
            : featuredTools.map((tool) => <ToolCard key={tool.id} tool={tool} />)
          }
        </div>
      </section>

      {/* ── Category grid ─────────────────────────────────────────────────── */}
      <section className="container pb-14">
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-text">Browse by Category</h2>
          <p className="text-sm text-text-muted mt-1">14 categories, every AI use case covered</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {categories.map(({ slug, label, icon: Icon, color }) => (
            <Link
              key={slug}
              to={`/tools?cat=${slug}`}
              className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-surface hover:bg-surface-2 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] hover:border-accent/20 transition-all duration-200 text-center"
            >
              <div className="w-9 h-9 rounded-lg bg-surface-2 group-hover:bg-bg flex items-center justify-center flex-shrink-0 transition-colors">
                <Icon size={18} className={color} />
              </div>
              <span className="text-xs font-medium text-text-muted group-hover:text-text transition-colors leading-tight">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="container pb-20">
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-text">How it works</h2>
          <p className="text-sm text-text-muted mt-1">Everything you need to find your next AI tool</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {howItWorks.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="p-5 rounded-xl border border-border bg-surface hover:bg-surface-2 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] transition-all duration-200"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center mb-4"
                style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, transparent), color-mix(in srgb, var(--accent-2) 8%, transparent))" }}
              >
                <Icon size={18} className="text-accent" />
              </div>
              <h3 className="font-semibold text-text mb-1">{title}</h3>
              <p className="text-sm text-text-muted leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA banner ────────────────────────────────────────────────────── */}
      <section className="container pb-20">
        <div
          className="rounded-2xl p-8 sm:p-12 text-center relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--surface)), color-mix(in srgb, var(--accent-2) 8%, var(--surface)))" }}
        >
          <div className="pointer-events-none absolute inset-0 -z-0" aria-hidden="true">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full opacity-[0.08] bg-[radial-gradient(ellipse_at_center,var(--accent)_0%,transparent_70%)]" />
          </div>
          <div className="relative z-10">
            <img src="/logo.png" alt="AI Wiki" className="w-12 h-12 object-contain mx-auto mb-4" />
            <h2 className="text-2xl sm:text-3xl font-bold text-text mb-3">
              Know a great AI tool?
            </h2>
            <p className="text-text-muted mb-6 max-w-md mx-auto text-sm leading-relaxed">
              Help the community discover it. Submit a tool and our team will review and publish it.
            </p>
            <Link
              to="/submit"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-fg font-semibold hover:opacity-90 transition-opacity text-sm"
            >
              Submit a tool <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
