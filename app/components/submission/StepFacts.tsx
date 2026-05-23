import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X, Plus } from "lucide-react";
import { useSubmissionStore } from "@/stores/submission";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const schema = z.object({
  pricing_tier: z.enum(["free", "freemium", "paid", "enterprise"]),
  has_free_tier: z.boolean(),
  pricing_starts_at: z.string(),
  audience_fit: z.enum(["technical", "non_technical", "both"]),
  model_provider: z.string(),
  open_source: z.boolean(),
  self_hostable: z.boolean(),
  api_available: z.boolean(),
  founded_year: z.string(),
  hq_country: z.string(),
  hq_city: z.string(),
});

type FormValues = z.infer<typeof schema>;

interface StepFactsProps {
  onNext: () => void;
  onBack: () => void;
}

export function StepFacts({ onNext, onBack }: StepFactsProps) {
  const { data: storeData, patch } = useSubmissionStore();
  const [strengths, setStrengths] = useState<string[]>(storeData.key_strengths);
  const [strengthInput, setStrengthInput] = useState("");

  const { register, handleSubmit, control, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      pricing_tier: storeData.pricing_tier,
      has_free_tier: storeData.has_free_tier,
      pricing_starts_at: storeData.pricing_starts_at?.toString() ?? "",
      audience_fit: storeData.audience_fit,
      model_provider: storeData.model_provider,
      open_source: storeData.open_source,
      self_hostable: storeData.self_hostable,
      api_available: storeData.api_available,
      founded_year: storeData.founded_year,
      hq_country: storeData.hq_country,
      hq_city: storeData.hq_city,
    },
  });

  const pricingTier = watch("pricing_tier");

  const addStrength = () => {
    const v = strengthInput.trim();
    if (v && strengths.length < 5 && !strengths.includes(v)) {
      setStrengths([...strengths, v]);
      setStrengthInput("");
    }
  };

  const removeStrength = (i: number) => {
    setStrengths(strengths.filter((_, idx) => idx !== i));
  };

  const onSubmit = (values: FormValues) => {
    patch({
      pricing_tier: values.pricing_tier,
      has_free_tier: values.has_free_tier,
      pricing_starts_at: values.pricing_starts_at ? Number(values.pricing_starts_at) : null,
      audience_fit: values.audience_fit,
      model_provider: values.model_provider,
      open_source: values.open_source,
      self_hostable: values.self_hostable,
      api_available: values.api_available,
      founded_year: values.founded_year,
      hq_country: values.hq_country,
      hq_city: values.hq_city,
      key_strengths: strengths,
    });
    onNext();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Pricing tier */}
      <div className="space-y-2">
        <Label>Pricing tier *</Label>
        <div className="flex flex-wrap gap-2">
          {(["free", "freemium", "paid", "enterprise"] as const).map((tier) => (
            <label key={tier} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" value={tier} {...register("pricing_tier")} className="sr-only peer" />
              <span className="px-3 py-1.5 rounded-lg border border-border text-sm transition-colors peer-checked:border-accent peer-checked:bg-accent/10 peer-checked:text-accent capitalize">
                {tier}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Price starts at */}
      {(pricingTier === "paid" || pricingTier === "enterprise") && (
        <div className="space-y-1.5">
          <Label htmlFor="pricing_starts_at">Starting price (USD/mo, optional)</Label>
          <Input
            id="pricing_starts_at"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 20"
            {...register("pricing_starts_at")}
          />
        </div>
      )}

      {/* Audience fit */}
      <div className="space-y-2">
        <Label>Audience *</Label>
        <div className="flex flex-wrap gap-2">
          {(["technical", "non_technical", "both"] as const).map((aud) => (
            <label key={aud} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" value={aud} {...register("audience_fit")} className="sr-only peer" />
              <span className="px-3 py-1.5 rounded-lg border border-border text-sm transition-colors peer-checked:border-accent peer-checked:bg-accent/10 peer-checked:text-accent">
                {aud === "non_technical" ? "Non-technical" : aud === "both" ? "All audiences" : "Technical"}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Boolean toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(
          [
            { field: "has_free_tier" as const, label: "Has free tier" },
            { field: "open_source" as const, label: "Open source" },
            { field: "self_hostable" as const, label: "Self-hostable" },
            { field: "api_available" as const, label: "API available" },
          ] as const
        ).map(({ field, label }) => (
          <div key={field} className="flex items-center justify-between p-3 rounded-lg border border-border">
            <span className="text-sm text-text">{label}</span>
            <Controller
              control={control}
              name={field}
              render={({ field: f }) => (
                <Switch checked={f.value} onCheckedChange={f.onChange} />
              )}
            />
          </div>
        ))}
      </div>

      {/* Model provider */}
      <div className="space-y-1.5">
        <Label htmlFor="model_provider">
          AI model provider{" "}
          <span className="text-text-subtle font-normal text-xs">(optional)</span>
        </Label>
        <Input id="model_provider" placeholder="e.g. OpenAI, Anthropic, Google" {...register("model_provider")} />
      </div>

      {/* Key strengths */}
      <div className="space-y-2">
        <Label>Key strengths (up to 5)</Label>
        <div className="flex gap-2">
          <Input
            value={strengthInput}
            onChange={(e) => setStrengthInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStrength(); } }}
            placeholder="e.g. Fast response times"
            disabled={strengths.length >= 5}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={addStrength}
            disabled={strengths.length >= 5 || !strengthInput.trim()}
          >
            <Plus size={14} />
          </Button>
        </div>
        {strengths.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {strengths.map((s, i) => (
              <span
                key={s}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 text-accent text-xs"
              >
                {s}
                <button type="button" onClick={() => removeStrength(i)} className="hover:text-danger">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Founded / HQ */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="founded_year">Founded</Label>
          <Input id="founded_year" type="number" min="1990" max="2030" placeholder="2022" {...register("founded_year")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hq_country">Country</Label>
          <Input id="hq_country" placeholder="USA" {...register("hq_country")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hq_city">City</Label>
          <Input id="hq_city" placeholder="San Francisco" {...register("hq_city")} />
        </div>
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
