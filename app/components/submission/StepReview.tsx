import { useState } from "react";
import { Loader2, CheckCircle } from "lucide-react";
import { useSubmissionStore } from "@/stores/submission";
import { Button } from "@/components/ui/button";
import type { User } from "@supabase/supabase-js";

interface StepReviewProps {
  user: User;
  onBack: () => void;
  onSubmit: () => Promise<boolean>;
}

export function StepReview({ onBack, onSubmit }: StepReviewProps) {
  const { data } = useSubmissionStore();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    const ok = await onSubmit();
    setSubmitting(false);
    if (ok) {
      setSubmitted(true);
    } else {
      setError("Something went wrong. Please try again.");
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
        <CheckCircle size={48} className="text-emerald-500" />
        <h2 className="text-xl font-bold text-text">Submission received!</h2>
        <p className="text-text-muted max-w-sm">
          Your tool has been submitted for review. We&apos;ll notify you once it&apos;s been reviewed.
        </p>
        <a href="/tools" className="text-sm text-accent hover:underline mt-2">
          Back to directory →
        </a>
      </div>
    );
  }

  const AUDIENCE_LABELS: Record<string, string> = {
    technical: "Technical",
    non_technical: "Non-technical",
    both: "All audiences",
  };

  const PRICING_LABELS: Record<string, string> = {
    free: "Free",
    freemium: "Freemium",
    paid: "Paid",
    enterprise: "Enterprise",
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4 text-sm">
        {/* Basics */}
        <div>
          <h3 className="font-semibold text-text mb-2">Basics</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-text-muted">URL</dt>
            <dd className="text-text truncate">{data.website_url}</dd>
            <dt className="text-text-muted">Name</dt>
            <dd className="text-text">{data.name || <span className="text-danger">Missing</span>}</dd>
            <dt className="text-text-muted">Tagline</dt>
            <dd className="text-text">{data.tagline || <span className="text-danger">Missing</span>}</dd>
          </dl>
        </div>

        <hr className="border-border" />

        {/* Description */}
        <div>
          <h3 className="font-semibold text-text mb-2">Description</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-text-muted">Overview</dt>
            <dd className="text-text line-clamp-2">
              {data.overview_md || <span className="text-danger">Missing</span>}
            </dd>
            {data.docs_intro_md && (
              <>
                <dt className="text-text-muted">Docs</dt>
                <dd className="text-text line-clamp-1">{data.docs_intro_md}</dd>
              </>
            )}
          </dl>
        </div>

        <hr className="border-border" />

        {/* Facts */}
        <div>
          <h3 className="font-semibold text-text mb-2">Facts</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-text-muted">Pricing</dt>
            <dd className="text-text">{PRICING_LABELS[data.pricing_tier]}</dd>
            <dt className="text-text-muted">Audience</dt>
            <dd className="text-text">{AUDIENCE_LABELS[data.audience_fit]}</dd>
            {data.key_strengths.length > 0 && (
              <>
                <dt className="text-text-muted">Strengths</dt>
                <dd className="text-text">{data.key_strengths.join(", ")}</dd>
              </>
            )}
          </dl>
        </div>

        {data.screenshots.length > 0 && (
          <>
            <hr className="border-border" />
            <div>
              <h3 className="font-semibold text-text mb-2">Screenshots</h3>
              <p className="text-text-muted text-sm">{data.screenshots.length} image{data.screenshots.length !== 1 ? "s" : ""} attached</p>
            </div>
          </>
        )}
      </div>

      {error && (
        <p className="text-sm text-danger text-center">{error}</p>
      )}

      <p className="text-xs text-text-muted text-center">
        By submitting you confirm this tool is real, you&apos;re not affiliated with it in an undisclosed way,
        and the content is your own original writing.
      </p>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 size={14} className="animate-spin mr-1.5" />
              Submitting…
            </>
          ) : (
            "Submit tool →"
          )}
        </Button>
      </div>
    </div>
  );
}
