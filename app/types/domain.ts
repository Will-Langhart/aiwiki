// Domain types derived from SPEC.md §4
// Keep in sync with the DB schema. The auto-generated database.ts
// has raw Supabase shapes; these are the friendlier view-layer types.

export type PricingTier = "free" | "freemium" | "paid" | "enterprise";
export type AudienceFit = "technical" | "non_technical" | "both";
export type ToolStatus = "draft" | "published" | "archived";
export type DraftStatus =
  | "in_progress"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected";
export type ContentSection = "overview" | "docs" | "use_cases";
export type ContentAudience = "technical" | "non_technical" | "both";

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  icon: string | null;
}

export interface Tag {
  id: string;
  slug: string;
  name: string;
}

export interface Tool {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  website_url: string;
  logo_url: string | null;
  primary_category_id: string | null;
  pricing_tier: PricingTier;
  has_free_tier: boolean;
  pricing_starts_at: number | null;
  pricing_currency: string;
  audience_fit: AudienceFit;
  model_provider: string | null;
  open_source: boolean;
  self_hostable: boolean;
  api_available: boolean;
  founded_year: number | null;
  hq_country: string | null;
  hq_city: string | null;
  key_strengths: string[];
  status: ToolStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentBlock {
  id: string;
  tool_id: string;
  section: ContentSection;
  audience: ContentAudience;
  heading: string | null;
  body_md: string;
  sort_order: number;
}

export interface ToolScreenshot {
  id: string;
  tool_id: string;
  storage_path: string;
  alt_text: string | null;
  caption: string | null;
  sort_order: number;
  width: number | null;
  height: number | null;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
}

export interface RatingStats {
  tool_id: string;
  avg_stars: number | null;
  rating_count: number;
}

// Search / directory
export interface ToolSearchResult {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logo_url: string | null;
  primary_category_id: string | null;
  pricing_tier: PricingTier;
  audience_fit: AudienceFit;
  rank: number;
}

export interface SearchFilters {
  q?: string;
  cat?: string | string[];
  pricing?: PricingTier | PricingTier[];
  audience?: AudienceFit;
  api?: boolean;
  oss?: boolean;
}
