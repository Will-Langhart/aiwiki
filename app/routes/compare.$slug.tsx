import { Link } from "react-router";
import type { Route } from "./+types/compare.$slug";
import { supabase } from "@/lib/supabase.client";
import { createBuildClient } from "@/lib/supabase.server";
import { fetchComparePageData } from "@/lib/compare-data";
import { CompareTable } from "@/components/compare/CompareTable";
import { CompareSummary } from "@/components/compare/CompareSummary";
import { MarkdownRenderer } from "@/components/tool/MarkdownRenderer";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GitCompare, Sparkles, SlidersHorizontal } from "lucide-react";
import { baseMeta, jsonLd, breadcrumbLd, absoluteUrl } from "@/lib/seo";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

// Build-time prerender of popular combos (see react-router.config.ts).
export async function loader({ params }: Route.LoaderArgs) {
  return fetchComparePageData(createBuildClient(), params.slug ?? "");
}

// Client-side navigations + combos that weren't prerendered.
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return fetchComparePageData(supabase, params.slug ?? "");
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) {
    return [
      { title: "Comparison not found — AI Wiki" },
      { name: "robots", content: "noindex, follow" },
    ];
  }

  const { tools, canonicalSlug } = data;
  const names = tools.map((t) => t.name);
  const versus = names.join(" vs ");
  const taglines = tools
    .map((t) => `${t.name}: ${t.tagline}`)
    .join(" · ");

  const tags = baseMeta({
    title: `${versus} — AI Tool Comparison | AI Wiki`,
    description: `${versus} compared side-by-side: pricing, features, API access, and more. ${taglines}`.slice(0, 160),
    path: `/compare/${canonicalSlug}`,
    image: tools[0]?.logo_url ?? undefined,
    type: "article",
  });

  tags.push(
    jsonLd({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${versus} comparison`,
      itemListElement: tools.map((t, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: t.name,
        url: absoluteUrl(`/tools/${t.slug}`),
      })),
    }),
    jsonLd(
      breadcrumbLd([
        { name: "Home", path: "/" },
        { name: "Compare", path: "/compare" },
        { name: versus, path: `/compare/${canonicalSlug}` },
      ]),
    ),
  );

  return tags;
}

export default function CompareStaticPage({ loaderData }: Route.ComponentProps) {
  if (!loaderData) {
    return (
      <div className="container py-20 text-center">
        <p className="text-2xl font-bold text-text mb-2">Comparison not found</p>
        <p className="text-text-muted text-sm mb-6">
          One or more of these tools doesn't exist or isn't published yet.
        </p>
        <Link to="/compare" className="text-accent hover:underline text-sm">
          ← Build your own comparison
        </Link>
      </div>
    );
  }

  const { tools, aiSummary, canonicalSlug } = loaderData;
  const versus = tools.map((t) => t.name).join(" vs ");
  const interactiveHref = `/compare?tools=${tools.map((t) => t.slug).join(",")}`;

  return (
    <div className="container py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <GitCompare size={20} className="text-accent" />
          <h1 className="text-2xl font-bold text-text">{versus}</h1>
        </div>
        <p className="text-text-muted text-sm">
          Side-by-side comparison of{" "}
          {tools.map((t, i) => (
            <span key={t.slug}>
              {i > 0 && (i === tools.length - 1 ? " and " : ", ")}
              <Link to={`/tools/${t.slug}`} className="text-accent hover:underline">
                {t.name}
              </Link>
            </span>
          ))}
          : pricing, features, API access, and community ratings.
        </p>
      </div>

      {/* AI summary — cached copy renders statically for crawlers; fall back
          to the streaming component when no summary has been generated yet. */}
      {aiSummary ? (
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-text mb-3">
            <Sparkles size={15} className="text-accent" />
            AI comparison summary
          </div>
          <div className="text-sm text-text leading-relaxed prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer content={aiSummary} />
          </div>
        </div>
      ) : (
        <CompareSummary
          toolSlugs={tools.map((t) => t.slug)}
          supabaseUrl={SUPABASE_URL}
        />
      )}

      <CompareTable tools={tools} />

      {/* Customize CTA → interactive compare */}
      <div className="mt-8 flex justify-center">
        <Link
          to={interactiveHref}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          <SlidersHorizontal size={15} className="mr-1.5" />
          Customize this comparison
        </Link>
      </div>
    </div>
  );
}
