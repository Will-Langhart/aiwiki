import { Link } from "react-router";
import { ArrowRight, BadgeCheck, GitCompare } from "lucide-react";
import { ToolCard } from "@/components/tool/ToolCard";

export interface AlternativeTool {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logo_url: string | null;
  pricing_tier: string;
  pricing_detail?: string | null;
  has_free_tier?: boolean;
  audience_fit: string;
  api_available?: boolean;
  open_source?: boolean;
  self_hostable?: boolean | null;
  model_provider?: string | null;
  avg_stars?: number | null;
  rating_count?: number | null;
  category_name?: string | null;
  category_slug?: string | null;
  github_stars?: number | null;
  integrations?: string[] | null;
  traffic_tier?: string | null;
}

interface ToolNextStepsProps {
  tool: { slug: string; name: string };
  category: { slug: string; name: string } | null;
  categoryCount: number;
  alternatives: AlternativeTool[];
  /** Hide the maker CTA once a maker has verified the listing. */
  isClaimed?: boolean;
}

/**
 * Bottom-of-page "where next" for tool pages — most visitors land here from
 * search and leave after one page (74% bounce). Alternatives, head-to-head
 * compares and the category page give them a next click. Rendered from loader
 * data, so it's in the prerendered HTML as internal links too.
 */
export function ToolNextSteps({ tool, category, categoryCount, alternatives, isClaimed = false }: ToolNextStepsProps) {
  if (alternatives.length === 0 && !category) return null;
  const compares = alternatives.slice(0, 3);

  return (
    <section aria-labelledby="next-steps" className="space-y-5 border-t border-border pt-8">
      {alternatives.length > 0 && (
        <div>
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <span className="section-eyebrow">Alternatives</span>
              <h2 id="next-steps" className="text-lg font-bold text-text">
                Alternatives to {tool.name}
              </h2>
            </div>
            {category && (
              <Link
                to={`/categories/${category.slug}`}
                className="hidden sm:inline-flex items-center gap-1 text-sm text-accent hover:underline flex-shrink-0"
              >
                All {categoryCount} {category.name.toLowerCase()} tools <ArrowRight size={13} />
              </Link>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {alternatives.map((t) => (
              <ToolCard key={t.id} tool={t} dense />
            ))}
          </div>
        </div>
      )}

      {compares.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-subtle mr-1">Compare head-to-head:</span>
          {compares.map((alt) => (
            <Link
              key={alt.slug}
              to={`/compare?tools=${tool.slug},${alt.slug}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text hover:border-accent/30 transition-colors"
            >
              <GitCompare size={12} className="text-accent" />
              {tool.name} vs {alt.name}
            </Link>
          ))}
        </div>
      )}

      {category && (
        <Link
          to={`/categories/${category.slug}`}
          className="group flex items-center justify-between rounded-xl border border-border bg-surface px-5 py-4 hover:border-accent/30 transition-colors"
        >
          <span className="text-sm text-text">
            Browse all <span className="font-semibold">{categoryCount}</span>{" "}
            {category.name.toLowerCase()} tools
          </span>
          <ArrowRight
            size={16}
            className="text-text-subtle group-hover:text-accent transition-colors"
          />
        </Link>
      )}
      {!isClaimed && (
        <p className="flex items-center gap-1.5 text-xs text-text-subtle">
          <BadgeCheck size={13} className="text-accent" />
          Is {tool.name} yours?{" "}
          <Link to={`/claim/${tool.slug}`} className="text-accent hover:underline">
            Claim the listing &amp; get the badge
          </Link>
        </p>
      )}
    </section>
  );
}
