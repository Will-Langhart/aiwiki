import { useEffect } from "react";
import { Save } from "lucide-react";
import { useSubmissionStore, DRAFT_DATA_DEFAULTS } from "@/stores/submission";
import { useSubmissionDraft } from "@/hooks/useSubmissionDraft";
import { StepBasics } from "./StepBasics";
import { StepDescription } from "./StepDescription";
import { StepFacts } from "./StepFacts";
import { StepScreenshots } from "./StepScreenshots";
import { StepReview } from "./StepReview";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";

const STEPS = [
  { label: "Basics" },
  { label: "Description" },
  { label: "Facts" },
  { label: "Screenshots" },
  { label: "Review" },
];

interface SubmissionWizardProps {
  user: User;
  /** Pre-existing draft ID (from URL) */
  draftId?: string;
  /** Pre-existing draft data (from DB) */
  initialData?: Record<string, unknown>;
  /** Initial step (e.g. from draft status) */
  initialStep?: number;
}

export function SubmissionWizard({ user, draftId, initialData, initialStep }: SubmissionWizardProps) {
  const { step, setStep, setDraftId, patch, isSaving, reset } = useSubmissionStore();
  const { saveDraft, submitDraft } = useSubmissionDraft(user);

  // Hydrate store from existing draft on mount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only re-run on draftId change; store setters are stable
  useEffect(() => {
    reset();
    if (draftId) setDraftId(draftId);
    if (initialData) {
      patch({ ...DRAFT_DATA_DEFAULTS, ...(initialData as Partial<typeof DRAFT_DATA_DEFAULTS>) });
    }
    if (initialStep) setStep(initialStep);
  }, [draftId]); // only re-run when draftId changes (page navigation)

  const goNext = async () => {
    await saveDraft();
    setStep(Math.min(step + 1, 5));
  };

  const goBack = () => setStep(Math.max(step - 1, 1));

  const handleSubmit = async () => {
    const id = await saveDraft();
    if (!id) return false;
    return submitDraft();
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Step progress */}
      <div className="flex items-center gap-0 mb-8 overflow-x-auto">
        {STEPS.map((s, i) => {
          const num = i + 1;
          const active = step === num;
          const done = step > num;
          return (
            <div key={s.label} className="flex items-center flex-shrink-0">
              <button
                type="button"
                onClick={() => done && setStep(num)}
                disabled={!done}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                  active && "text-accent",
                  done && "text-text-muted hover:text-accent cursor-pointer",
                  !active && !done && "text-text-subtle cursor-default"
                )}
              >
                <span
                  className={cn(
                    "inline-flex items-center justify-center w-5 h-5 rounded-full text-xs border",
                    active && "border-accent bg-accent text-accent-fg",
                    done && "border-accent/50 bg-accent/10 text-accent",
                    !active && !done && "border-border text-text-subtle"
                  )}
                >
                  {done ? "✓" : num}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <span className="w-6 h-px bg-border flex-shrink-0 mx-1" />
              )}
            </div>
          );
        })}

        {/* Auto-save indicator */}
        {isSaving && (
          <div className="ml-auto flex items-center gap-1 text-xs text-text-muted flex-shrink-0">
            <Save size={11} className="animate-pulse" />
            Saving…
          </div>
        )}
      </div>

      {/* Step heading */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text">
          Step {step} of {STEPS.length} — {STEPS[step - 1].label}
        </h1>
      </div>

      {/* Step content */}
      {step === 1 && <StepBasics user={user} onNext={goNext} />}
      {step === 2 && <StepDescription onNext={goNext} onBack={goBack} />}
      {step === 3 && <StepFacts onNext={goNext} onBack={goBack} />}
      {step === 4 && <StepScreenshots user={user} onNext={goNext} onBack={goBack} />}
      {step === 5 && <StepReview user={user} onBack={goBack} onSubmit={handleSubmit} />}
    </div>
  );
}
