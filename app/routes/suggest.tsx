import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import type { Route } from "./+types/suggest";
import { supabase } from "@/lib/supabase.client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Suggest an AI Tool — AI Wiki" },
    {
      name: "description",
      content:
        "Know an AI tool that should be in our directory? Submit it here — no account required.",
    },
  ];
}

interface Category {
  slug: string;
  name: string;
}

async function fetchCategories(): Promise<Category[]> {
  const { data } = await supabase
    .from("categories")
    .select("slug, name")
    .order("name");
  return data ?? [];
}

export default function SuggestPage() {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 10 * 60 * 1000,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setSubmitting(true);
    setError(null);

    const { error: err } = await supabase.from("tool_suggestions").insert({
      website_url: url.trim(),
      category_slug: category || null,
      contact_email: email.trim() || null,
      notes: notes.trim() || null,
    });

    setSubmitting(false);

    if (err) {
      setError("Something went wrong. Please try again.");
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="container py-20 max-w-md text-center">
        <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-4" />
        <h1 className="text-xl font-bold text-text mb-2">Thanks for the suggestion!</h1>
        <p className="text-text-muted text-sm leading-relaxed">
          We review every submission. If it's a good fit, it'll be added to the
          directory and enriched with AI-generated details.
        </p>
      </div>
    );
  }

  return (
    <div className="container py-10 max-w-lg">
      {/* Header */}
      <div className="mb-8 relative">
        <div
          className="absolute -left-6 top-0 w-72 h-20 pointer-events-none opacity-[0.15]"
          style={{
            background:
              "radial-gradient(ellipse at left top, var(--accent), transparent 65%)",
          }}
        />
        <h1 className="text-2xl sm:text-3xl font-bold text-text tracking-tight relative">
          Suggest an AI Tool
        </h1>
        <p className="text-text-muted mt-1.5 relative text-sm">
          No account needed. We review every submission.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* URL */}
        <div className="space-y-1.5">
          <Label htmlFor="url" className="text-sm font-medium text-text">
            Tool website <span className="text-red-500">*</span>
          </Label>
          <Input
            id="url"
            type="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            className="bg-surface border-border focus:border-accent/50"
          />
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <Label htmlFor="category" className="text-sm font-medium text-text">
            Category
          </Label>
          <Select value={category} onValueChange={(v) => setCategory(v ?? "")}>
            <SelectTrigger className="bg-surface border-border focus:border-accent/50">
              <SelectValue placeholder="Select a category (optional)" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.slug} value={cat.slug}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-sm font-medium text-text">
            Your email{" "}
            <span className="text-text-subtle font-normal">(optional)</span>
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-surface border-border focus:border-accent/50"
          />
          <p className="text-xs text-text-subtle">
            We'll notify you if the tool gets added.
          </p>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="notes" className="text-sm font-medium text-text">
            Notes{" "}
            <span className="text-text-subtle font-normal">(optional)</span>
          </Label>
          <Textarea
            id="notes"
            placeholder="Why should this tool be listed? Any context helps."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="bg-surface border-border focus:border-accent/50 resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        <Button
          type="submit"
          disabled={submitting || !url.trim()}
          className="w-full"
        >
          {submitting ? "Submitting…" : "Submit tool"}
        </Button>
      </form>
    </div>
  );
}
