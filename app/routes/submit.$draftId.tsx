import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabase.client";
import { SubmissionWizard } from "@/components/submission/SubmissionWizard";
import { Skeleton } from "@/components/ui/skeleton";

async function fetchDraft(draftId: string, userId: string) {
  const { data, error } = await supabase
    .from("tool_drafts")
    .select("id, status, data")
    .eq("id", draftId)
    .eq("submitter_id", userId)
    .single();
  if (error) return null;
  return data;
}

export default function SubmitDraft() {
  const { draftId } = useParams<{ draftId: string }>();
  const { user, loading } = useCurrentUser();

  const { data: draft, isLoading: draftLoading } = useQuery({
    queryKey: ["draft", draftId, user?.id],
    queryFn: () => fetchDraft(draftId ?? "", user?.id ?? ""),
    enabled: !!draftId && !!user,
    staleTime: 60 * 1000,
  });

  if (loading || draftLoading) {
    return (
      <div className="container py-12 max-w-2xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container py-20 text-center">
        <p className="text-text-muted">You must be signed in to edit this draft.</p>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="container py-20 text-center">
        <p className="text-2xl font-bold mb-2">Draft not found</p>
        <p className="text-text-muted">This draft doesn&apos;t exist or you don&apos;t have access.</p>
      </div>
    );
  }

  const statusToStep: Record<string, number> = {
    in_progress: 1,
    submitted: 5,
    in_review: 5,
  };

  return (
    <SubmissionWizard
      user={user}
      draftId={draft.id}
      initialData={draft.data as Record<string, unknown>}
      initialStep={statusToStep[draft.status] ?? 1}
    />
  );
}
