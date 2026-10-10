import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { formatDistanceToNow } from "date-fns";
import { Plus, ExternalLink, Sparkles, Loader2, MessagesSquare } from "lucide-react";
import { supabase } from "@/lib/supabase.client";
import { Skeleton } from "@/components/ui/skeleton";
import { type AskedQuestion, type DemandGroup, groupQuestions } from "@/lib/answer-demand";

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

const DEMAND_WINDOW_DAYS = 90;

/** Real visitor questions from chat (admin RLS, migration 0038), grouped. */
async function fetchDemand(answers: AnswerRow[]): Promise<DemandGroup[]> {
  const since = new Date(Date.now() - DEMAND_WINDOW_DAYS * 86_400_000).toISOString();
  const { data } = await supabase
    .from("chat_messages")
    .select("id, content, created_at")
    .eq("role", "user")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);
  return groupQuestions((data ?? []) as AskedQuestion[], answers);
}

/** Calls the draft-answer Edge Function; resolves to the new draft's id. */
async function draftAnswer(question: string, sourceMessageId?: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("draft-answer", {
    body: { question, source_message_id: sourceMessageId },
  });
  if (error) {
    // FunctionsHttpError carries the function's JSON body on `context`.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? error.message);
  }
  return (data as { id: string }).id;
}

function QuestionsPeopleAsk({ answers }: { answers: AnswerRow[] }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data: groups, isLoading } = useQuery({
    queryKey: ["admin-answer-demand", answers.length],
    queryFn: () => fetchDemand(answers),
    staleTime: 60 * 1000,
  });

  const draft = async (key: string, question: string, sourceMessageId?: string) => {
    setBusy(key);
    setError(null);
    try {
      navigate(`/admin/answers/${await draftAnswer(question, sourceMessageId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Drafting failed");
      setBusy(null);
    }
  };

  const open = (groups ?? []).filter((g) => !g.answeredBy);

  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-text flex items-center gap-2">
          <MessagesSquare size={15} /> Questions people ask
        </h2>
        <p className="text-xs text-text-muted mt-0.5">
          From real chats in the last {DEMAND_WINDOW_DAYS} days, most-asked first. "Draft answer" writes a grounded
          draft from verified directory data (~$0.05–0.10). Nothing publishes until you do.
        </p>
      </div>

      <form
        className="flex gap-2 px-4 py-3 border-b border-border/60"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim().length >= 5) draft("custom", custom.trim());
        }}
      >
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Or draft from any question — e.g. best AI tools for podcast editing"
          className="flex-1 min-w-0 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button
          type="submit"
          disabled={busy !== null || custom.trim().length < 5}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-text hover:bg-surface-2 transition-colors disabled:opacity-50"
        >
          {busy === "custom" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Draft
        </button>
      </form>

      {error && <p className="px-4 py-2 text-sm text-danger border-b border-border/60">{error}</p>}

      {isLoading ? (
        <div className="p-4 space-y-2">
          {["d0", "d1", "d2"].map((k) => <Skeleton key={k} className="h-9 rounded-lg" />)}
        </div>
      ) : open.length === 0 ? (
        <p className="px-4 py-6 text-sm text-text-muted text-center">No unanswered recurring questions yet.</p>
      ) : (
        <ul className="divide-y divide-border/60 max-h-[26rem] overflow-y-auto">
          {open.slice(0, 25).map((g) => (
            <li key={g.key} className="flex items-center gap-3 px-4 py-2.5">
              <span
                className="w-8 shrink-0 text-center text-xs font-semibold tabular-nums text-text-muted"
                title={`Asked ${g.count}×`}
              >
                {g.count}×
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text truncate">{g.question}</p>
                <p className="text-xs text-text-subtle">
                  last asked {formatDistanceToNow(new Date(g.lastAsked), { addSuffix: true })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => draft(g.key, g.question, g.sourceMessageId)}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {busy === g.key ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {busy === g.key ? "Drafting…" : "Draft answer"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
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

      <QuestionsPeopleAsk answers={answers ?? []} />

      {isLoading ? (
        <div className="space-y-2">
          {["s0", "s1", "s2"].map((k) => <Skeleton key={k} className="h-14 rounded-lg" />)}
        </div>
      ) : (answers?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-text-muted">
          No answers yet. Draft one from a question above, or create one from scratch.
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
