import { ToolCard } from "@/components/tool/ToolCard";
import { type RankedAlternative, fetchAlternativesPageData } from "@/lib/alternatives";
import { canonicalCompareSlug } from "@/lib/compare-data";
import { ALTERNATIVE_COMPARE_LINKS } from "@/lib/compare-paths";
import { baseMeta, breadcrumbLd, itemListLd, jsonLd } from "@/lib/seo";
import { supabase } from "@/lib/supabase.client";
import { createBuildClient } from "@/lib/supabase.server";
import { ArrowLeft, ArrowRight, Check, GitCompare, Minus } from "lucide-react";
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/tools.$slug.alternatives";

// Build-time prerender of every published tool (see react-router.config.ts).
export async function loader({ params }: Route.LoaderArgs) {
  return fetchAlternativesPageData(createBuildClient(), params.slug ?? "");
}

// Client-side navigations + slugs that weren't prerendered.
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return fetchAlternativesPageData(supabase, params.slug ?? "");
}

const YEAR = new Date().getFullYear();

const PRICING_LABEL: Record<string, string> = {
  free: "Free",
  freemium: "Freemium",
  paid: "Paid",
  enterprise: "Enterprise",
};

function priceText(t: { pricing_tier: string; pricing_starts_at: number | null }): string {
  const tier = PRICING_LABEL[t.pricing_tier] ?? t.pricing_tier;
  return t.pricing_starts_at ? `${tier} · from $${t.pricing_starts_at}/mo` : tier;
}

function isFree(t: { pricing_tier: string; has_free_tier?: boolean }): boolean {
  return t.pricing_tier === "free" || t.pricing_tier === "freemium" || !!t.has_free_tier;
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) {
    return [
      { title: "Alternatives not found — AI Wiki" },
      { name: "robots", content: "noindex, follow" },
    ];
  }
  const { tool, alternatives, category } = data;
  const top = alternatives
    .slice(0, 3)
    .map((a) => a.name)
    .join(", ");
  const tags = baseMeta({
    title: `Best ${tool.name} Alternatives (${YEAR}) — ${alternatives.length} Similar Tools | AI Wiki`,
    description:
      `Looking for a ${tool.name} alternative? Compare ${top} and more on pricing, free tiers, API access, and open source.`.slice(
        0,
        160,
      ),
    path: `/tools/${tool.slug}/alternatives`,
    image: tool.logo_url ?? undefined,
    type: "article",
  });
  tags.push(
    jsonLd({ ...itemListLd(alternatives), name: `${tool.name} alternatives` }),
    jsonLd(
      breadcrumbLd([
        { name: "Home", path: "/" },
        { name: "Tools", path: "/tools" },
        ...(category ? [{ name: category.name, path: `/categories/${category.slug}` }] : []),
        { name: tool.name, path: `/tools/${tool.slug}` },
        { name: "Alternatives", path: `/tools/${tool.slug}/alternatives` },
      ]),
    ),
  );
  return tags;
}

function Yes({ on }: { on: boolean }) {
  return on ? (
    <Check size={15} className="text-accent" aria-label="Yes" />
  ) : (
    <Minus size={15} className="text-text-subtle" aria-label="No" />
  );
}

