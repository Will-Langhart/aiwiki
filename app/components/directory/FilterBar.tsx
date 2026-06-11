import { useSearchParams } from "react-router";
import {
  BrainCircuit, Code2, ImageIcon, Video, Headphones, PenLine,
  BookOpen, Presentation, Sparkles, BarChart3, Workflow,
  Database, Mic, Megaphone, Zap, GitFork, X, Layers, ListTodo, Cpu, HeadphonesIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "chat-assistants": BrainCircuit,
  "coding": Code2,
  "coding-development": Code2,
  "image-generation": ImageIcon,
  "video": Video,
  "video-generation": Video,
  "audio-music": Headphones,
  "writing": PenLine,
  "writing-editing": PenLine,
  "search-research": BookOpen,
  "presentations-docs": Presentation,
  "design": Sparkles,
  "data-analytics": BarChart3,
  "automation": Workflow,
  "infrastructure": Database,
  "ai-infrastructure": Database,
  "voice-speech": Mic,
  "marketing-sales": Megaphone,
  "productivity-notes": ListTodo,
  "open-source-llms": Cpu,
  "customer-service": HeadphonesIcon,
};

const PRICING_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "freemium", label: "Freemium" },
  { value: "paid", label: "Paid" },
  { value: "enterprise", label: "Enterprise" },
];

interface Category {
  id: string;
  slug: string;
  name: string;
}

interface FilterBarProps {
  categories: Category[];
  resultCount: number;
  loading?: boolean;
}

function Pill({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border whitespace-nowrap",
        active
          ? "bg-accent text-accent-fg border-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_20%,transparent)]"
          : "bg-surface-2 text-text-muted hover:bg-accent/10 hover:text-accent border-transparent hover:border-accent/30",
        className
      )}
    >
      {children}
    </button>
  );
}

export function FilterBar({ categories, resultCount, loading }: FilterBarProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeCats = searchParams.getAll("cat");
  const activePricing = searchParams.getAll("pricing");
  const hasApi = searchParams.get("api") === "true";
  const hasOss = searchParams.get("oss") === "true";
  const hasFilters = activeCats.length > 0 || activePricing.length > 0 || hasApi || hasOss;

  const toggleMulti = (param: string, value: string, current: string[]) => {
    const next = new URLSearchParams(searchParams);
    next.delete(param);
    if (current.includes(value)) {
      for (const v of current.filter((c) => c !== value)) next.append(param, v);
    } else {
      for (const v of current) next.append(param, v);
      next.append(param, value);
    }
    next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const toggleBool = (param: string, current: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (current) next.delete(param);
    else next.set(param, "true");
    next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const clearAll = () => {
    const next = new URLSearchParams();
    const q = searchParams.get("q");
    if (q) next.set("q", q);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-2 mb-6">
      {/* Category pills — scrolls on mobile, wraps on desktop */}
      <div className="flex gap-1.5 flex-nowrap overflow-x-auto lg:flex-wrap pb-0.5 -mb-0.5 [&::-webkit-scrollbar]:hidden">
        <Pill
          active={activeCats.length === 0}
          onClick={() => {
            const next = new URLSearchParams(searchParams);
            next.delete("cat");
            setSearchParams(next, { replace: true });
          }}
        >
          All
        </Pill>
        {categories.map((cat) => {
          const Icon = CATEGORY_ICONS[cat.slug] ?? Layers;
          return (
            <Pill
              key={cat.slug}
              active={activeCats.includes(cat.slug)}
              onClick={() => toggleMulti("cat", cat.slug, activeCats)}
            >
              <Icon size={11} />
              {cat.name}
            </Pill>
          );
        })}
      </div>

      {/* Pricing + features + count */}
      <div className="flex items-center flex-wrap gap-1.5">
        {PRICING_OPTIONS.map((opt) => (
          <Pill
            key={opt.value}
            active={activePricing.includes(opt.value)}
            onClick={() => toggleMulti("pricing", opt.value, activePricing)}
          >
            {opt.label}
          </Pill>
        ))}

        <div className="w-px h-4 bg-border/60 mx-0.5 self-center" />

        <Pill active={hasApi} onClick={() => toggleBool("api", hasApi)}>
          <Zap size={10} />
          Has API
        </Pill>

        <Pill active={hasOss} onClick={() => toggleBool("oss", hasOss)}>
          <GitFork size={10} />
          Open Source
        </Pill>

        <div className="ml-auto flex items-center gap-3">
          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
            >
              <X size={11} />
              Clear
            </button>
          )}
          {!loading && (
            <span className="text-xs text-text-subtle tabular-nums">
              {resultCount.toLocaleString()} tool{resultCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
