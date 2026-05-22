import { ExternalLink, Bookmark, BookmarkCheck, GitFork, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ToolHeaderProps {
  tool: {
    name: string;
    tagline: string;
    logo_url: string | null;
    website_url: string;
    pricing_tier: string;
    has_free_tier: boolean;
    open_source: boolean;
    api_available: boolean;
    audience_fit: string;
    model_provider: string | null;
  };
  isBookmarked?: boolean;
  onBookmarkToggle?: () => void;
}

const AUDIENCE_LABELS: Record<string, string> = {
  technical: "Technical",
  non_technical: "Non-technical",
  both: "All audiences",
};

const PRICING_LABELS: Record<string, string> = {
  free: "Free",
  freemium: "Free tier available",
  paid: "Paid",
  enterprise: "Enterprise",
};

export function ToolHeader({ tool, isBookmarked = false, onBookmarkToggle }: ToolHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start">
      {/* Logo */}
      {tool.logo_url ? (
        <img
          src={tool.logo_url}
          alt={`${tool.name} logo`}
          className="w-16 h-16 rounded-2xl object-contain bg-surface-2 p-1 flex-shrink-0"
        />
      ) : (
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center text-accent text-2xl font-bold flex-shrink-0">
          {tool.name[0]}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <h1 className="text-2xl font-bold text-text">{tool.name}</h1>
          {tool.has_free_tier && (
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 mt-1">
              Free tier
            </Badge>
          )}
        </div>
        <p className="text-text-muted mt-1 text-base leading-snug">{tool.tagline}</p>

        {/* Meta chips */}
        <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-text-subtle">
          <span>{PRICING_LABELS[tool.pricing_tier] ?? tool.pricing_tier}</span>
          <span>·</span>
          <span>{AUDIENCE_LABELS[tool.audience_fit] ?? tool.audience_fit}</span>
          {tool.model_provider && (
            <>
              <span>·</span>
              <span>Powered by {tool.model_provider}</span>
            </>
          )}
          {tool.api_available && (
            <>
              <span>·</span>
              <span className="flex items-center gap-0.5">
                <Zap size={10} className="text-accent" />
                API available
              </span>
            </>
          )}
          {tool.open_source && (
            <>
              <span>·</span>
              <span className="flex items-center gap-0.5">
                <GitFork size={10} />
                Open source
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {onBookmarkToggle && (
          <Button variant="ghost" size="icon" onClick={onBookmarkToggle} aria-label={isBookmarked ? "Remove bookmark" : "Bookmark tool"}>
            {isBookmarked ? (
              <BookmarkCheck size={18} className="text-accent" />
            ) : (
              <Bookmark size={18} />
            )}
          </Button>
        )}
        <a
          href={tool.website_url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "default" }))}
        >
          Visit <ExternalLink size={14} className="ml-1" />
        </a>
      </div>
    </div>
  );
}
