import { useSearchParams } from "react-router";
import {
  BrainCircuit, Code2, ImageIcon, Video, Headphones, PenLine,
  BookOpen, Presentation, Sparkles, BarChart3, Workflow,
  Database, Mic, Megaphone, Zap, GitFork, X, Layers, ListTodo, Cpu, HeadphonesIcon,
  FlaskConical, Bot, Activity, LayoutDashboard, GraduationCap, Shield,
  Scale, Users, Landmark, HeartPulse, Blocks,
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
  "vector-databases": Database,
  "mlops-training": FlaskConical,
  "agent-frameworks": Bot,
  "ai-observability": Activity,
  "productivity": LayoutDashboard,
  "customer-support": HeadphonesIcon,
  "education": GraduationCap,
  "no-code": Blocks,
  "security": Shield,
  "legal": Scale,
  "hr-recruiting": Users,
  "finance": Landmark,
  "healthcare": HeartPulse,
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
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 border whitespace-nowrap shrink-0",
        active
          ? "bg-accent text-accent-fg border-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_20%,transparent)] scale-[1.02]"
          : "bg-surface/60 text-text-muted hover:bg-accent/10 hover:text-accent border-border/60 hover:border-accent/40 hover:scale-[1.02]",
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
    <div className="space-y-3.5">
      {/* Category scroll strip */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-subtle select-none shrink-0">
            Category
          </span>
          <div className="flex-1 h-px bg-border/40" />
          {activeCats.length > 0 && (
            <span className="text-[10px] font-medium text-accent shrink-0">
              {activeCats.length} selected
            </span>
          )}
        </div>

        {/* Horizontal scroll with fade edges */}
        <div className="relative">
          <div
            className="flex gap-1.5 overflow-x-auto pb-0.5"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
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
            {/* Spacer so last pill clears the fade */}
            <div className="w-8 shrink-0" />
          </div>
          {/* Right fade */}
          <div
            className="absolute right-0 top-0 bottom-0.5 w-10 pointer-events-none"
            style={{ background: "linear-gradient(to right, transparent, var(--surface) 80%)" }}
          />
        </div>
      </div>

      {/* Pricing / features row */}
      <div
        className="flex items-center gap-2 pt-0.5 border-t border-border/30"
      >
        <div className="flex items-center gap-1.5 flex-1 flex-wrap min-w-0">
          {PRICING_OPTIONS.map((opt) => (
            <Pill
              key={opt.value}
              active={activePricing.includes(opt.value)}
              onClick={() => toggleMulti("pricing", opt.value, activePricing)}
            >
              {opt.label}
            </Pill>
          ))}

          <div className="w-px h-4 bg-border/50 mx-0.5 self-center shrink-0" />

          <Pill active={hasApi} onClick={() => toggleBool("api", hasApi)}>
            <Zap size={10} />
            Has API
          </Pill>

          <Pill active={hasOss} onClick={() => toggleBool("oss", hasOss)}>
            <GitFork size={10} />
            Open Source
          </Pill>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="flex items-center gap-1 text-[11px] font-medium text-text-muted hover:text-accent transition-colors"
            >
              <X size={11} />
              Clear
            </button>
          )}
          {!loading && (
            <span className="text-[11px] font-semibold tabular-nums px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent">
              {resultCount.toLocaleString()} tools
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
