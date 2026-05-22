import { useAudienceStore } from "@/stores/audience";
import { cn } from "@/lib/utils";

type Audience = "both" | "technical" | "non_technical";

const OPTIONS: { value: Audience; label: string }[] = [
  { value: "both", label: "Both" },
  { value: "technical", label: "Technical" },
  { value: "non_technical", label: "General" },
];

interface AudienceToggleProps {
  className?: string;
}

export function AudienceToggle({ className }: AudienceToggleProps) {
  const { audience, setAudience } = useAudienceStore();

  return (
    <div
      className={cn("inline-flex items-center rounded-lg bg-surface-2 p-1 gap-0.5", className)}
      aria-label="Content audience"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={audience === opt.value}
          onClick={() => setAudience(opt.value)}
          className={cn(
            "px-3 py-1 text-sm rounded-md transition-all",
            audience === opt.value
              ? "bg-surface shadow-sm text-text font-medium"
              : "text-text-muted hover:text-text"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
