import { useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase.client";
import type { Json } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface DraftData {
  name: string;
  tagline: string;
  website_url: string;
  overview_md?: string;
  docs_intro_md?: string;
  use_cases_md?: string;
  pricing_tier?: string;
  has_free_tier?: boolean;
  audience_fit?: string;
  open_source?: boolean;
  api_available?: boolean;
  model_provider?: string;
  key_strengths?: string[];
  slug?: string;
  primary_category_id?: string;
}

interface Draft {
  id: string;
  status: string;
  submitted_at: string | null;
  data: DraftData;
  reviewer_notes: string | null;
  rejection_reason: string | null;
  submitter: { display_name: string | null; username: string; id: string } | null;
}

interface AdminSubmissionEditorProps {
  draft: Draft;
}

const REJECT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "low_quality", label: "Low quality" },
  { value: "duplicate", label: "Duplicate" },
  { value: "off_topic", label: "Off-topic (not an AI tool)" },
  { value: "other", label: "Other" },
];

function DiffBadge({ changed }: { changed: boolean }) {
  if (!changed) return null;
  return (
    <Badge className="ml-1 text-xs bg-amber-500/10 text-amber-600 border-0 px-1.5 py-0">
      edited
    </Badge>
  );
}

function FieldRow({
  label,
  original,
  editValue,
  onChange,
  multiline = false,
}: {
  label: string;
  original: string;
  editValue: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const changed = editValue !== original;
  return (
    <div className="grid grid-cols-2 gap-3 py-3 border-b border-border/50 last:border-0">
      {/* Original */}
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-text-muted">{label}</span>
        </div>
        <div className="text-sm text-text bg-surface-2 p-2 rounded min-h-[32px] whitespace-pre-wrap">
          {original || <span className="text-text-subtle italic">Empty</span>}
        </div>
      </div>
      {/* Edit */}
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-text-muted">Admin edit</span>
          <DiffBadge changed={changed} />
        </div>
        {multiline ? (
          <Textarea
            value={editValue}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            className="text-sm min-h-[80px]"
          />
        ) : (
          <Input
            value={editValue}
            onChange={(e) => onChange(e.target.value)}
            className="text-sm h-8"
          />
        )}
      </div>
    </div>
  );
}

export function AdminSubmissionEditor({ draft }: AdminSubmissionEditorProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Editable copy of the submission data
  const [edits, setEdits] = useState<DraftData>({ ...draft.data });
  const [reviewerNotes, setReviewerNotes] = useState(draft.reviewer_notes ?? "");
  const [rejectReason, setRejectReason] = useState("low_quality");
  const [rejectMessage, setRejectMessage] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const patchEdit = (k: keyof DraftData, v: string) =>
    setEdits((prev) => ({ ...prev, [k]: v }));

  const saveEdits = async () => {
    const { error } = await supabase
      .from("tool_drafts")
      .update({
        data: edits as unknown as Json,
        reviewer_id: (await supabase.auth.getUser()).data.user?.id,
        reviewer_notes: reviewerNotes || null,
        status: draft.status === "submitted" ? "in_review" : draft.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft.id);

    if (!error) {
      // Log the edit
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("submissions_log").insert({
        draft_id: draft.id,
        actor_id: user?.id,
        action: "reviewed",
        notes: reviewerNotes || null,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-draft", draft.id] });
    }
    return !error;
  };

  const handleApprove = async () => {
    if (!await saveEdits()) return;
    setProcessing(true);
    setActionError(null);
    try {
      const d = edits;
      const slug = (d.slug || d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) ?? "tool";

      // Upsert into tools
      const { data: tool, error: toolError } = await supabase
        .from("tools")
        .upsert({
          slug,
          name: d.name,
          tagline: d.tagline,
          website_url: d.website_url,
          primary_category_id: d.primary_category_id || null,
          pricing_tier: d.pricing_tier ?? "freemium",
          has_free_tier: d.has_free_tier ?? false,
          audience_fit: d.audience_fit ?? "both",
          model_provider: d.model_provider || null,
          open_source: d.open_source ?? false,
          self_hostable: false,
          api_available: d.api_available ?? false,
          key_strengths: d.key_strengths ?? [],
          status: "published",
          submitted_by: draft.submitter?.id ?? null,
          published_at: new Date().toISOString(),
          edited_by_admin: true,
        }, { onConflict: "slug" })
        .select("id")
        .single();

      if (toolError || !tool) {
        setActionError(`Failed to publish: ${toolError?.message ?? "unknown error"}`);
        return;
      }

      // Insert content blocks from draft
      const blocksToInsert = [];
      if (d.overview_md) {
        blocksToInsert.push({
          tool_id: tool.id,
          section: "overview",
          audience: "both",
          heading: "Overview",
          body_md: d.overview_md,
          sort_order: 1,
        });
      }
      if (d.docs_intro_md) {
        blocksToInsert.push({
          tool_id: tool.id,
          section: "docs",
          audience: "both",
          heading: "Documentation",
          body_md: d.docs_intro_md,
          sort_order: 1,
        });
      }
      if (d.use_cases_md) {
        blocksToInsert.push({
          tool_id: tool.id,
          section: "use_cases",
          audience: "both",
          heading: "Use Cases",
          body_md: d.use_cases_md,
          sort_order: 1,
        });
      }

      if (blocksToInsert.length > 0) {
        await supabase.from("content_blocks").insert(blocksToInsert);
      }

      // Update draft status
      await supabase
        .from("tool_drafts")
        .update({ status: "approved", reviewed_at: new Date().toISOString() })
        .eq("id", draft.id);

      // Log
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("submissions_log").insert({
        draft_id: draft.id,
        actor_id: user?.id,
        action: "approved",
      });

      // Create notification for submitter
      if (draft.submitter?.id) {
        await supabase.from("notifications").insert({
          user_id: draft.submitter.id,
          type: "submission_approved",
          payload: {
            title: "Your tool was approved!",
            body: `${d.name} has been published to the AI Wiki directory.`,
            link: `/tools/${slug}`,
          },
        });
      }

      queryClient.invalidateQueries({ queryKey: ["admin-drafts"] });
      navigate("/admin/submissions");
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    setProcessing(true);
    setActionError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      await supabase
        .from("tool_drafts")
        .update({
          status: "rejected",
          rejection_reason: rejectReason,
          reviewer_notes: rejectMessage || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", draft.id);

      await supabase.from("submissions_log").insert({
        draft_id: draft.id,
        actor_id: user?.id,
        action: "rejected",
        notes: rejectMessage || null,
      });

      // Notify submitter
      if (draft.submitter?.id) {
        await supabase.from("notifications").insert({
          user_id: draft.submitter.id,
          type: "submission_rejected",
          payload: {
            title: "Submission not approved",
            body: `${draft.data.name} was not approved: ${rejectReason}${rejectMessage ? ` — ${rejectMessage}` : ""}`,
          },
        });
      }

      queryClient.invalidateQueries({ queryKey: ["admin-drafts"] });
      navigate("/admin/submissions");
    } finally {
      setProcessing(false);
    }
  };

  const submittedAt = draft.submitted_at
    ? formatDistanceToNow(new Date(draft.submitted_at), { addSuffix: true })
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">{draft.data.name || "Unnamed"}</h1>
          <p className="text-text-muted text-sm">
            by {draft.submitter?.display_name ?? draft.submitter?.username ?? "Unknown"}
            {submittedAt && ` · submitted ${submittedAt}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={saveEdits}
            disabled={processing}
          >
            Save edits
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowRejectForm((v) => !v)}
            disabled={processing || draft.status === "rejected" || draft.status === "approved"}
          >
            <XCircle size={14} className="mr-1" />
            Reject
          </Button>
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={processing || draft.status === "rejected" || draft.status === "approved"}
            className="bg-emerald-600 hover:bg-emerald-700 text-white border-0"
          >
            <CheckCircle2 size={14} className="mr-1" />
            {processing ? "Publishing…" : "Approve & publish"}
          </Button>
        </div>
      </div>

      {/* Reject form */}
      {showRejectForm && (
        <div className="p-4 rounded-xl border border-danger/30 bg-danger/5 space-y-3">
          <div className="flex items-center gap-2 text-danger font-medium text-sm">
            <AlertCircle size={15} />
            Reject submission
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Reason *</Label>
            <select
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {REJECT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reject-message">Message to submitter (optional)</Label>
            <Textarea
              id="reject-message"
              value={rejectMessage}
              onChange={(e) => setRejectMessage(e.target.value)}
              rows={2}
              placeholder="Explain what they could improve…"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleReject}
              disabled={processing}
            >
              Confirm rejection
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowRejectForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {actionError && (
        <div className="p-3 rounded-lg border border-danger/30 bg-danger/5 text-danger text-sm">
          {actionError}
        </div>
      )}

      {/* Two-column diff editor */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-2 gap-0 bg-surface px-4 py-2.5 border-b border-border text-xs font-semibold text-text-muted">
          <span>Original submission</span>
          <span>Admin edits</span>
        </div>
        <div className="p-4 space-y-0">
          <FieldRow label="Name" original={draft.data.name} editValue={edits.name} onChange={(v) => patchEdit("name", v)} />
          <FieldRow label="Website URL" original={draft.data.website_url} editValue={edits.website_url} onChange={(v) => patchEdit("website_url", v)} />
          <FieldRow label="Tagline" original={draft.data.tagline} editValue={edits.tagline} onChange={(v) => patchEdit("tagline", v)} />
          <FieldRow label="Overview" original={draft.data.overview_md ?? ""} editValue={edits.overview_md ?? ""} onChange={(v) => patchEdit("overview_md", v)} multiline />
          <FieldRow label="Docs intro" original={draft.data.docs_intro_md ?? ""} editValue={edits.docs_intro_md ?? ""} onChange={(v) => patchEdit("docs_intro_md", v)} multiline />
          <FieldRow label="Use cases" original={draft.data.use_cases_md ?? ""} editValue={edits.use_cases_md ?? ""} onChange={(v) => patchEdit("use_cases_md", v)} multiline />
        </div>
      </div>

      {/* Reviewer notes */}
      <div className="space-y-1.5">
        <Label htmlFor="reviewer-notes">Reviewer notes (internal, not shown to submitter)</Label>
        <Textarea
          id="reviewer-notes"
          value={reviewerNotes}
          onChange={(e) => setReviewerNotes(e.target.value)}
          rows={2}
          placeholder="Notes for other admins…"
        />
      </div>

      {/* Quick facts summary */}
      <div className="rounded-xl border border-border p-4">
        <h3 className="text-sm font-medium text-text mb-3">Structured facts (from draft)</h3>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {[
            ["Pricing", draft.data.pricing_tier],
            ["Audience", draft.data.audience_fit],
            ["Model", draft.data.model_provider || "—"],
            ["Open source", draft.data.open_source ? "Yes" : "No"],
            ["API", draft.data.api_available ? "Yes" : "No"],
            ["Free tier", draft.data.has_free_tier ? "Yes" : "No"],
          ].map(([k, v]) => (
            <div key={k} className={cn("p-2 rounded-lg bg-surface-2")}>
              <dt className="text-text-muted mb-0.5">{k}</dt>
              <dd className="font-medium text-text capitalize">{v}</dd>
            </div>
          ))}
        </dl>
        {(draft.data.key_strengths?.length ?? 0) > 0 && (
          <div className="mt-3">
            <p className="text-xs text-text-muted mb-1.5">Key strengths</p>
            <div className="flex flex-wrap gap-1.5">
              {draft.data.key_strengths?.map((s) => (
                <span key={s} className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
