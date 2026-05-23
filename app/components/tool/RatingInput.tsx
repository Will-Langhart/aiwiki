import { useState } from "react";
import { Star } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase.client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface RatingInputProps {
  toolId: string;
  toolName: string;
  userId: string;
  existingRating?: { stars: number; review_text: string | null };
  queryKey: unknown[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STAR_LABELS = ["Terrible", "Poor", "Okay", "Good", "Excellent"];
const STAR_KEYS = ["s1", "s2", "s3", "s4", "s5"] as const;

export function RatingInput({
  toolId,
  toolName,
  userId,
  existingRating,
  queryKey,
  open,
  onOpenChange,
}: RatingInputProps) {
  const queryClient = useQueryClient();
  const [hovered, setHovered] = useState(0);
  const [selected, setSelected] = useState(existingRating?.stars ?? 0);
  const [review, setReview] = useState(existingRating?.review_text ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = hovered || selected;

  const handleSubmit = async () => {
    if (selected === 0) {
      setError("Please select a star rating.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: upsertError } = await supabase.from("ratings").upsert(
        {
          user_id: userId,
          tool_id: toolId,
          stars: selected,
          review_text: review.trim() || null,
        },
        { onConflict: "user_id,tool_id" }
      );
      if (upsertError) {
        setError(upsertError.message);
        return;
      }
      await queryClient.invalidateQueries({ queryKey });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Rate {toolName}</DialogTitle>
        <DialogDescription>How would you rate your experience?</DialogDescription>

        {/* Star picker */}
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
            {STAR_KEYS.map((key, i) => {
              const val = i + 1;
              return (
                <button
                  key={key}
                  type="button"
                  onMouseEnter={() => setHovered(val)}
                  onClick={() => setSelected(val)}
                  aria-label={`${val} star${val !== 1 ? "s" : ""}`}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    size={28}
                    className={cn(
                      "transition-colors",
                      val <= active ? "text-amber-400" : "text-text-subtle"
                    )}
                    fill={val <= active ? "currentColor" : "none"}
                  />
                </button>
              );
            })}
          </div>
          {active > 0 && (
            <p className="text-sm text-text-muted">{STAR_LABELS[active - 1]}</p>
          )}
        </div>

        {/* Review text */}
        <div className="space-y-1.5">
          <label htmlFor="rating-review" className="text-sm font-medium text-text">
            Review{" "}
            <span className="text-text-subtle font-normal">(optional)</span>
          </label>
          <Textarea
            id="rating-review"
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="Tell others what you think…"
            rows={3}
            maxLength={1000}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : existingRating ? "Update rating" : "Submit rating"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
