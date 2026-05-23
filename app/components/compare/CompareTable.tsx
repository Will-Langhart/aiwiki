import { Check, X, Minus, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ComparableTool {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  website_url: string;
  logo_url: string | null;
  pricing_tier: string;
  has_free_tier: boolean;
  pricing_starts_at: number | null;
  pricing_currency: string;
  audience_fit: string;
  model_provider: string | null;
  open_source: boolean;
  self_hostable: boolean;
  api_available: boolean;
  founded_year: number | null;
  hq_country: string | null;
  hq_city: string | null;
  key_strengths: string[];
  category_name?: string | null;
}

interface CompareTableProps {
  tools: ComparableTool[];
}

const PRICING_LABELS: Record<string, string> = {
  free: "Free",
  freemium: "Freemium",
  paid: "Paid",
  enterprise: "Enterprise",
};

const AUDIENCE_LABELS: Record<string, string> = {
  technical: "Technical",
  non_technical: "Non-technical",
  both: "All audiences",
};

function BoolCell({ value }: { value: boolean }) {
  return value ? (
    <Check size={16} className="text-emerald-500" aria-label="Yes" />
  ) : (
    <X size={16} className="text-text-subtle" aria-label="No" />
  );
}

function TextCell({ value }: { value: string | null | undefined }) {
  if (!value) return <Minus size={14} className="text-text-subtle" />;
  return <span className="text-text text-sm">{value}</span>;
}

interface Row {
  label: string;
  render: (tool: ComparableTool) => React.ReactNode;
}

const ROWS: Row[] = [
  {
    label: "Category",
    render: (t) => <TextCell value={t.category_name} />,
  },
  {
    label: "Pricing",
    render: (t) => (
      <Badge variant="secondary" className="text-xs font-normal">
        {PRICING_LABELS[t.pricing_tier] ?? t.pricing_tier}
      </Badge>
    ),
  },
  {
    label: "Starting price",
    render: (t) => {
      if (t.pricing_tier === "free") return <span className="text-emerald-500 text-sm font-medium">Free</span>;
      if (!t.pricing_starts_at) return <TextCell value={null} />;
      return (
        <span className="text-text text-sm">
          {t.pricing_currency} {t.pricing_starts_at.toLocaleString()}/mo
        </span>
      );
    },
  },
  {
    label: "Free tier",
    render: (t) => <BoolCell value={t.has_free_tier || t.pricing_tier === "free"} />,
  },
  {
    label: "Audience",
    render: (t) => <TextCell value={AUDIENCE_LABELS[t.audience_fit] ?? t.audience_fit} />,
  },
  {
    label: "API available",
    render: (t) => <BoolCell value={t.api_available} />,
  },
  {
    label: "Open source",
    render: (t) => <BoolCell value={t.open_source} />,
  },
  {
    label: "Self-hostable",
    render: (t) => <BoolCell value={t.self_hostable} />,
  },
  {
    label: "Model provider",
    render: (t) => <TextCell value={t.model_provider} />,
  },
  {
    label: "Founded",
    render: (t) => <TextCell value={t.founded_year ? String(t.founded_year) : null} />,
  },
  {
    label: "Headquarters",
    render: (t) => {
      const parts = [t.hq_city, t.hq_country].filter(Boolean).join(", ");
      return <TextCell value={parts || null} />;
    },
  },
  {
    label: "Key strengths",
    render: (t) => {
      if (!t.key_strengths?.length) return <Minus size={14} className="text-text-subtle" />;
      return (
        <ul className="text-xs text-text-muted space-y-0.5">
          {t.key_strengths.slice(0, 4).map((s) => (
            <li key={s} className="flex items-start gap-1">
              <span className="text-accent mt-0.5 leading-none">·</span>
              {s}
            </li>
          ))}
        </ul>
      );
    },
  },
];

export function CompareTable({ tools }: CompareTableProps) {
  const colWidth = `${100 / tools.length}%`;

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full min-w-[600px] border-collapse text-sm">
        {/* Tool header row */}
        <thead>
          <tr className="border-b border-border">
            {/* Empty label column */}
            <th className="w-36 sticky left-0 bg-bg p-3 text-left font-normal" />
            {tools.map((tool) => (
              <th
                key={tool.id}
                style={{ width: colWidth }}
                className="p-3 text-center align-top border-l border-border/50"
              >
                <div className="flex flex-col items-center gap-2">
                  {tool.logo_url ? (
                    <img
                      src={tool.logo_url}
                      alt={tool.name}
                      className="w-12 h-12 rounded-xl object-contain bg-surface-2 p-1"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent text-lg font-bold">
                      {tool.name[0]}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-text text-base">{tool.name}</div>
                    <p className="text-xs text-text-muted line-clamp-2 max-w-[160px] mx-auto mt-0.5">
                      {tool.tagline}
                    </p>
                  </div>
                  <a
                    href={tool.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent hover:underline flex items-center gap-0.5"
                  >
                    Visit <ExternalLink size={10} />
                  </a>
                </div>
              </th>
            ))}
          </tr>
        </thead>

        {/* Data rows */}
        <tbody>
          {ROWS.map((row, i) => (
            <tr
              key={row.label}
              className={cn("border-b border-border/60", i % 2 === 0 ? "bg-bg" : "bg-surface")}
            >
              <td className="sticky left-0 p-3 font-medium text-text-muted whitespace-nowrap bg-inherit border-r border-border/50 text-xs">
                {row.label}
              </td>
              {tools.map((tool) => (
                <td
                  key={tool.id}
                  className="p-3 text-center align-middle border-l border-border/50"
                >
                  <div className="flex justify-center">{row.render(tool)}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
