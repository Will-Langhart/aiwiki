import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { formatDistanceToNow } from "date-fns";
import { Plus, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase.client";
import { Skeleton } from "@/components/ui/skeleton";

interface AnswerRow {
  id: string;
  slug: string;
  question: string;
  status: string;
  updated_at: string;
  view_count: number;
}

async function fetchAnswers(): Promise<AnswerRow[]> {
  const { data } = await supabase
    .from("public_answers")
    .select("id, slug, question, status, updated_at, view_count")
    .order("updated_at", { ascending: false });
  return (data ?? []) as AnswerRow[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-surface-2 text-text-muted",
  published: "bg-emerald-500/10 text-emerald-600",
  archived: "bg-amber-500/10 text-amber-600",
};

export default function AdminAnswers() {
  const { data: answers, isLoading } = useQuery({
    queryKey: ["admin-answers"],
    queryFn: fetchAnswers,
    staleTime: 30 * 1000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Answer pages</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Editor-curated public answers. Published pages are prerendered and indexable.
          </p>
        </div>
        <Link
          to="/admin/answers/new"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-accent-fg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={15} /> New answer
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {["s0", "s1", "s2"].map((k) => <Skeleton key={k} className="h-14 rounded-lg" />)}
        </div>
      ) : (answers?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-text-muted">
          No answers yet. Create one, or promote a good chat answer.
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/60">
          {answers?.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors">
              <Link to={`/admin/answers/${a.id}`} className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text truncate">{a.question}</p>
                <p className="text-xs text-text-subtle mt-0.5">
                  /answers/{a.slug} · updated {formatDistanceToNow(new Date(a.updated_at), { addSuffix: true })}
                </p>
              </Link>
              <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[a.status] ?? "bg-surface-2 text-text-muted"}`}>
                {a.status}
              </span>
              {a.status === "published" && (
                <a
                  href={`/answers/${a.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-subtle hover:text-text transition-colors"
                  aria-label="View published page"
                >
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
