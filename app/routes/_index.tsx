import { Link } from "react-router";
import { ArrowRight, Sparkles, Search, GitCompare, MessageSquare } from "lucide-react";

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
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="container py-24 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full bg-surface border border-border text-text-muted mb-6">
          <Sparkles size={12} className="text-accent" />
          Community-curated AI tool directory
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6 leading-tight">
          Find the right AI tool{" "}
          <span className="text-accent">for the job</span>
        </h1>
        <p className="text-lg text-text-muted mb-8 leading-relaxed">
          Browse and compare hundreds of AI tools with structured data, real screenshots, and
          community ratings. Ask our AI assistant for a recommendation, or submit a tool you love.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/tools"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 transition-opacity"
          >
            Browse tools <ArrowRight size={16} />
          </Link>
          <Link
            to="/chat"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-text-muted hover:text-text hover:border-text-muted transition-colors font-medium"
          >
            Ask AI Wiki <MessageSquare size={16} />
          </Link>
        </div>
      </section>

      {/* Feature grid */}
      <section className="container pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="p-5 rounded-xl border border-border bg-surface hover:bg-surface-2 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
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
