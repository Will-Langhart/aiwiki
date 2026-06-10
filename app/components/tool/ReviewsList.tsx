import { useQuery } from "@tanstack/react-query";
import { Star, MessageSquare } from "lucide-react";
import { supabase } from "@/lib/supabase.client";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface Review {
  id: string;
  stars: number;
  review_text: string | null;
  created_at: string;
  profiles: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface ReviewsListProps {
  toolId: string;
  className?: string;
}

function StarRow({ stars }: { stars: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={12}
          className={i <= stars ? "text-amber-400" : "text-text-subtle"}
          fill={i <= stars ? "currentColor" : "none"}
        />
      ))}
    </div>
  );
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initial = (name || "A")[0].toUpperCase();
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
      style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
    >
      {initial}
    </div>
  );
}

async function fetchReviews(toolId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from("ratings")
    .select("id, stars, review_text, created_at, profiles(display_name, avatar_url)")
    .eq("tool_id", toolId)
    .not("review_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  return (data as Review[]) ?? [];
}

export function ReviewsList({ toolId, className }: ReviewsListProps) {
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["reviews", toolId],
    queryFn: () => fetchReviews(toolId),
    staleTime: 60 * 1000,
  });

  if (isLoading) return null;
  if (reviews.length === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
        <MessageSquare size={14} className="text-text-muted" />
        Reviews
        <span className="text-text-subtle font-normal">({reviews.length})</span>
      </h3>
      <div className="space-y-3">
        {reviews.map((review) => {
          const name = review.profiles?.display_name ?? "Anonymous";
          const ago = formatDistanceToNow(new Date(review.created_at), { addSuffix: true });
          return (
            <div
              key={review.id}
              className="flex gap-3 p-3 rounded-xl border border-border bg-surface"
            >
              <Avatar name={name} avatarUrl={review.profiles?.avatar_url ?? null} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-text">{name}</span>
                  <StarRow stars={review.stars} />
                  <span className="text-xs text-text-subtle ml-auto">{ago}</span>
                </div>
                <p className="text-sm text-text-muted leading-relaxed">{review.review_text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
