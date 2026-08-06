import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Components } from "react-markdown";
import { X, Plus, ExternalLink, ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase.client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { MarkdownRenderer } from "@/components/tool/MarkdownRenderer";
import { Skeleton } from "@/components/ui/skeleton";

// ── helpers ─────────────────────────────────────────────────────────────────
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

interface ToolLite {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
}

interface AnswerForm {
  question: string;
  slug: string;
  summary: string;
  answer_md: string;
  tool_ids: string[];
  category_id: string | null;
  status: string;
}

const EMPTY: AnswerForm = {
  question: "",
  slug: "",
  summary: "",
  answer_md: "",
  tool_ids: [],
  category_id: null,
  status: "draft",
};

// ── data ──────────────────────────────────────────────────────────────────────
async function fetchAnswer(id: string) {
  const { data } = await supabase
    .from("public_answers")
    .select("id, question, slug, summary, answer_md, tool_ids, category_id, status")
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function fetchCategories(): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase.from("categories").select("id, name").order("sort_order");
  return (data ?? []) as { id: string; name: string }[];
}

async function fetchToolsByIds(ids: string[]): Promise<ToolLite[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase.from("tools").select("id, slug, name, logo_url").in("id", ids);
  const byId = new Map((data as ToolLite[] | null ?? []).map((t) => [t.id, t]));
  return ids.map((i) => byId.get(i)).filter((t): t is ToolLite => !!t);
}

// ── tool picker ─────────────────────────────────────────────────────────────
function ToolPicker({
  selected,
  onChange,
}: {
  selected: ToolLite[];
  onChange: (tools: ToolLite[]) => void;
}) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  const { data: results = [] } = useQuery({
    queryKey: ["answer-tool-search", debounced],
    enabled: debounced.length >= 2,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<ToolLite[]> => {
      const { data } = await supabase
        .from("tools")
        .select("id, slug, name, logo_url")
        .eq("status", "published")
        .ilike("name", `%${debounced}%`)
        .limit(8);
      return (data ?? []) as ToolLite[];
    },
  });

  const selectedIds = new Set(selected.map((t) => t.id));
  const add = (t: ToolLite) => {
    if (selectedIds.has(t.id)) return;
    onChange([...selected, t]);
    setTerm("");
  };
  const remove = (id: string) => onChange(selected.filter((t) => t.id !== id));

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md bg-surface-2 border border-border text-xs text-text"
            >
              {t.name}
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="text-text-subtle hover:text-danger p-0.5"
                aria-label={`Remove ${t.name}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search published tools to cite…"
          className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg max-h-64 overflow-y-auto">
            {results.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => add(t)}
                disabled={selectedIds.has(t.id)}
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-40 transition-colors"
              >
                <Plus size={13} className="text-text-subtle" />
                {t.name}
                <span className="text-text-subtle text-xs ml-auto">/{t.slug}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── editor ────────────────────────────────────────────────────────────────────
export default function AdminAnswerEditor() {
  const { id } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useCurrentUser();

  const [form, setForm] = useState<AnswerForm>(EMPTY);
  const [selectedTools, setSelectedTools] = useState<ToolLite[]>([]);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const { data: categories = [] } = useQuery({ queryKey: ["categories-min"], queryFn: fetchCategories, staleTime: 300_000 });
  const { data: loaded, isLoading } = useQuery({
    queryKey: ["admin-answer", id],
    queryFn: () => fetchAnswer(id as string),
    enabled: !isNew,
  });

  // Hydrate form + selected tools once the answer loads.
  useEffect(() => {
    if (!loaded) return;
    setForm({
      question: loaded.question,
      slug: loaded.slug,
      summary: loaded.summary ?? "",
      answer_md: loaded.answer_md,
      tool_ids: (loaded.tool_ids ?? []) as string[],
      category_id: loaded.category_id,
      status: loaded.status,
    });
    setSlugTouched(true);
    fetchToolsByIds((loaded.tool_ids ?? []) as string[]).then(setSelectedTools);
  }, [loaded]);

  // Auto-suggest slug from the question until the admin edits it directly.
  const set = <K extends keyof AnswerForm>(k: K, v: AnswerForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const onQuestion = (q: string) =>
    setForm((f) => ({ ...f, question: q, slug: slugTouched ? f.slug : slugify(q) }));

  const toolIds = useMemo(() => selectedTools.map((t) => t.id), [selectedTools]);

  const canPublish = form.question.trim() && form.answer_md.trim() && form.slug.trim();

  async function save(nextStatus?: "draft" | "published" | "archived") {
    setMsg(null);
    const status = nextStatus ?? form.status;
    if (status === "published" && !canPublish) {
      setMsg({ kind: "err", text: "Question, answer, and slug are required to publish." });
      return;
    }
    setSaving(true);

    const payload: Record<string, unknown> = {
      question: form.question.trim(),
      slug: form.slug.trim(),
      summary: form.summary.trim() || null,
      answer_md: form.answer_md,
      tool_ids: toolIds,
      category_id: form.category_id,
      status,
    };
    if (status === "published") {
      payload.published_at = new Date().toISOString();
      payload.curated_by = user?.id ?? null;
    }

    try {
      if (isNew) {
        const { data, error } = await supabase.from("public_answers").insert(payload).select("id").single();
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["admin-answers"] });
        navigate(`/admin/answers/${data.id}`, { replace: true });
        setMsg({ kind: "ok", text: "Created." });
      } else {
        const { error } = await supabase.from("public_answers").update(payload).eq("id", id as string);
        if (error) throw error;
        setForm((f) => ({ ...f, status }));
        await qc.invalidateQueries({ queryKey: ["admin-answers"] });
        await qc.invalidateQueries({ queryKey: ["admin-answer", id] });
        setMsg({ kind: "ok", text: status === "published" ? "Published — a rebuild was triggered." : "Saved." });
      }
    } catch (err) {
      const e = err as { code?: string; message?: string };
      setMsg({
        kind: "err",
        text: e.code === "23505" ? "That slug is already taken — choose another." : e.message ?? "Save failed.",
      });
    } finally {
      setSaving(false);
    }
  }

  // Live preview: [tool:slug] → bold name (matches the public renderer's intent).
  const previewMd = useMemo(() => {
    const bySlug = new Map(selectedTools.map((t) => [t.slug, t]));
    return form.answer_md.replace(/\[tool:([a-z0-9-]+)\]/g, (_, s) => {
      const t = bySlug.get(s);
      return `[${t ? t.name : s}](/tools/${s})`;
    });
  }, [form.answer_md, selectedTools]);

  const previewComponents: Components = {
    a: ({ href, children }) => <span className="text-accent font-medium">{children}</span>,
  };

  if (!isNew && isLoading) {
    return <div className="max-w-5xl space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-96 rounded-xl" /></div>;
  }
  if (!isNew && !loaded) {
    return <div className="max-w-2xl py-12 text-center text-text-muted">Answer not found.</div>;
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <Link to="/admin/answers" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors">
          <ArrowLeft size={15} /> Answers
        </Link>
        <div className="flex items-center gap-2">
          {form.status === "published" && (
            <a href={`/answers/${form.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text px-2 py-1.5">
              View <ExternalLink size={13} />
            </a>
          )}
          <button type="button" onClick={() => save("draft")} disabled={saving} className="px-3 py-2 rounded-lg border border-border text-sm font-medium text-text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-50">
            Save draft
          </button>
          {form.status === "published" ? (
            <button type="button" onClick={() => save("draft")} disabled={saving} className="px-3 py-2 rounded-lg border border-border text-sm font-medium text-amber-600 hover:bg-surface-2 transition-colors disabled:opacity-50">
              Unpublish
            </button>
          ) : (
            <button type="button" onClick={() => save("published")} disabled={saving || !canPublish} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-accent-fg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />} Publish
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className={`text-sm rounded-lg px-3 py-2 border ${msg.kind === "ok" ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/5" : "text-danger border-danger/30 bg-danger/5"}`}>
          {msg.text}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="space-y-4">
          <div>
            <label htmlFor="q" className="block text-xs font-medium text-text-muted mb-1">Question (H1)</label>
            <input id="q" value={form.question} onChange={(e) => onQuestion(e.target.value)} placeholder="Best free AI image generators?" className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>
          <div>
            <label htmlFor="slug" className="block text-xs font-medium text-text-muted mb-1">Slug</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-subtle">/answers/</span>
              <input id="slug" value={form.slug} onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value)); }} className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/30" />
            </div>
          </div>
          <div>
            <label htmlFor="summary" className="block text-xs font-medium text-text-muted mb-1">Summary (meta description, ≤160 chars)</label>
            <textarea id="summary" value={form.summary} onChange={(e) => set("summary", e.target.value)} rows={2} maxLength={200} className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" />
          </div>
          <div>
            <label htmlFor="cat" className="block text-xs font-medium text-text-muted mb-1">Category (optional)</label>
            <select id="cat" value={form.category_id ?? ""} onChange={(e) => set("category_id", e.target.value || null)} className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <span className="block text-xs font-medium text-text-muted mb-1">Cited tools (ordered)</span>
            <ToolPicker selected={selectedTools} onChange={setSelectedTools} />
            <p className="text-[11px] text-text-subtle mt-1">Reference a tool inline in the answer as <code className="bg-surface-2 px-1 rounded">[tool:slug]</code>.</p>
          </div>
          <div>
            <label htmlFor="md" className="block text-xs font-medium text-text-muted mb-1">Answer (markdown)</label>
            <textarea id="md" value={form.answer_md} onChange={(e) => set("answer_md", e.target.value)} rows={16} className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-6 self-start">
          <p className="text-xs font-medium text-text-muted mb-2">Preview</p>
          <div className="rounded-xl border border-border bg-surface p-5 max-h-[70vh] overflow-y-auto">
            <h1 className="text-2xl font-bold text-text mb-4 leading-tight">{form.question || "Untitled question"}</h1>
            {form.answer_md ? (
              <MarkdownRenderer content={previewMd} components={previewComponents} />
            ) : (
              <p className="text-sm text-text-subtle">Start writing to see a preview…</p>
            )}
            {selectedTools.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/60">
                <p className="text-xs font-medium text-text-muted mb-2">Tools mentioned</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTools.map((t) => (
                    <span key={t.id} className="text-xs px-2 py-0.5 rounded bg-surface-2 border border-border text-text-muted">{t.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
