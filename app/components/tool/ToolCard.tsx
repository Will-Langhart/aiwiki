import { Link } from "react-router";
import { Star, GitFork, Zap, GitCompare, Sparkles, Users, Github, Server, Code2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCompareStore } from "@/stores/compare";

interface ToolCardProps {
  tool: {
    id: string;
    slug: string;
    name: string;
    tagline: string;
    logo_url: string | null;
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
  };
  dense?: boolean;
  className?: string;
}

const PRICING_LABELS: Record<string, string> = {
  free: "Free",
  freemium: "Free tier",
  paid: "Paid",
  enterprise: "Enterprise",
};

const PRICING_STYLES: Record<string, string> = {
  free: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0",
  freemium: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 border-0",
  paid: "bg-surface-2 text-text-muted border-border",
  enterprise: "bg-surface-2 text-text-muted border-border",
};

const TRAFFIC_LABELS: Record<string, string> = {
  small: "Niche",
  medium: "Growing",
  large: "Popular",
  xlarge: "10M+ users",
};

const AUDIENCE_LABELS: Record<string, string> = {
  technical: "Dev",
  non_technical: "No-code",
  both: "Everyone",
};

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function ToolLogo({ name, logo_url, size = "md" }: { name: string; logo_url: string | null; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-8 h-8" : "w-11 h-11";
  const text = size === "sm" ? "text-xs" : "text-sm";
  return (
    <div className={`relative flex-shrink-0 ${dim}`}>
      {logo_url && (
        <img
          src={logo_url}
          alt={`${name} logo`}
          className={`${dim} rounded-lg object-contain bg-surface-2 p-0.5 shadow-[var(--shadow-card)]`}
          onError={(e) => {
            e.currentTarget.style.display = "none";
            const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
      )}
      <div
        className={`${dim} rounded-lg items-center justify-center text-white ${text} font-bold absolute inset-0`}
        style={{
          display: logo_url ? "none" : "flex",
          background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
        }}
      >
        {name[0]}
      </div>
    </div>
  );
}

export function ToolCard({ tool, dense = false, className }: ToolCardProps) {
  const hasFreeTier = tool.has_free_tier || tool.pricing_tier === "free" || tool.pricing_tier === "freemium";
  const { items, toggle } = useCompareStore();
  const inCompare = items.some((i) => i.id === tool.id);
  const compareDisabled = !inCompare && items.length >= 4;
  const shownIntegrations = (tool.integrations ?? []).slice(0, 4);

  return (
    <div className={cn("relative group", className)}>
      {/* Featured ribbon */}
      {tool.is_featured && (
        <div
          className="absolute -top-px -left-px z-10 flex items-center gap-1 px-2 py-0.5 rounded-tl-xl rounded-br-md text-[10px] font-semibold text-white pointer-events-none"
          style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
        >
          <Sparkles size={9} />
          Sponsored
        </div>
      )}
      {/* Compare toggle */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          if (compareDisabled) return;
          toggle({ id: tool.id, slug: tool.slug, name: tool.name, logo_url: tool.logo_url });
        }}
        disabled={compareDisabled}
        aria-label={inCompare ? `Remove ${tool.name} from comparison` : `Add ${tool.name} to comparison`}
        aria-pressed={inCompare}
        className={cn(
          "absolute top-2.5 right-2.5 z-10 flex items-center justify-center w-6 h-6 rounded-md transition-all duration-150",
          "opacity-0 group-hover:opacity-100 focus:opacity-100",
          inCompare
            ? "bg-accent text-accent-fg opacity-100"
            : "bg-surface-2 text-text-subtle hover:bg-accent/10 hover:text-accent",
          compareDisabled && "cursor-not-allowed opacity-30 group-hover:opacity-30"
        )}
      >
        <GitCompare size={12} />
      </button>

      <Link
        to={`/tools/${tool.slug}`}
        className={cn(
          "block rounded-xl border border-border bg-surface",
          "shadow-[var(--shadow-card)]",
          "hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)] hover:border-accent/40",
          "transition-all duration-200 p-3",
        )}
      >
        {/* Header row */}
        <div className="flex items-start gap-2 mb-2">
          <ToolLogo name={tool.name} logo_url={tool.logo_url} size="sm" />
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm font-semibold text-text group-hover:text-accent transition-colors leading-tight truncate">
                {tool.name}
              </h3>
              {hasFreeTier && (
                <Badge className="text-[10px] py-0 h-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 font-medium shrink-0">
                  Free
                </Badge>
              )}
            </div>
            {tool.category_name && (
              <p className="text-[11px] text-text-subtle mt-0.5 truncate">{tool.category_name}</p>
            )}
          </div>
        </div>

        {/* Tagline */}
        <p className="text-xs text-text-muted leading-snug line-clamp-2 mb-2.5">
          {tool.tagline}
        </p>

        {/* Pricing detail */}
        {tool.pricing_detail && (
          <p className="text-[11px] text-text-subtle leading-tight mb-2 line-clamp-1">
            {tool.pricing_detail}
          </p>
        )}

        {/* Integrations */}
        {shownIntegrations.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2.5">
            {shownIntegrations.map((name) => (
              <span
                key={name}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-surface-2 text-text-subtle border border-border/60"
              >
                {name}
              </span>
            ))}
          </div>
        )}

        {/* Footer row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn(
            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border",
            PRICING_STYLES[tool.pricing_tier] ?? "bg-surface-2 text-text-muted border-border"
          )}>
            {PRICING_LABELS[tool.pricing_tier] ?? tool.pricing_tier}
          </span>

          {tool.audience_fit && AUDIENCE_LABELS[tool.audience_fit] && (
            <span className="flex items-center gap-0.5 text-[10px] text-text-subtle">
              <Code2 size={9} className="text-accent/70" />
              {AUDIENCE_LABELS[tool.audience_fit]}
            </span>
          )}

          {tool.api_available && (
            <span className="flex items-center gap-0.5 text-[10px] text-text-subtle">
              <Zap size={9} className="text-accent" />
              API
            </span>
          )}

          {tool.open_source && (
            <span className="flex items-center gap-0.5 text-[10px] text-text-subtle">
              <GitFork size={9} />
              OSS
            </span>
          )}

          {tool.self_hostable && (
            <span className="flex items-center gap-0.5 text-[10px] text-text-subtle">
              <Server size={9} />
              Self-host
            </span>
          )}

          {tool.model_provider && (
            <span className="text-[10px] text-text-subtle truncate max-w-[80px]" title={tool.model_provider}>
              {tool.model_provider}
            </span>
          )}

          {tool.github_stars != null && tool.github_stars > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-text-subtle">
              <Github size={9} />
              {formatStars(tool.github_stars)}
            </span>
          )}

          {tool.traffic_tier && TRAFFIC_LABELS[tool.traffic_tier] && (
            <span className="flex items-center gap-0.5 text-[10px] text-text-subtle">
              <Users size={9} />
              {TRAFFIC_LABELS[tool.traffic_tier]}
            </span>
          )}

          {tool.avg_stars != null && tool.avg_stars > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-text-subtle ml-auto">
              <Star size={9} className="fill-amber-400 text-amber-400" />
              {tool.avg_stars.toFixed(1)}
              {tool.rating_count != null && tool.rating_count > 0 && (
                <span className="text-text-subtle/60 ml-0.5">({tool.rating_count})</span>
              )}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}
