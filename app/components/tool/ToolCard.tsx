import { Link } from "react-router";
import { ExternalLink, Star, GitFork, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ToolCardProps {
  tool: {
    slug: string;
    name: string;
    tagline: string;
    logo_url: string | null;
    pricing_tier: string;
    has_free_tier?: boolean;
    audience_fit: string;
    api_available?: boolean;
    open_source?: boolean;
    avg_stars?: number | null;
    rating_count?: number;
    category_name?: string | null;
    category_slug?: string | null;
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

const PRICING_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  free: "default",
  freemium: "secondary",
  paid: "outline",
  enterprise: "outline",
};

function ToolLogo({ name, logo_url }: { name: string; logo_url: string | null }) {
  if (logo_url) {
    return (
      <img
        src={logo_url}
        alt={`${name} logo`}
        className="w-10 h-10 rounded-lg object-contain bg-surface-2 p-0.5 flex-shrink-0"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
          (e.currentTarget.nextElementSibling as HTMLElement | null)?.classList.remove("hidden");
        }}
      />
    );
  }
  return (
    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent text-sm font-bold flex-shrink-0">
      {name[0]}
    </div>
  );
}

export function ToolCard({ tool, dense = false, className }: ToolCardProps) {
  const hasFreeTier = tool.has_free_tier || tool.pricing_tier === "free" || tool.pricing_tier === "freemium";

  return (
    <Link
      to={`/tools/${tool.slug}`}
      className={cn(
        "group block rounded-xl border border-border bg-surface hover:bg-surface-2 hover:border-accent/30 transition-all duration-150",
        dense ? "p-3" : "p-4",
        className
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 mb-2">
        <ToolLogo name={tool.name} logo_url={tool.logo_url} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className={cn("font-semibold text-text group-hover:text-accent transition-colors", dense ? "text-sm" : "text-base")}>
              {tool.name}
            </h3>
            {hasFreeTier && (
              <Badge variant="secondary" className="text-xs py-0 h-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                Free
              </Badge>
            )}
          </div>
          {tool.category_name && (
            <p className="text-xs text-text-subtle mt-0.5">{tool.category_name}</p>
          )}
        </div>
      </div>

      {/* Tagline */}
      <p className={cn("text-text-muted leading-snug line-clamp-2", dense ? "text-xs" : "text-sm")}>
        {tool.tagline}
      </p>

      {/* Footer row */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <Badge variant={PRICING_VARIANTS[tool.pricing_tier] ?? "outline"} className="text-xs">
          {PRICING_LABELS[tool.pricing_tier] ?? tool.pricing_tier}
        </Badge>

        {tool.api_available && (
          <span className="flex items-center gap-0.5 text-xs text-text-subtle">
            <Zap size={10} className="text-accent" />
            API
          </span>
        )}

        {tool.open_source && (
          <span className="flex items-center gap-0.5 text-xs text-text-subtle">
            <GitFork size={10} />
            OSS
          </span>
        )}

        {tool.avg_stars != null && tool.avg_stars > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-text-subtle ml-auto">
            <Star size={10} className="fill-amber-400 text-amber-400" />
            {tool.avg_stars.toFixed(1)}
            {tool.rating_count ? ` (${tool.rating_count})` : ""}
          </span>
        )}
      </div>
    </Link>
  );
}
