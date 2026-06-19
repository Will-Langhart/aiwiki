import { useState } from "react";
import { Outlet, NavLink, useNavigate, useLoaderData } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { MetaDescriptor } from "react-router";
import type { Route } from "./+types/tools.$slug";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase.client";
import { createBuildClient } from "@/lib/supabase.server";
import { ToolHeader } from "@/components/tool/ToolHeader";
import { ToolHero } from "@/components/tool/ToolHero";
import { AudienceToggle } from "@/components/tool/AudienceToggle";
import { BookmarkButton } from "@/components/tool/BookmarkButton";
import { RatingDisplay } from "@/components/tool/RatingDisplay";
import { RatingInput } from "@/components/tool/RatingInput";
import { ReviewsList } from "@/components/tool/ReviewsList";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  baseMeta,
  jsonLd,
  softwareApplicationLd,
  breadcrumbLd,
  plainExcerpt,
} from "@/lib/seo";

interface FullTool {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  website_url: string;
  affiliate_url: string | null;
  logo_url: string | null;
  primary_category_id: string | null;
  pricing_tier: string;
  has_free_tier: boolean;
  pricing_starts_at: number | null;
  pricing_currency: string;
  audience_fit: string;
  model_provider: string | null;
  open_source: boolean;
  self_hostable: boolean;
  api_available: boolean;
  founded_year: number | null;
  hq_country: string | null;
  hq_city: string | null;
  key_strengths: string[];
  status: string;
  published_at: string | null;
}

interface ContentBlock {
  id: string;
  tool_id: string;
  section: string;
  audience: "technical" | "non_technical" | "both";
  heading: string | null;
  body_md: string;
  sort_order: number;
}

interface RatingStats {
  avg_stars: number | null;
  rating_count: number;
}

interface UserRating {
  stars: number;
  review_text: string | null;
}

/** Public, prerenderable data for a tool page (no user-specific fields). */
export interface ToolPublicData {
  tool: FullTool;
  blocks: ContentBlock[];
  categoryName: string | null;
  ratingStats: RatingStats;
}

interface UserToolData {
  isBookmarked: boolean;
  userRating: UserRating | null;
}

// ── Data loading ────────────────────────────────────────────────────────────

/**
 * Public tool data — runs at build time (prerender `loader`) and on client
 * navigations (`clientLoader`). Returns null for unknown/unpublished slugs so
 * the page can render a "not found" state instead of crashing.
 */
async function fetchToolPublicData(
  client: SupabaseClient,
  slug: string,
): Promise<ToolPublicData | null> {
  if (!slug) return null;
  const { data: tool, error } = await client
    .from("tools")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (error || !tool) return null;

  const [{ data: blocks }, { data: category }, { data: ratingStats }] = await Promise.all([
    client.from("content_blocks").select("*").eq("tool_id", tool.id).order("sort_order"),
    tool.primary_category_id
      ? client.from("categories").select("name").eq("id", tool.primary_category_id).single()
      : Promise.resolve({ data: null }),
    client
      .from("tool_rating_stats")
      .select("avg_stars, rating_count")
      .eq("tool_id", tool.id)
      .maybeSingle(),
  ]);

  return {
    tool: tool as FullTool,
    blocks: (blocks as ContentBlock[]) ?? [],
    categoryName: (category as { name: string } | null)?.name ?? null,
    ratingStats: {
      avg_stars: (ratingStats as RatingStats | null)?.avg_stars ?? null,
      rating_count: (ratingStats as RatingStats | null)?.rating_count ?? 0,
    },
  };
}

