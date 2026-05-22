import { Globe, MapPin, Calendar, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ToolHeroProps {
  tool: {
    pricing_tier: string;
    pricing_starts_at: number | null;
    pricing_currency: string;
    founded_year: number | null;
    hq_country: string | null;
    hq_city: string | null;
    self_hostable: boolean;
    key_strengths: string[];
  };
}

const PRICING_DISPLAY: Record<string, string> = {
  free: "Completely free",
  freemium: "Free tier + paid plans",
  paid: "Paid only",
  enterprise: "Enterprise pricing",
};

export function ToolHero({ tool }: ToolHeroProps) {
  const pricingLabel = PRICING_DISPLAY[tool.pricing_tier] ?? tool.pricing_tier;
  const priceDetail =
    tool.pricing_starts_at
      ? ` (from $${tool.pricing_starts_at} ${tool.pricing_currency}/month)`
      : "";

  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
      {/* Key strengths */}
      {tool.key_strengths.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Key strengths
          </p>
          <div className="flex flex-wrap gap-1.5">
            {tool.key_strengths.map((strength) => (
              <Badge key={strength} variant="secondary" className="text-xs">
                {strength}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Facts grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
        <div className="flex items-center gap-2 text-text-muted">
          <Tag size={14} className="text-text-subtle flex-shrink-0" />
          <span>
            <span className="text-text">{pricingLabel}</span>
            {priceDetail && <span className="text-text-subtle text-xs">{priceDetail}</span>}
          </span>
        </div>

        {(tool.hq_city || tool.hq_country) && (
          <div className="flex items-center gap-2 text-text-muted">
            <MapPin size={14} className="text-text-subtle flex-shrink-0" />
            <span>
              {[tool.hq_city, tool.hq_country].filter(Boolean).join(", ")}
            </span>
          </div>
        )}

        {tool.founded_year && (
          <div className="flex items-center gap-2 text-text-muted">
            <Calendar size={14} className="text-text-subtle flex-shrink-0" />
            <span>Founded {tool.founded_year}</span>
          </div>
        )}

        {tool.self_hostable && (
          <div className="flex items-center gap-2 text-text-muted">
            <Globe size={14} className="text-text-subtle flex-shrink-0" />
            <span>Self-hostable</span>
          </div>
        )}
      </div>
    </div>
  );
}