export default function ToolAlternativesPage() {
  const data = useLoaderData<typeof loader>();

  if (!data) {
    return (
      <div className="container py-16 text-center">
        <h1 className="text-2xl font-bold text-text mb-2">No alternatives found</h1>
        <p className="text-text-muted mb-6">
          This tool doesn't exist or has no listed alternatives yet.
        </p>
        <Link to="/tools" className="text-accent hover:underline">
          Browse all tools
        </Link>
      </div>
    );
  }

  const { tool, category, alternatives } = data;
  const free = alternatives.filter(isFree);
  const rows: Array<RankedAlternative | (typeof tool & { isSelf: true })> = [
    { ...tool, isSelf: true as const },
    ...alternatives,
  ];

  return (
    <div className="container py-[var(--space-section,2.5rem)] max-w-5xl">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-5 text-xs text-text-subtle">
        <Link
          to={`/tools/${tool.slug}`}
          className="inline-flex items-center gap-1 hover:text-text transition-colors"
        >
          <ArrowLeft size={12} /> {tool.name}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-text-muted">Alternatives</span>
      </nav>

      {/* Header */}
      <header className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 sm:p-8 mb-[var(--space-section,2.5rem)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full opacity-[0.12] blur-3xl"
          style={{ background: "var(--accent)" }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          {tool.logo_url && (
            <img
              src={tool.logo_url}
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 flex-shrink-0 rounded-2xl border border-border bg-bg object-contain p-2"
            />
          )}
          <div className="min-w-0 flex-1">
            <span className="section-eyebrow">Alternatives</span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text">
              Best {tool.name} alternatives
            </h1>
            <p className="mt-1.5 text-sm sm:text-base text-text-muted max-w-2xl">
              {alternatives.length} tools similar to{" "}
              <Link to={`/tools/${tool.slug}`} className="text-accent hover:underline">
                {tool.name}
              </Link>
              , ranked by how closely they match what it does
              {category ? ` among ${category.name.toLowerCase()}` : ""}.
              {free.length > 0 &&
                (free.length === alternatives.length
                  ? ` All ${free.length} have a free option.`
                  : ` ${free.length} have a free option.`)}
            </p>
          </div>
        </div>
      </header>

      {/* At a glance — plain table so the facts are in the prerendered HTML */}
      <section aria-labelledby="glance" className="mb-[var(--space-section,2.5rem)]">
        <h2 id="glance" className="text-lg font-bold text-text mb-3">
          {tool.name} alternatives at a glance
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface text-left text-[11px] uppercase tracking-wide text-text-subtle">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Tool
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Pricing
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium text-center">
                  Free option
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium text-center">
                  API
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium text-center">
                  Open source
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  <span className="sr-only">Compare</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((t, i) => {
                const self = "isSelf" in t;
                return (
                  <tr key={t.slug} className={self ? "bg-accent/5" : undefined}>
                    <th scope="row" className="px-4 py-2.5 text-left font-medium text-text">
                      <Link to={`/tools/${t.slug}`} className="hover:text-accent">
                        {t.name}
                      </Link>
                      {self && (
                        <span className="ml-2 text-[11px] font-normal text-text-subtle">
                          (this tool)
                        </span>
                      )}
                    </th>
                    <td className="px-4 py-2.5 text-text-muted whitespace-nowrap">
                      {priceText(t)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex justify-center">
                        <Yes on={isFree(t)} />
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex justify-center">
                        <Yes on={!!t.api_available} />
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex justify-center">
                        <Yes on={!!t.open_source} />
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {!self && i <= ALTERNATIVE_COMPARE_LINKS && (
                        <Link
                          to={`/compare/${canonicalCompareSlug([tool.slug, t.slug])}`}
                          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <GitCompare size={12} /> vs {tool.name}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cards */}
      <section aria-labelledby="all-alts" className="mb-[var(--space-section,2.5rem)]">
        <h2 id="all-alts" className="text-lg font-bold text-text mb-3">
          Top {alternatives.length} alternatives to {tool.name}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--space-element,1rem)]">
          {alternatives.map((t) => (
            <ToolCard key={t.id} tool={t} dense />
          ))}
        </div>
      </section>

      {free.length > 0 && (
        <section aria-labelledby="free-alts" className="mb-[var(--space-section,2.5rem)]">
          <h2 id="free-alts" className="text-lg font-bold text-text mb-3">
            Free {tool.name} alternatives
          </h2>
          <ul className="flex flex-wrap gap-2">
            {free.map((t) => (
              <li key={t.slug}>
                <Link
                  to={`/tools/${t.slug}`}
                  className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text hover:border-accent/30 transition-colors"
                >
                  {t.name}{" "}
                  <span className="ml-1.5 text-text-subtle">
                    {PRICING_LABEL[t.pricing_tier] ?? t.pricing_tier}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          to={`/tools/${tool.slug}`}
          className="group flex flex-1 items-center justify-between rounded-xl border border-border bg-surface px-5 py-4 hover:border-accent/30 transition-colors"
        >
          <span className="text-sm text-text">
            Read the full <span className="font-semibold">{tool.name}</span> guide
          </span>
          <ArrowRight
            size={16}
            className="text-text-subtle group-hover:text-accent transition-colors"
          />
        </Link>
        {category && (
          <Link
            to={`/categories/${category.slug}`}
            className="group flex flex-1 items-center justify-between rounded-xl border border-border bg-surface px-5 py-4 hover:border-accent/30 transition-colors"
          >
            <span className="text-sm text-text">
              Browse all <span className="font-semibold">{category.name.toLowerCase()}</span> tools
            </span>
            <ArrowRight
              size={16}
              className="text-text-subtle group-hover:text-accent transition-colors"
            />
          </Link>
        )}
      </div>
    </div>
  );
}
