import { Link, useNavigate } from "react-router";
import { ArrowRight, Sparkles, Search, GitCompare, MessageSquare, Code2, Video, PenLine, BrainCircuit, Image, Mic, Workflow, BarChart3 } from "lucide-react";
import { useState } from "react";

export function meta() {
  return [
    { title: "AI Wiki — Community-curated AI tool directory" },
    {
      name: "description",
      content:
        "Discover, compare, and learn about the best AI tools. Browse 100+ tools by category, compare side-by-side, and ask AI Wiki for recommendations.",
    },
  ];
}

const stats = [
  { value: "62+", label: "Tools indexed" },
  { value: "8", label: "Categories" },
  { value: "Free", label: "Always" },
];

const categories = [
  { slug: "coding", label: "Code Assistants", icon: Code2, color: "text-indigo-500" },
  { slug: "writing", label: "Writing", icon: PenLine, color: "text-violet-500" },
  { slug: "image-generation", label: "Image Generation", icon: Image, color: "text-pink-500" },
  { slug: "video", label: "Video Generation", icon: Video, color: "text-rose-500" },
  { slug: "chatbots", label: "Chatbots & LLMs", icon: BrainCircuit, color: "text-blue-500" },
  { slug: "voice", label: "Voice & Audio", icon: Mic, color: "text-emerald-500" },
  { slug: "automation", label: "Automation", icon: Workflow, color: "text-amber-500" },
  { slug: "analytics", label: "Analytics", icon: BarChart3, color: "text-cyan-500" },
];

const features = [
  {
    icon: Search,
    title: "Discover",
    body: "Browse 100+ AI tools by category, pricing, and audience fit.",
  },
  {
    icon: GitCompare,
    title: "Compare",
    body: "Side-by-side structured comparison with AI-generated TL;DRs.",
  },
  {
    icon: MessageSquare,
    title: "Ask AI Wiki",
    body: "Chat with a RAG assistant that searches across the whole catalog.",
  },
  {
    icon: Sparkles,
    title: "Contribute",
    body: "Submit tools you love. Community-driven, admin-curated.",
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative container pt-12 pb-8 sm:pt-16 sm:pb-10 text-center max-w-3xl mx-auto overflow-hidden">
        {/* Background glow */}
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden="true"
        >
          <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-[0.07] bg-[radial-gradient(ellipse_at_center,var(--accent)_0%,var(--accent-2)_50%,transparent_80%)]" />
        </div>

        {/* Pill badge */}
        <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-accent/8 border border-accent/20 text-accent mb-6">
          <Sparkles size={11} />
          Community-curated AI tool directory
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 leading-[1.1]">
          Find the right AI tool
          <br />
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)" }}
          >
            for the job
          </span>
        </h1>

        <p className="text-base text-text-muted mb-6 leading-relaxed max-w-xl mx-auto">
          Browse and compare AI tools with structured data, real screenshots, and community
          ratings. Or just ask — our AI assistant knows the catalog.
        </p>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="relative max-w-lg mx-auto mb-6">
          <Search
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools, categories, use cases…"
            className="w-full pl-10 pr-28 py-3 rounded-xl border border-border bg-surface text-text placeholder:text-text-subtle text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/60 transition-all shadow-[var(--shadow-card)]"
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
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 transition-opacity text-sm"
          >
            Browse all tools <ArrowRight size={15} />
          </Link>
          <Link
            to="/chat"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-text-muted hover:text-text hover:border-text-subtle transition-colors font-medium text-sm"
          >
            Ask AI Wiki <MessageSquare size={15} />
          </Link>
        </div>

        {/* Stat strip */}
        <div className="flex items-center justify-center gap-8 mt-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-xl font-bold text-text">{s.value}</div>
              <div className="text-xs text-text-subtle mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Category tiles */}
      <section className="container mx-auto pb-12">
        <h2 className="text-xs font-semibold text-text-subtle uppercase tracking-widest mb-4 text-center">
          Browse by category
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {categories.map(({ slug, label, icon: Icon, color }) => (
            <Link
              key={slug}
              to={`/tools?category=${slug}`}
              className="group flex items-center gap-3 p-4 rounded-xl border border-border bg-surface hover:bg-surface-2 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] transition-all duration-200"
            >
              <div className="w-8 h-8 rounded-lg bg-surface-2 group-hover:bg-bg flex items-center justify-center flex-shrink-0 transition-colors">
                <Icon size={16} className={color} />
              </div>
              <span className="text-sm font-medium text-text-muted group-hover:text-text transition-colors leading-tight">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Feature grid */}
      <section className="container mx-auto pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map(({ icon: Icon, title, body }) => (
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
    </div>
  );
}
