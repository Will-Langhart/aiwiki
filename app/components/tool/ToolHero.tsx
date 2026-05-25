import { Globe, MapPin, Calendar, DollarSign } from "lucide-react";

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
      ? ` · from $${tool.pricing_starts_at} ${tool.pricing_currency}/mo`
      : "";

  const facts = [
    {
      icon: DollarSign,
      label: `${pricingLabel}${priceDetail}`,
      show: true,
    },
    {
      icon: MapPin,
      label: [tool.hq_city, tool.hq_country].filter(Boolean).join(", "),
      show: !!(tool.hq_city || tool.hq_country),
    },
    {
      icon: Calendar,
      label: `Founded ${tool.founded_year}`,
      show: !!tool.founded_year,
    },
    {
      icon: Globe,
      label: "Self-hostable",
      show: tool.self_hostable,
    },
  ].filter((f) => f.show);

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-[var(--shadow-card)]">
      {/* Key strengths — accent-tinted header band */}
      {tool.key_strengths.length > 0 && (
        <div className="px-5 pt-4 pb-3.5 border-b border-border/60"
          style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 5%, transparent), color-mix(in srgb, var(--accent-2) 4%, transparent))" }}>
          <p className="text-[10px] font-semibold text-accent uppercase tracking-widest mb-2.5">
            Key strengths
          </p>
          <div className="flex flex-wrap gap-1.5">
            {tool.key_strengths.map((strength) => (
              <span
                key={strength}
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-bg/70 border border-accent/15 text-text-muted"
              >
                {strength}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Facts row */}
      {facts.length > 0 && (
        <div className="px-5 py-3.5 flex flex-wrap gap-x-6 gap-y-2.5">
          {facts.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-sm text-text-muted">
              <Icon size={13} className="text-text-subtle flex-shrink-0" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
