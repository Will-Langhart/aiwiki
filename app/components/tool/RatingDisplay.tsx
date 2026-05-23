import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface RatingDisplayProps {
  avgStars: number | null;
  ratingCount: number;
  /** When provided, renders a "Rate this tool" link */
  onRateClick?: () => void;
  className?: string;
}

function StarIcon({ filled, half }: { filled: boolean; half?: boolean }) {
  return (
    <Star
      size={14}
      className={cn(
        "flex-shrink-0",
        filled || half ? "text-amber-400" : "text-text-subtle"
      )}
      fill={filled ? "currentColor" : half ? "url(#half)" : "none"}
    />
  );
}

export function RatingDisplay({ avgStars, ratingCount, onRateClick, className }: RatingDisplayProps) {
  const stars = avgStars ?? 0;
  const starKeys = ["s1", "s2", "s3", "s4", "s5"] as const;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center gap-0.5">
        {starKeys.map((key, i) => {
          const val = i + 1;
          return (
            <StarIcon
              key={key}
              filled={stars >= val}
              half={stars >= val - 0.5 && stars < val}
            />
          );
        })}
      </div>
      <span className="text-sm text-text-muted">
        {ratingCount > 0 ? (
          <>
            <span className="text-text font-medium">{stars.toFixed(1)}</span>
            {" "}({ratingCount.toLocaleString()} {ratingCount === 1 ? "rating" : "ratings"})
          </>
        ) : (
          "No ratings yet"
        )}
      </span>
      {onRateClick && (
        <button
          type="button"
          onClick={onRateClick}
          className="text-xs text-accent hover:underline ml-1"
        >
          Rate this tool
        </button>
      )}
    </div>
  );
}
