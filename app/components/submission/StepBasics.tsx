import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Wand2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase.client";
import { useSubmissionStore } from "@/stores/submission";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { User } from "@supabase/supabase-js";

const schema = z.object({
  website_url: z.string().url("Must be a valid URL"),
  name: z.string().min(2, "At least 2 characters").max(60, "Max 60 characters"),
  tagline: z.string().min(10, "At least 10 characters").max(140, "Max 140 characters"),
  primary_category_id: z.string().min(1, "Select a category"),
});

type FormValues = z.infer<typeof schema>;

interface StepBasicsProps {
  user: User;
  onNext: () => void;
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function StepBasics({ user, onNext }: StepBasicsProps) {
  const { data: storeData, patch } = useSubmissionStore();
  const [autofilling, setAutofilling] = useState(false);
  const [autofillError, setAutofillError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      website_url: storeData.website_url,
      name: storeData.name,
      tagline: storeData.tagline,
      primary_category_id: storeData.primary_category_id,
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name").order("sort_order");
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const nameValue = watch("name");

  // Auto-derive slug from name
  useEffect(() => {
    if (nameValue) {
      patch({ slug: slugify(nameValue) });
    }
  }, [nameValue, patch]);

  const handleAutofill = async () => {
    const url = watch("website_url");
    if (!url) return;
    setAutofilling(true);
    setAutofillError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/url-to-draft`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ url }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setAutofillError(json.error ?? "Autofill failed");
        return;
      }
      const d = json.data as Record<string, unknown>;
      if (d.name) setValue("name", String(d.name));
      if (d.tagline) setValue("tagline", String(d.tagline));
      if (d.overview_md) patch({ overview_md: String(d.overview_md) });
      if (d.pricing_tier) patch({ pricing_tier: d.pricing_tier as "free" | "freemium" | "paid" | "enterprise" });
      if (typeof d.has_free_tier === "boolean") patch({ has_free_tier: d.has_free_tier });
      if (typeof d.open_source === "boolean") patch({ open_source: d.open_source });
      if (typeof d.api_available === "boolean") patch({ api_available: d.api_available });
      if (d.audience_fit) patch({ audience_fit: d.audience_fit as "technical" | "non_technical" | "both" });
      if (Array.isArray(d.key_strengths)) patch({ key_strengths: d.key_strengths as string[] });
    } catch {
      setAutofillError("Network error — please try again");
    } finally {
      setAutofilling(false);
    }
  };

  const onSubmit = (values: FormValues) => {
    patch(values);
    onNext();
  };

  // Suppress unused import warning
  void user;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Website URL + Autofill */}
      <div className="space-y-1.5">
        <Label htmlFor="website_url">Website URL *</Label>
        <div className="flex gap-2">
          <Input
            id="website_url"
            type="url"
            placeholder="https://example.com"
            className="flex-1"
            {...register("website_url")}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAutofill}
            disabled={autofilling}
          >
            {autofilling ? (
              <Loader2 size={14} className="animate-spin mr-1.5" />
            ) : (
              <Wand2 size={14} className="mr-1.5" />
            )}
            Autofill
          </Button>
        </div>
        {errors.website_url && (
          <p className="text-xs text-danger">{errors.website_url.message}</p>
        )}
        {autofillError && <p className="text-xs text-danger">{autofillError}</p>}
        <p className="text-xs text-text-muted">
          Paste the tool&apos;s homepage URL. Click Autofill to pre-fill from the page.
        </p>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="name">Tool name *</Label>
        <Input id="name" placeholder="e.g. ChatGPT" {...register("name")} />
        {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
      </div>

      {/* Tagline */}
      <div className="space-y-1.5">
        <Label htmlFor="tagline">Tagline *</Label>
        <Input
          id="tagline"
          placeholder="One sentence that describes what it does"
          {...register("tagline")}
        />
        <div className="flex justify-between">
          {errors.tagline ? (
            <p className="text-xs text-danger">{errors.tagline.message}</p>
          ) : (
            <span />
          )}
          <p className="text-xs text-text-subtle">{watch("tagline")?.length ?? 0}/140</p>
        </div>
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <Label htmlFor="primary_category_id">Primary category *</Label>
        <select
          id="primary_category_id"
          {...register("primary_category_id")}
          className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Select a category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.primary_category_id && (
          <p className="text-xs text-danger">{errors.primary_category_id.message}</p>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit">Continue →</Button>
      </div>
    </form>
  );
}
