import { useParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase.client";
import { AdminSubmissionEditor } from "@/components/admin/AdminSubmissionEditor";
import { Skeleton } from "@/components/ui/skeleton";

async function fetchDraft(id: string) {
  const { data, error } = await supabase
    .from("tool_drafts")
    .select(`
      id, status, submitted_at, data, reviewer_notes, rejection_reason,
      submitter:profiles!tool_drafts_submitter_id_fkey(id, display_name, username)
    `)
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data;
}

export default function AdminSubmissionDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: draft, isLoading } = useQuery({
    queryKey: ["admin-draft", id],
    queryFn: () => fetchDraft(id ?? ""),
    enabled: !!id,
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="py-12 text-center">
        <p className="text-text-muted mb-4">Draft not found.</p>
        <Link to="/admin/submissions" className="text-accent hover:underline text-sm">
          ← Back to submissions
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link to="/admin/submissions" className="text-sm text-text-muted hover:text-accent mb-4 inline-block">
        ← All submissions
      </Link>
      <AdminSubmissionEditor draft={draft as unknown as Parameters<typeof AdminSubmissionEditor>[0]["draft"]} />
    </div>
  );
}
