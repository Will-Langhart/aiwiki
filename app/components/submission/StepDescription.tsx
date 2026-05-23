import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSubmissionStore } from "@/stores/submission";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const schema = z.object({
  overview_md: z.string().min(20, "At least 20 characters"),
  docs_intro_md: z.string(),
  use_cases_md: z.string(),
});

type FormValues = z.infer<typeof schema>;

interface StepDescriptionProps {
  onNext: () => void;
  onBack: () => void;
}

const USE_CASE_PROMPT = `Examples to get you started:
- "Use it to draft marketing copy in seconds"
- "Automate repetitive data-entry workflows"
- "Generate first drafts of technical documentation"`;

export function StepDescription({ onNext, onBack }: StepDescriptionProps) {
  const { data: storeData, patch } = useSubmissionStore();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      overview_md: storeData.overview_md,
      docs_intro_md: storeData.docs_intro_md,
      use_cases_md: storeData.use_cases_md,
    },
  });

  const onSubmit = (values: FormValues) => {
    patch(values);
    onNext();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Overview */}
      <div className="space-y-1.5">
        <Label htmlFor="overview_md">Overview *</Label>
        <Textarea
          id="overview_md"
          placeholder="Describe what this tool does and who it's for. Markdown supported."
          rows={6}
          {...register("overview_md")}
        />
        <div className="flex justify-between">
          {errors.overview_md ? (
            <p className="text-xs text-danger">{errors.overview_md.message}</p>
          ) : (
            <p className="text-xs text-text-muted">Markdown supported</p>
          )}
          <p className="text-xs text-text-subtle">{watch("overview_md")?.length ?? 0} chars</p>
        </div>
      </div>

      {/* Docs intro */}
      <div className="space-y-1.5">
        <Label htmlFor="docs_intro_md">
          Docs intro{" "}
          <span className="text-text-subtle font-normal text-xs">(optional)</span>
        </Label>
        <Textarea
          id="docs_intro_md"
          placeholder="Key concepts, getting-started notes, important caveats…"
          rows={4}
          {...register("docs_intro_md")}
        />
        <p className="text-xs text-text-muted">Appears on the Docs tab. Markdown supported.</p>
      </div>

      {/* Use cases */}
      <div className="space-y-1.5">
        <Label htmlFor="use_cases_md">
          Use cases{" "}
          <span className="text-text-subtle font-normal text-xs">(optional)</span>
        </Label>
        <Textarea
          id="use_cases_md"
          placeholder={USE_CASE_PROMPT}
          rows={5}
          {...register("use_cases_md")}
        />
        <p className="text-xs text-text-muted">
          How do people actually use this? List specific scenarios.
        </p>
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button type="submit">Continue →</Button>
      </div>
    </form>
  );
}
