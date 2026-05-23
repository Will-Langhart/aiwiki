import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase.client";
import { Button } from "@/components/ui/button";

interface BookmarkButtonProps {
  toolId: string;
  toolSlug: string;
  userId: string | undefined;
  isBookmarked: boolean;
  /** Query key whose data includes the isBookmarked field — will be invalidated after toggle */
  queryKey?: unknown[];
  onAuthRequired?: () => void;
}

export function BookmarkButton({
  toolId,
  userId,
  isBookmarked: initialIsBookmarked,
  queryKey,
  onAuthRequired,
}: BookmarkButtonProps) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();

  const active = optimistic ?? initialIsBookmarked;

  const toggle = async () => {
    if (!userId) {
      onAuthRequired?.();
      return;
    }
    if (pending) return;

    // Optimistic update
    setPending(true);
    setOptimistic(!active);

    try {
      if (active) {
        const { error } = await supabase
          .from("bookmarks")
          .delete()
          .eq("tool_id", toolId)
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("bookmarks")
          .insert({ tool_id: toolId, user_id: userId });
        if (error) throw error;
      }

      // Invalidate so background refetch syncs server state
      if (queryKey) {
        await queryClient.invalidateQueries({ queryKey });
      }
      // Keep optimistic value — it'll be overwritten by the re-fetch
    } catch {
      // Revert optimistic update on error
      setOptimistic(active);
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      disabled={pending}
      aria-label={active ? "Remove bookmark" : "Bookmark this tool"}
      aria-pressed={active}
    >
      {active ? (
        <BookmarkCheck size={18} className="text-accent" />
      ) : (
        <Bookmark size={18} />
      )}
    </Button>
  );
}
