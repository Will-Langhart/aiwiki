import { useState } from "react";
import { Outlet, useParams, NavLink, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "./+types/tools.$slug";
import { supabase } from "@/lib/supabase.client";
import { ToolHeader } from "@/components/tool/ToolHeader";
import { ToolHero } from "@/components/tool/ToolHero";
import { AudienceToggle } from "@/components/tool/AudienceToggle";
import { BookmarkButton } from "@/components/tool/BookmarkButton";
import { RatingDisplay } from "@/components/tool/RatingDisplay";
import { RatingInput } from "@/components/tool/RatingInput";
import { ReviewsList } from "@/components/tool/ReviewsList";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function meta({ params }: Route.MetaArgs) {
  return [
    { title: `${params.slug} — AI Wiki` },
  ];
}

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

interface ToolData {
  tool: FullTool;
  blocks: ContentBlock[];
  categoryName: string | null;
  isBookmarked: boolean;
  ratingStats: RatingStats;
  userRating: UserRating | null;
}

async function fetchToolData(slug: string, userId?: string): Promise<ToolData | null> {
  const { data: tool, error } = await supabase
    .from("tools")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (error || !tool) return null;

  const [{ data: blocks }, { data: category }, { data: bookmark }, { data: ratingStats }, { data: userRating }] = await Promise.all([
    supabase
      .from("content_blocks")
      .select("*")
      .eq("tool_id", tool.id)
      .order("sort_order"),
    tool.primary_category_id
      ? supabase
          .from("categories")
          .select("name")
          .eq("id", tool.primary_category_id)
          .single()
      : Promise.resolve({ data: null }),
    userId
      ? supabase
          .from("bookmarks")
          .select("tool_id")
          .eq("tool_id", tool.id)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("tool_rating_stats")
      .select("avg_stars, rating_count")
      .eq("tool_id", tool.id)
      .maybeSingle(),
    userId
      ? supabase
          .from("ratings")
          .select("stars, review_text")
          .eq("tool_id", tool.id)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    tool: tool as FullTool,
    blocks: (blocks as ContentBlock[]) ?? [],
    categoryName: (category as { name: string } | null)?.name ?? null,
    isBookmarked: !!bookmark,
    ratingStats: {
      avg_stars: (ratingStats as RatingStats | null)?.avg_stars ?? null,
      rating_count: (ratingStats as RatingStats | null)?.rating_count ?? 0,
    },
    userRating: (userRating as UserRating | null) ?? null,
  };
}

const TAB_LINKS = [
  { to: "", label: "Overview", end: true },
  { to: "docs", label: "Docs" },
  { to: "use-cases", label: "Use Cases" },
];

function ToolLayoutSkeleton() {
  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-start gap-4">
        <Skeleton className="w-16 h-16 rounded-2xl" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
      </div>
      <Skeleton className="h-32 rounded-xl" />
      <div className="flex gap-4">
        {TAB_LINKS.map((t) => (
          <Skeleton key={t.label} className="h-8 w-20 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export default function ToolLayout() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [ratingOpen, setRatingOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["tool", slug, user?.id],
    queryFn: () => fetchToolData(slug ?? "", user?.id),
    enabled: !!slug,
    staleTime: 60 * 1000,
  });

  if (isLoading) return <ToolLayoutSkeleton />;

  if (!data) {
    return (
      <div className="container py-20 text-center">
        <p className="text-2xl font-bold text-text mb-2">Tool not found</p>
        <p className="text-text-muted text-sm mb-6">
          The tool "{slug}" doesn't exist or hasn't been published yet.
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

  const { tool, blocks, categoryName, isBookmarked, ratingStats, userRating } = data;
  const queryKey = ["tool", slug, user?.id];

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
