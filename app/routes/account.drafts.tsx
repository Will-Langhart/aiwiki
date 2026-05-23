import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { formatDistanceToNow } from "date-fns";
import { FileEdit, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase.client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DraftRow {
  id: string;
  status: string;
  created_at: string;
  submitted_at: string | null;
  updated_at: string;
  data: { name?: string; website_url?: string; tagline?: string };
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  in_progress: { label: "In progress", className: "bg-surface-2 text-text-muted border-0" },
  submitted: { label: "Under review", className: "bg-blue-500/10 text-blue-500 border-0" },
  in_review: { label: "In review", className: "bg-amber-500/10 text-amber-500 border-0" },
  approved: { label: "Approved", className: "bg-emerald-500/10 text-emerald-600 border-0" },
  rejected: { label: "Rejected", className: "bg-danger/10 text-danger border-0" },
};

async function fetchMyDrafts(userId: string): Promise<DraftRow[]> {
  const { data, error } = await supabase
    .from("tool_drafts")
    .select("id, status, created_at, submitted_at, updated_at, data")
    .eq("submitter_id", userId)
    .order("updated_at", { ascending: false });
  if (error) return [];
  return (data as unknown as DraftRow[]) ?? [];
}

function DraftsSkeleton() {
  return (
    <div className="space-y-2">
      {(["sk-0","sk-1","sk-2"] as const).map((k) => (
        <Skeleton key={k} className="h-16 rounded-lg" />
      ))}
    </div>
  );
}

export default function Drafts() {
  const { user } = useCurrentUser();

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ["my-drafts", user?.id],
    queryFn: () => fetchMyDrafts(user?.id ?? ""),
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-text">My submissions</h2>
          <p className="text-text-muted text-sm mt-0.5">Tools you&apos;ve submitted or started drafting.</p>
        </div>
        <Link to="/submit" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
          <Plus size={14} className="mr-1.5" />
          Submit new tool
        </Link>
      </div>

      {isLoading ? (
        <DraftsSkeleton />
      ) : drafts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
            <FileEdit size={24} className="text-text-subtle" />
          </div>
          <p className="text-text font-medium mb-1">No submissions yet</p>
          <p className="text-text-muted text-sm mb-6">Know a great AI tool? Submit it to the directory.</p>
          <Link to="/submit" className={cn(buttonVariants({ variant: "default" }))}>
            Submit your first tool
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map((d) => {
            const name = d.data.name || "(untitled)";
            const cfg = STATUS_CONFIG[d.status] ?? { label: d.status, className: "" };
            const lastActivity = d.submitted_at ?? d.updated_at;
            const canEdit = d.status === "in_progress";

            return (
              <div
                key={d.id}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-surface hover:bg-surface-2 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text text-sm truncate">{name}</span>
                    <Badge className={cn("flex-shrink-0 text-xs", cfg.className)}>
                      {cfg.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    Updated {formatDistanceToNow(new Date(lastActivity), { addSuffix: true })}
                  </p>
                </div>
                {canEdit && (
                  <Link
                    to={`/submit/${d.id}`}
                    className="text-xs text-accent hover:underline flex-shrink-0"
                  >
                    Continue →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
