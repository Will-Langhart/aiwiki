import { useCallback } from "react";
import { supabase } from "@/lib/supabase.client";
import { useSubmissionStore, type DraftData } from "@/stores/submission";
import type { Json } from "@/types/database";
import type { User } from "@supabase/supabase-js";

export function useSubmissionDraft(user: User | null) {
  const { draftId, data, setDraftId, setSaving } = useSubmissionStore();

  /** Persist current form data. Creates a draft if none exists yet. */
  const saveDraft = useCallback(
    async (overrides?: Partial<DraftData>): Promise<string | null> => {
      if (!user) return null;
      const payload = overrides ? { ...data, ...overrides } : data;

      setSaving(true);
      try {
        if (draftId) {
          await supabase
            .from("tool_drafts")
            .update({ data: payload as unknown as Json, updated_at: new Date().toISOString() })
            .eq("id", draftId);
          return draftId;
        }
          const { data: row, error } = await supabase
            .from("tool_drafts")
            .insert({
              submitter_id: user.id,
              status: "in_progress",
              data: payload as unknown as Json,
            })
            .select("id")
            .single();
          if (error || !row) return null;

          setDraftId(row.id);

          // Log creation
          await supabase.from("submissions_log").insert({
            draft_id: row.id,
            actor_id: user.id,
            action: "created",
          });

          return row.id;
      } finally {
        setSaving(false);
      }
    },
    [draftId, data, user, setDraftId, setSaving]
  );

  /** Mark the draft as submitted. */
  const submitDraft = useCallback(async (): Promise<boolean> => {
    if (!user || !draftId) return false;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tool_drafts")
        .update({ status: "submitted", submitted_at: new Date().toISOString() })
        .eq("id", draftId);

      if (error) return false;

      await supabase.from("submissions_log").insert({
        draft_id: draftId,
        actor_id: user.id,
        action: "submitted",
      });

      return true;
    } finally {
      setSaving(false);
    }
  }, [draftId, user, setSaving]);

  return { saveDraft, submitDraft };
}