/** User-specific data (bookmark + own rating) — client-only, never prerendered. */
async function fetchUserToolData(toolId: string, userId: string): Promise<UserToolData> {
  const [{ data: bookmark }, { data: userRating }] = await Promise.all([
    supabase
      .from("bookmarks")
      .select("tool_id")
      .eq("tool_id", toolId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("ratings")
      .select("stars, review_text")
      .eq("tool_id", toolId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  return {
    isBookmarked: !!bookmark,
    userRating: (userRating as UserRating | null) ?? null,
  };
}

// Build-time prerender of every published tool slug (server-only client).
export async function loader({ params }: Route.LoaderArgs) {
  return fetchToolPublicData(createBuildClient(), params.slug ?? "");
}

// Client-side navigations and revalidation (browser client; handles unknown slugs).
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return fetchToolPublicData(supabase, params.slug ?? "");
}

// ── SEO ───────────────────────────────────────────────────────────────────────

type ToolTab = "overview" | "docs" | "use-cases";

/**
 * Shared meta + JSON-LD builder for the tool layout and its tab routes. Child
 * routes pull the parent loader data from `matches` and call this so every tab
 * emits a complete, tab-specific set of head tags.
 */
export function buildToolMeta(data: ToolPublicData | null | undefined, tab: ToolTab): MetaDescriptor[] {
  if (!data) {
    return [{ title: "Tool not found — AI Wiki" }, { name: "robots", content: "noindex, follow" }];
  }

  const { tool, categoryName, ratingStats, blocks } = data;
  const path = tab === "overview" ? `/tools/${tool.slug}` : `/tools/${tool.slug}/${tab}`;

  const overviewExcerpt = plainExcerpt(
    blocks.find((b) => b.section === "overview")?.body_md ?? "",
    110,
  );

  const titleByTab: Record<ToolTab, string> = {
    overview: `${tool.name} — ${tool.tagline} | AI Wiki`,
    docs: `${tool.name} Documentation & Setup Guide | AI Wiki`,
    "use-cases": `${tool.name} Use Cases & Examples | AI Wiki`,
  };

  const descByTab: Record<ToolTab, string> = {
    overview: `${tool.tagline}. ${overviewExcerpt}`.trim().slice(0, 160),
    docs: `How to use ${tool.name}: setup, configuration, and documentation. ${tool.tagline}`.slice(0, 160),
    "use-cases": `Real-world use cases and examples for ${tool.name}. ${tool.tagline}`.slice(0, 160),
  };

  const tags = baseMeta({
    title: titleByTab[tab],
    description: descByTab[tab],
    path,
    image: tool.logo_url ?? undefined,
    type: "article",
  });

  // Structured data: the tool itself + breadcrumb trail.
  tags.push(
    jsonLd(
      softwareApplicationLd({
        name: tool.name,
        slug: tool.slug,
        tagline: tool.tagline,
        description: overviewExcerpt || tool.tagline,
        logo_url: tool.logo_url,
        category: categoryName,
        pricing_tier: tool.pricing_tier,
        has_free_tier: tool.has_free_tier,
        pricing_starts_at: tool.pricing_starts_at,
        pricing_currency: tool.pricing_currency,
        avg_stars: ratingStats.avg_stars,
        rating_count: ratingStats.rating_count,
      }),
    ),
    jsonLd(
      breadcrumbLd([
        { name: "Home", path: "/" },
        { name: "Tools", path: "/tools" },
        ...(categoryName ? [{ name: categoryName, path: "/tools" }] : []),
        { name: tool.name, path: `/tools/${tool.slug}` },
      ]),
    ),
  );

  return tags;
}

export function meta({ data }: Route.MetaArgs) {
  return buildToolMeta(data, "overview");
}

// ── UI ──────────────────────────────────────────────────────────────────────

const TAB_LINKS = [
  { to: "", label: "Overview", end: true },
  { to: "docs", label: "Docs" },
  { to: "use-cases", label: "Use Cases" },
];

export default function ToolLayout() {
  const data = useLoaderData<typeof loader>();
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [ratingOpen, setRatingOpen] = useState(false);

  const slug = data?.tool.slug;

  // User-specific data loads client-side only — never blocks the static content.
  const { data: userData } = useQuery({
    queryKey: ["tool-user", data?.tool.id, user?.id],
    queryFn: () => fetchUserToolData(data?.tool.id ?? "", user?.id ?? ""),
    enabled: !!data?.tool.id && !!user?.id,
    staleTime: 60 * 1000,
  });

  if (!data) {
    return (
      <div className="container py-20 text-center">
        <p className="text-2xl font-bold text-text mb-2">Tool not found</p>
        <p className="text-text-muted text-sm mb-6">
          This tool doesn't exist or hasn't been published yet.
        </p>
        <button
          type="button"
          onClick={() => navigate("/tools")}
          className="text-accent hover:underline text-sm"
        >
          ← Back to directory
        </button>
      </div>
    );
  }

  const { tool, blocks, categoryName, ratingStats } = data;
  const isBookmarked = userData?.isBookmarked ?? false;
  const userRating = userData?.userRating ?? null;
  const queryKey = ["tool-user", tool.id, user?.id];

  return (
    <div className="container py-6 space-y-6 max-w-5xl">
      {/* Breadcrumbs */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/tools">Directory</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {categoryName && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink href="/tools">{categoryName}</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage>{tool.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Tool header */}
      <ToolHeader
        tool={tool}
        bookmarkButton={
          <BookmarkButton
            toolId={tool.id}
            toolSlug={tool.slug}
            userId={user?.id}
            isBookmarked={isBookmarked}
            queryKey={queryKey}
            onAuthRequired={() => navigate("/submit")}
          />
        }
      />

      {/* Hero facts */}
      <ToolHero tool={tool} />

      {/* Rating summary */}
      <RatingDisplay
        avgStars={ratingStats.avg_stars}
        ratingCount={ratingStats.rating_count}
        onRateClick={user ? () => setRatingOpen(true) : undefined}
      />

      {/* Rating dialog */}
      {user && (
        <RatingInput
          toolId={tool.id}
          toolName={tool.name}
          userId={user.id}
          existingRating={userRating ?? undefined}
          queryKey={queryKey}
          open={ratingOpen}
          onOpenChange={setRatingOpen}
        />
      )}

      {/* User reviews */}
      <ReviewsList toolId={tool.id} />

      {/* Tab nav + audience toggle */}
      <div className="flex items-center justify-between border-b border-border pb-0">
        <nav className="flex gap-0" aria-label="Tool sections">
          {TAB_LINKS.map((tab) => (
            <NavLink
              key={tab.label}
              to={tab.to === "" ? `/tools/${slug}` : `/tools/${slug}/${tab.to}`}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                  isActive
                    ? "border-accent text-text"
                    : "border-transparent text-text-muted hover:text-text"
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <AudienceToggle className="mb-2" />
      </div>

      {/* Child route renders here with blocks context */}
      <Outlet context={{ blocks }} />
    </div>
  );
}
