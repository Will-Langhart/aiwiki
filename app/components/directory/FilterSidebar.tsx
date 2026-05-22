import { useSearchParams } from "react-router";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
    <div>
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
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
    next.delete("page"); // reset pagination
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="flex items-center gap-2">
      <Checkbox id={`${param}-${value}`} checked={checked} onCheckedChange={toggle} />
      <Label htmlFor={`${param}-${value}`} className="text-sm text-text-muted cursor-pointer">
        {label}
      </Label>
    </div>
  );
}

function BooleanFilter({ param, label }: { param: string; label: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const checked = searchParams.get(param) === "true";

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
    <div className="flex items-center gap-2">
      <Checkbox id={`bool-${param}`} checked={checked} onCheckedChange={toggle} />
      <Label htmlFor={`bool-${param}`} className="text-sm text-text-muted cursor-pointer">
        {label}
      </Label>
    </div>
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
    <aside className={cn("space-y-5", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text">Filters</p>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors"
          >
            <X size={12} />
            Clear
          </button>
        )}
      </div>

      {/* Categories */}
      <FilterSection title="Category">
        {categories.map((cat) => (
          <CheckboxFilter key={cat.slug} param="cat" value={cat.slug} label={cat.name} />
        ))}
      </FilterSection>

      <Separator />

      {/* Pricing */}
      <FilterSection title="Pricing">
        {PRICING_OPTIONS.map((opt) => (
          <CheckboxFilter key={opt.value} param="pricing" value={opt.value} label={opt.label} />
        ))}
      </FilterSection>

      <Separator />

      {/* Audience */}
      <FilterSection title="Audience">
        {AUDIENCE_OPTIONS.map((opt) => (
          <CheckboxFilter key={opt.value} param="audience" value={opt.value} label={opt.label} />
        ))}
      </FilterSection>

      <Separator />

      {/* Feature flags */}
      <FilterSection title="Features">
        <BooleanFilter param="api" label="Has API" />
        <BooleanFilter param="oss" label="Open source" />
      </FilterSection>
    </aside>
  );
}
