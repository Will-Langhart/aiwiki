import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase.client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type DraftStatus = "submitted" | "in_review" | "approved" | "rejected";

interface DraftRow {
  id: string;
  status: string;
  submitted_at: string | null;
  updated_at: string;
  data: Record<string, unknown>;
  submitter: { display_name: string | null; username: string } | null;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  submitted: { label: "Submitted", className: "bg-blue-500/10 text-blue-500 border-0" },
  in_review: { label: "In review", className: "bg-amber-500/10 text-amber-500 border-0" },
  approved: { label: "Approved", className: "bg-emerald-500/10 text-emerald-600 border-0" },
  rejected: { label: "Rejected", className: "bg-danger/10 text-danger border-0" },
};

const ALL_STATUSES: DraftStatus[] = ["submitted", "in_review", "approved", "rejected"];

async function fetchDrafts(statuses: DraftStatus[]): Promise<DraftRow[]> {
  const { data, error } = await supabase
    .from("tool_drafts")
    .select(`
      id, status, submitted_at, updated_at, data,
      submitter:profiles!tool_drafts_submitter_id_fkey(display_name, username)
    `)
    .in("status", statuses)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error || !data) return [];
  return data as unknown as DraftRow[];
}

export function SubmissionQueue() {
  const [filter, setFilter] = useState<DraftStatus[]>(["submitted", "in_review"]);

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ["admin-drafts", filter],
    queryFn: () => fetchDrafts(filter),
    staleTime: 30 * 1000,
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text">Submissions</h1>
          <p className="text-text-muted text-sm mt-0.5">{drafts.length} result{drafts.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Status filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        {ALL_STATUSES.map((s) => {
          const active = filter.includes(s);
          const info = STATUS_BADGE[s];
          return (
            <button
              key={s}
              type="button"
              onClick={() =>
                setFilter((prev) =>
                  prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                )
              }
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                active ? "border-accent bg-accent/10 text-accent" : "border-border text-text-muted hover:border-text-muted"
              )}
            >
              {info.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {["sk-0","sk-1","sk-2","sk-3"].map((k) => (
            <Skeleton key={k} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-text-muted">No submissions match the selected filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left px-4 py-3 font-medium text-text-muted">Tool</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">Submitter</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">Status</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">Submitted</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {drafts.map((d) => {
                const toolName = (d.data.name as string) || "(unnamed)";
                const toolUrl = d.data.website_url as string | undefined;
                const submitterName =
                  d.submitter?.display_name ?? d.submitter?.username ?? "Unknown";
                const info = STATUS_BADGE[d.status] ?? { label: d.status, className: "" };

                return (
                  <tr key={d.id} className="bg-bg hover:bg-surface transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text">{toolName}</div>
                      {toolUrl && (
                        <div className="text-xs text-text-muted truncate max-w-[200px]">{toolUrl}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{submitterName}</td>
                    <td className="px-4 py-3">
                      <Badge className={info.className}>{info.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-text-muted whitespace-nowrap">
                      {d.submitted_at
                        ? formatDistanceToNow(new Date(d.submitted_at), { addSuffix: true })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/submissions/${d.id}`}
                        className="text-accent hover:underline text-sm"
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
