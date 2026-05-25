import { useSearchParams } from "react-router";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Category {
  id: string;
  slug: string;
  name: string;
}

interface FilterSidebarProps {
  categories: Category[];
  className?: string;
}

const PRICING_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "freemium", label: "Freemium" },
  { value: "paid", label: "Paid" },
  { value: "enterprise", label: "Enterprise" },
];

const AUDIENCE_OPTIONS = [
  { value: "technical", label: "Technical" },
  { value: "non_technical", label: "Non-technical" },
  { value: "both", label: "All audiences" },
];

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-text-subtle uppercase tracking-widest px-3">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function CheckboxFilter({
  param,
  value,
  label,
}: {
  param: string;
  value: string;
  label: string;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentValues = searchParams.getAll(param);
  const checked = currentValues.includes(value);
  const id = `${param}-${value}`;

  const toggle = () => {
    const next = new URLSearchParams(searchParams);
    if (checked) {
      next.delete(param);
      for (const v of currentValues.filter((cv) => cv !== value)) {
        next.append(param, v);
      }
    } else {
      next.append(param, value);
    }
    next.delete("page");
    setSearchParams(next, { replace: true });
  };

  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-center gap-2.5 px-3 py-1.5 rounded-lg cursor-pointer transition-colors",
        checked
          ? "bg-accent/10 text-accent"
          : "hover:bg-surface-2 text-text-muted hover:text-text"
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={toggle}
        className="w-3.5 h-3.5 rounded border border-border bg-surface accent-[var(--accent)] cursor-pointer flex-shrink-0"
      />
      <span className="text-sm leading-none">{label}</span>
    </label>
  );
}

function BooleanFilter({ param, label }: { param: string; label: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const checked = searchParams.get(param) === "true";
  const id = `bool-${param}`;

  const toggle = () => {
    const next = new URLSearchParams(searchParams);
    if (checked) {
      next.delete(param);
    } else {
      next.set(param, "true");
    }
    next.delete("page");
    setSearchParams(next, { replace: true });
  };

  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-center gap-2.5 px-3 py-1.5 rounded-lg cursor-pointer transition-colors",
        checked
          ? "bg-accent/10 text-accent"
          : "hover:bg-surface-2 text-text-muted hover:text-text"
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={toggle}
        className="w-3.5 h-3.5 rounded border border-border bg-surface accent-[var(--accent)] cursor-pointer flex-shrink-0"
      />
      <span className="text-sm leading-none">{label}</span>
    </label>
  );
}

export function FilterSidebar({ categories, className }: FilterSidebarProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const hasFilters =
    searchParams.getAll("cat").length > 0 ||
    searchParams.getAll("pricing").length > 0 ||
    searchParams.get("audience") ||
    searchParams.get("api") ||
    searchParams.get("oss");

  const clearFilters = () => {
    const next = new URLSearchParams();
    const existingQ = searchParams.get("q");
    if (existingQ) next.set("q", existingQ);
    setSearchParams(next, { replace: true });
  };

  return (
    <aside className={cn("rounded-xl border border-border bg-surface shadow-[var(--shadow-card)] overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border/60">
        <p className="text-sm font-semibold text-text">Filters</p>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
          >
            <X size={11} />
            Clear all
          </button>
        )}
      </div>

      <div className="py-3 space-y-4">
        {/* Categories */}
        <FilterSection title="Category">
          {categories.map((cat) => (
            <CheckboxFilter key={cat.slug} param="cat" value={cat.slug} label={cat.name} />
          ))}
        </FilterSection>

        <div className="border-t border-border/40 mx-3" />

        {/* Pricing */}
        <FilterSection title="Pricing">
          {PRICING_OPTIONS.map((opt) => (
            <CheckboxFilter key={opt.value} param="pricing" value={opt.value} label={opt.label} />
          ))}
        </FilterSection>

        <div className="border-t border-border/40 mx-3" />

        {/* Audience */}
        <FilterSection title="Audience">
          {AUDIENCE_OPTIONS.map((opt) => (
            <CheckboxFilter key={opt.value} param="audience" value={opt.value} label={opt.label} />
          ))}
        </FilterSection>

        <div className="border-t border-border/40 mx-3" />

        {/* Feature flags */}
        <FilterSection title="Features">
          <BooleanFilter param="api" label="Has API" />
          <BooleanFilter param="oss" label="Open source" />
        </FilterSection>
      </div>
    </aside>
  );
}
