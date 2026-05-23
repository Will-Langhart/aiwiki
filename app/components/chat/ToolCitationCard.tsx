import { Link } from "react-router";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CitedTool {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logo_url: string | null;
  pricing_tier: string;
}

interface ToolCitationCardProps {
  tool: CitedTool;
}

const PRICING_COLORS: Record<string, string> = {
  free: "bg-emerald-500/10 text-emerald-600 border-0",
  freemium: "bg-blue-500/10 text-blue-500 border-0",
  paid: "bg-amber-500/10 text-amber-600 border-0",
  enterprise: "bg-purple-500/10 text-purple-600 border-0",
};

export function ToolCitationCard({ tool }: ToolCitationCardProps) {
  return (
    <Link
      to={`/tools/${tool.slug}`}
      className="flex items-start gap-3 p-3 rounded-lg border border-border bg-surface hover:bg-surface-2 transition-colors group"
    >
      {/* Logo */}
      <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center flex-shrink-0 overflow-hidden border border-border">
        {tool.logo_url ? (
          <img src={tool.logo_url} alt={tool.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm font-bold text-text-subtle">
            {tool.name[0]?.toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text truncate">{tool.name}</span>
          <Badge className={`text-xs flex-shrink-0 ${PRICING_COLORS[tool.pricing_tier] ?? ""}`}>
            {tool.pricing_tier}
          </Badge>
        </div>
        <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{tool.tagline}</p>
      </div>

      <ExternalLink size={12} className="text-text-subtle flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}
