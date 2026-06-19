import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLoaderData } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowRight, Search, GitCompare, MessageSquare,
  Code2, Video, PenLine, BrainCircuit, Image, Mic,
  Workflow, BarChart3, Presentation, Database, ShoppingBag,
  Headphones, BookOpen, Sparkles, Send,
} from "lucide-react";
import type { Route } from "./+types/_index";
import { supabase } from "@/lib/supabase.client";
import { createBuildClient } from "@/lib/supabase.server";
import { ToolCard } from "@/components/tool/ToolCard";
import { baseMeta, jsonLd, websiteLd, organizationLd } from "@/lib/seo";

export function meta(_: Route.MetaArgs) {
  return [
    ...baseMeta({
      title: "AI Wiki — Community-curated AI tool directory",
      description:
        "Discover, compare, and learn about the best AI tools. Browse 190+ tools by category, compare side-by-side, and ask AI Wiki for recommendations.",
      path: "/",
    }),
    jsonLd(websiteLd()),
    jsonLd(organizationLd()),
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

interface SpotlightTool {
  slug: string;
  name: string;
  logo_url: string | null;
}

interface MarqueeLogo {
  slug: string;
  name: string;
  logo_url: string;
}

// ── Data ──────────────────────────────────────────────────────────────────────
async function fetchFeaturedTools(client: SupabaseClient): Promise<FeaturedTool[]> {
  const { data, error } = await client.rpc("search_tools", {
    page_size: 9,
    page_offset: 0,
  });
  if (error) throw new Error(error.message);
  return (data as FeaturedTool[]) ?? [];
}

async function fetchSiteStats(client: SupabaseClient): Promise<SiteStats> {
  const [{ count: tool_count }, { count: category_count }] = await Promise.all([
    client.from("tools").select("*", { count: "exact", head: true }).eq("status", "published"),
    client.from("categories").select("*", { count: "exact", head: true }),
  ]);
  return { tool_count: tool_count ?? 0, category_count: category_count ?? 0 };
}

interface HomeData {
  featuredTools: FeaturedTool[];
  stats: SiteStats;
}

async function fetchHomeData(client: SupabaseClient): Promise<HomeData> {
  const [featuredTools, stats] = await Promise.all([
    fetchFeaturedTools(client),
    fetchSiteStats(client),
  ]);
  return { featuredTools, stats };
}

// Prerendered at build time so the featured-tools grid and stats ship in the
// static HTML for crawlers.
export async function loader(_: Route.LoaderArgs) {
  return fetchHomeData(createBuildClient());
}

export async function clientLoader(_: Route.ClientLoaderArgs) {
  return fetchHomeData(supabase);
}

async function fetchMarqueeLogos(): Promise<MarqueeLogo[]> {
  const { data } = await supabase
    .from("tools")
    .select("slug, name, logo_url")
    .eq("status", "published")
    .not("logo_url", "is", null)
    .limit(30);
  return ((data ?? []) as MarqueeLogo[]).filter((t) => !!t.logo_url);
}

async function fetchSpotlightTools(): Promise<Map<string, SpotlightTool>> {
  const slugs = MATCHUPS.flatMap((m) => [m.a, m.b]);
  const { data } = await supabase
    .from("tools")
    .select("slug, name, logo_url")
    .in("slug", slugs)
    .eq("status", "published");
  const map = new Map<string, SpotlightTool>();
  for (const t of (data as SpotlightTool[]) ?? []) map.set(t.slug, t);
  return map;
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

// Curated head-to-head matchups. Slugs are confirmed published tools; `label`
// is the static fallback shown until live names/logos load (and if the fetch fails).
const MATCHUPS = [
  { a: "chatgpt",    b: "claude",         labelA: "ChatGPT",    labelB: "Claude",        category: "Chat assistants" },
  { a: "cursor",     b: "github-copilot", labelA: "Cursor",     labelB: "GitHub Copilot", category: "Coding & dev" },
  { a: "midjourney", b: "runway",         labelA: "Midjourney", labelB: "Runway",        category: "Image & video" },
];

// Quick-search chips shown under the hero search box.
const SEARCH_SUGGESTIONS = [
  "Image generation",
  "Coding copilots",
  "Free tier",
  "Video editing",
  "Open source",
];

const CHAT_PROMPTS = [
  "What's the best AI coding assistant?",
  "Compare free AI image generators",
  "Best AI tools for writing and editing",
  "Which AI tools have a generous free tier?",
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
// Eased count-up from 0 → target. Re-runs when target changes (e.g. when async
// stats arrive). Respects prefers-reduced-motion by snapping to the value.
function useCountUp(target: number, duration = 1300) {
  const [val, setVal] = useState(0);
  const rafRef = useRef(0);
  useEffect(() => {
    if (target <= 0) { setVal(0); return; }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setVal(target); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - p) ** 3;
      setVal(Math.round(target * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);
  return val;
}

function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const n = useCountUp(value);
  return <>{n.toLocaleString()}{suffix}</>;
}

function StatStrip({ stats }: { stats: SiteStats | undefined }) {
  const items: { node: React.ReactNode; label: string }[] = [
    { node: stats ? <CountUp value={stats.tool_count} suffix="+" /> : "190+", label: "Tools indexed" },
    { node: stats ? <CountUp value={stats.category_count} /> : "14", label: "Categories" },
    { node: "Free", label: "Always free" },
    { node: "Community", label: "Driven" },
  ];
  return (
    <div className="flex items-center justify-center gap-5 sm:gap-9 mt-9 flex-wrap">
      {items.map((s, i) => (
        <Fragment key={s.label}>
          {i > 0 && (
            <span
              aria-hidden="true"
              className="hidden sm:block h-9 w-px bg-gradient-to-b from-transparent via-border to-transparent"
            />
          )}
          <div className="text-center">
            <div
              className="text-2xl sm:text-[1.7rem] font-bold bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, var(--text) 30%, var(--accent) 130%)" }}
            >
              {s.node}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-text-subtle mt-1">{s.label}</div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function MarqueeRow({ items, reverse = false, duration }: { items: MarqueeLogo[]; reverse?: boolean; duration: number }) {
  const row = [...items, ...items]; // duplicate for a seamless -50% loop
  return (
    <div className="marquee-mask overflow-hidden">
      <div
        className={`flex w-max gap-3 hover:[animation-play-state:paused] ${reverse ? "animate-marquee-reverse" : "animate-marquee"}`}
        style={{ animationDuration: `${duration}s` }}
      >
        {row.map((t, i) => (
          <Link
            key={`${t.slug}-${i}`}
            to={`/tools/${t.slug}`}
            title={t.name}
            className="group flex items-center gap-2.5 px-4 py-2 flex-shrink-0 opacity-80 hover:opacity-100 transition-opacity"
          >
            <img
              src={t.logo_url}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-8 h-8 object-contain rounded-md transition-transform duration-200 group-hover:scale-110"
            />
            <span className="text-sm font-medium text-text-muted group-hover:text-text whitespace-nowrap transition-colors">
              {t.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function LogoMarquee() {
  const { data: logos = [] } = useQuery({
    queryKey: ["marquee-logos"],
    queryFn: fetchMarqueeLogos,
    staleTime: 10 * 60 * 1000,
  });
  if (logos.length < 8) return null;
  const mid = Math.ceil(logos.length / 2);
  const topRow = logos.slice(0, mid);
  const bottomRow = logos.slice(mid);
  return (
    <div className="mt-12 space-y-3">
      <p className="text-center text-[11px] uppercase tracking-[0.12em] text-text-subtle mb-5">
        Indexing the tools practitioners actually use
      </p>
      <MarqueeRow items={topRow} duration={48} />
      {bottomRow.length >= 4 && <MarqueeRow items={bottomRow} reverse duration={58} />}
    </div>
  );
}


function MatchupSide({ tool, label }: { tool: SpotlightTool | undefined; label: string }) {
  const name = tool?.name ?? label;
  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
        {tool?.logo_url ? (
          <img src={tool.logo_url} alt={name} className="w-full h-full object-contain p-1.5" />
        ) : (
          <span className="text-base font-bold text-text-muted">{name.charAt(0)}</span>
        )}
      </div>
      <span className="text-sm font-semibold text-text text-center leading-tight truncate max-w-full">{name}</span>
    </div>
  );
}

function CompareSpotlight() {
  const { data: toolMap } = useQuery({
    queryKey: ["spotlight-tools"],
    queryFn: fetchSpotlightTools,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <section className="container pb-14">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-text">Compare head-to-head</h2>
          <p className="text-sm text-text-muted mt-0.5">Settle the debate with structured, side-by-side data</p>
        </div>
        <Link to="/compare" className="text-sm text-accent hover:underline flex items-center gap-1">
          Compare any tools <ArrowRight size={13} />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {MATCHUPS.map((m) => (
          <Link
            key={`${m.a}-${m.b}`}
            to={`/compare?tools=${m.a},${m.b}`}
            className="group relative flex flex-col items-center gap-4 p-5 rounded-xl border border-border bg-surface hover:bg-surface-2 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] hover:border-accent/20 transition-all duration-200"
          >
            <span className="text-[11px] font-medium uppercase tracking-wide text-text-subtle">{m.category}</span>
            <div className="flex items-center gap-3 w-full">
              <MatchupSide tool={toolMap?.get(m.a)} label={m.labelA} />
              <div
                className="flex items-center justify-center w-9 h-9 rounded-full bg-accent/8 border border-accent/20 text-[11px] font-bold text-accent flex-shrink-0 transition-shadow group-hover:shadow-[0_0_16px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
                aria-hidden="true"
              >
                VS
              </div>
              <MatchupSide tool={toolMap?.get(m.b)} label={m.labelB} />
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-text-muted group-hover:text-accent transition-colors">
              <GitCompare size={13} /> View comparison
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ChatTeaser() {
  const navigate = useNavigate();

  function handleAsk(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value.trim();
    navigate(q ? `/chat?q=${encodeURIComponent(q)}` : "/chat");
  }

  return (
    <section className="container pb-14">
      <div
        className="rounded-2xl border border-border p-6 sm:p-9 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, var(--surface)), color-mix(in srgb, var(--accent-2) 6%, var(--surface)))" }}
      >
        <div className="pointer-events-none absolute inset-0 -z-0" aria-hidden="true">
          <div className="absolute right-[-10%] top-[-30%] w-[420px] h-[260px] rounded-full opacity-[0.1] bg-[radial-gradient(ellipse_at_center,var(--accent)_0%,transparent_70%)]" />
        </div>
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 p-2 mb-4">
            <img src="/logo.png" alt="AI Wiki" className="w-full h-full object-contain" />
          </div>
          <h2 className="text-2xl font-bold text-text mb-2">Not sure where to start? Ask AI Wiki</h2>
          <p className="text-sm text-text-muted mb-6 leading-relaxed max-w-lg mx-auto">
            Describe your use case in plain English and our RAG-powered assistant recommends tools
            from the directory — with citations you can dig into.
          </p>

          <form onSubmit={handleAsk} className="relative max-w-lg mx-auto mb-5">
            <MessageSquare size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none" />
            <input
              name="q"
              type="text"
              placeholder="e.g. Best AI tool for editing podcasts on a budget…"
              className="w-full pl-10 pr-14 py-3.5 rounded-xl border border-border bg-surface text-text placeholder:text-text-subtle text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/60 transition-all shadow-[var(--shadow-card)]"
            />
            <button
              type="submit"
              aria-label="Ask AI Wiki"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-accent text-accent-fg hover:opacity-90 transition-opacity"
            >
              <Send size={15} />
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {CHAT_PROMPTS.map((prompt) => (
              <Link
                key={prompt}
                to={`/chat?q=${encodeURIComponent(prompt)}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-surface text-xs font-medium text-text-muted hover:text-text hover:border-accent/30 hover:bg-surface-2 transition-colors"
              >
                <Sparkles size={12} className="text-accent" /> {prompt}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate();
  const { featuredTools, stats } = useLoaderData<typeof loader>();

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="flex flex-col">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative isolate pt-14 pb-10 sm:pt-20 sm:pb-14 overflow-hidden">
        {/* Background: layered galaxy (parallax stars + nebula + shooting stars) + grid mesh */}
        <div className="hero-bg pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
          {/* Nebula color clouds — soft, off-center, blue/cyan, blended */}
          <div
            className="galaxy-nebula absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 50% 44% at 20% 16%, var(--accent), transparent 70%)," +
                "radial-gradient(ellipse 44% 40% at 82% 12%, var(--accent-2), transparent 70%)," +
                "radial-gradient(ellipse 56% 52% at 62% 66%, color-mix(in srgb, var(--accent) 65%, var(--accent-2)), transparent 72%)," +
                "radial-gradient(ellipse 40% 36% at 44% 42%, var(--accent-2), transparent 75%)",
              maskImage: "radial-gradient(ellipse 95% 85% at 50% 5%, #000 30%, transparent 88%)",
              WebkitMaskImage: "radial-gradient(ellipse 95% 85% at 50% 5%, #000 30%, transparent 88%)",
            }}
          />
          {/* Star field — far layer (dense, dim, slow) */}
          <div
            className="galaxy-stars-far absolute inset-0 opacity-[0.5]"
            style={{
              backgroundImage:
                "radial-gradient(1px 1px at 20px 30px, var(--accent-2), transparent)," +
                "radial-gradient(1px 1px at 80px 140px, var(--accent-2), transparent)," +
                "radial-gradient(1px 1px at 150px 60px, var(--accent-2), transparent)," +
                "radial-gradient(1px 1px at 210px 200px, var(--accent-2), transparent)," +
                "radial-gradient(1px 1px at 60px 250px, var(--accent-2), transparent)," +
                "radial-gradient(1px 1px at 280px 90px, var(--accent-2), transparent)," +
                "radial-gradient(1px 1px at 120px 300px, var(--accent-2), transparent)," +
                "radial-gradient(1px 1px at 300px 180px, var(--accent-2), transparent)," +
                "radial-gradient(1px 1px at 40px 110px, var(--accent-2), transparent)," +
                "radial-gradient(1px 1px at 190px 40px, var(--accent-2), transparent)," +
                "radial-gradient(1px 1px at 250px 270px, var(--accent-2), transparent)," +
                "radial-gradient(1px 1px at 100px 190px, var(--accent-2), transparent)",
              backgroundSize: "320px 320px",
              backgroundRepeat: "repeat",
              maskImage: "radial-gradient(ellipse 85% 80% at 50% 0%, #000 15%, transparent 82%)",
              WebkitMaskImage: "radial-gradient(ellipse 85% 80% at 50% 0%, #000 15%, transparent 82%)",
            }}
          />
          {/* Star field — mid layer (medium, medium speed) */}
          <div
            className="galaxy-stars-mid absolute inset-0 opacity-[0.65]"
            style={{
              backgroundImage:
                "radial-gradient(1.5px 1.5px at 30px 50px, var(--accent-2), transparent)," +
                "radial-gradient(1.5px 1.5px at 160px 90px, var(--accent-2), transparent)," +
                "radial-gradient(1.5px 1.5px at 90px 210px, var(--accent-2), transparent)," +
                "radial-gradient(1.5px 1.5px at 260px 150px, var(--accent-2), transparent)," +
                "radial-gradient(1.5px 1.5px at 340px 260px, var(--accent-2), transparent)," +
                "radial-gradient(1.5px 1.5px at 200px 330px, var(--accent-2), transparent)," +
                "radial-gradient(1.5px 1.5px at 60px 310px, var(--accent-2), transparent)," +
                "radial-gradient(1.5px 1.5px at 300px 50px, var(--accent-2), transparent)," +
                "radial-gradient(1.5px 1.5px at 140px 260px, var(--accent-2), transparent)",
              backgroundSize: "380px 380px",
              backgroundRepeat: "repeat",
              maskImage: "radial-gradient(ellipse 82% 78% at 50% 0%, #000 12%, transparent 80%)",
              WebkitMaskImage: "radial-gradient(ellipse 82% 78% at 50% 0%, #000 12%, transparent 80%)",
            }}
          />
          {/* Star field — near layer (large, bright, fast, twinkles) */}
          <div
            className="galaxy-stars-near absolute inset-0 opacity-[0.55]"
            style={{
              backgroundImage:
                "radial-gradient(2px 2px at 50px 70px, color-mix(in srgb, var(--accent-2) 65%, #fff), transparent)," +
                "radial-gradient(2px 2px at 230px 130px, color-mix(in srgb, var(--accent-2) 65%, #fff), transparent)," +
                "radial-gradient(2px 2px at 390px 90px, color-mix(in srgb, var(--accent-2) 65%, #fff), transparent)," +
                "radial-gradient(2px 2px at 170px 310px, color-mix(in srgb, var(--accent-2) 65%, #fff), transparent)," +
                "radial-gradient(2px 2px at 340px 370px, color-mix(in srgb, var(--accent-2) 65%, #fff), transparent)," +
                "radial-gradient(2px 2px at 90px 410px, color-mix(in srgb, var(--accent-2) 65%, #fff), transparent)",
              backgroundSize: "460px 460px",
              backgroundRepeat: "repeat",
              maskImage: "radial-gradient(ellipse 80% 75% at 50% 0%, #000 10%, transparent 78%)",
              WebkitMaskImage: "radial-gradient(ellipse 80% 75% at 50% 0%, #000 10%, transparent 78%)",
            }}
          />
          {/* Shooting stars — occasional streaks */}
          <div
            className="galaxy-shoot absolute h-[2px] w-[150px] rounded-full"
            style={{
              top: "12%",
              left: "6%",
              background: "linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent-2) 80%, #fff))",
              "--shoot-dx": "560px",
              "--shoot-dy": "204px",
              animationDuration: "11s",
              animationDelay: "2s",
            } as React.CSSProperties}
          />
          <div
            className="galaxy-shoot absolute h-[1.5px] w-[110px] rounded-full"
            style={{
              top: "30%",
              left: "44%",
              background: "linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent-2) 80%, #fff))",
              "--shoot-dx": "440px",
              "--shoot-dy": "160px",
              animationDuration: "9s",
              animationDelay: "6.5s",
            } as React.CSSProperties}
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
          <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-accent/8 border border-accent/20 text-accent">
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            Community-curated AI tool directory
          </div>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-5 leading-[1.1]">
          The AI tool directory
          <br />
          <span className="hero-gradient-text">built by the community</span>
        </h1>

        <p className="text-base sm:text-lg text-text-muted mb-8 leading-relaxed max-w-xl mx-auto">
          Real practitioners curating real tools. Browse 190+ AI tools with structured data,
          honest comparisons, and community ratings — or just ask our AI assistant.
        </p>

        {/* Search */}
        <div className="relative max-w-lg mx-auto mb-4">
          {/* Soft accent glow behind the field */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-6 -inset-y-3 -z-10 opacity-60 blur-2xl"
            style={{ background: "radial-gradient(ellipse at center, color-mix(in srgb, var(--accent) 28%, transparent), transparent 70%)" }}
          />
          <form onSubmit={handleSearch} className="relative group">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-subtle group-focus-within:text-accent transition-colors pointer-events-none" />
            <input
              name="q"
              type="text"
              placeholder="Search tools, categories, use cases…"
              className="w-full pl-11 pr-28 py-4 rounded-2xl border border-border bg-surface text-text placeholder:text-text-subtle text-sm focus:outline-none focus:ring-2 focus:ring-accent/35 focus:border-accent/60 transition-all shadow-[var(--shadow-card)]"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-xl bg-accent text-accent-fg text-xs font-semibold hover:opacity-90 transition-opacity shadow-[0_0_18px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
            >
              Search
            </button>
          </form>
        </div>

        {/* Quick-search chips */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-7">
          <span className="text-xs text-text-subtle">Popular:</span>
          {SEARCH_SUGGESTIONS.map((term) => (
            <Link
              key={term}
              to={`/search?q=${encodeURIComponent(term)}`}
              className="px-2.5 py-1 rounded-full border border-border bg-surface/70 text-xs font-medium text-text-muted hover:text-text hover:border-accent/30 hover:bg-surface transition-colors"
            >
              {term}
            </Link>
          ))}
        </div>

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

        {/* Logo marquee — real indexed tools, seamless infinite scroll */}
        <div className="container max-w-5xl mx-auto">
          <LogoMarquee />
        </div>
      </section>

      {/* ── Ask AI Wiki teaser ────────────────────────────────────────────── */}
      <ChatTeaser />

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
          {featuredTools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      </section>

      {/* ── Compare spotlight ─────────────────────────────────────────────── */}
      <CompareSpotlight />

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
