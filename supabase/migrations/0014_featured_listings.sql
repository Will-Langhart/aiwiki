-- Migration 0014: Featured listings for monetization
-- is_featured + featured_order allow promoted placement in the tool directory.
-- featured_until supports time-limited sponsorships (NULL = no expiry).

ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS is_featured    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_order integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS featured_until timestamptz;

-- Partial index: fast lookup of active featured tools
CREATE INDEX IF NOT EXISTS tools_featured_idx
  ON public.tools (featured_order, published_at DESC)
  WHERE is_featured = true AND status = 'published';

-- Update search_tools to surface featured tools first when no keyword query
CREATE OR REPLACE FUNCTION public.search_tools(
  query          text    DEFAULT NULL,
  cat_slugs      text[]  DEFAULT NULL,
  pricing_tiers  text[]  DEFAULT NULL,
  audiences      text[]  DEFAULT NULL,
  has_api        boolean DEFAULT NULL,
  open_source    boolean DEFAULT NULL,
  page_size      integer DEFAULT 20,
  page_offset    integer DEFAULT 0
)
RETURNS TABLE (
  id                    uuid,
  slug                  text,
  name                  text,
  tagline               text,
  logo_url              text,
  primary_category_id   uuid,
  pricing_tier          text,
  has_free_tier         boolean,
  audience_fit          text,
  api_available         boolean,
  open_source           boolean,
  avg_stars             numeric,
  rating_count          bigint,
  category_name         text,
  category_slug         text,
  is_featured           boolean,
  rank                  real
)
LANGUAGE sql STABLE
AS $$
  SELECT
    t.id,
    t.slug,
    t.name,
    t.tagline,
    t.logo_url,
    t.primary_category_id,
    t.pricing_tier,
    t.has_free_tier,
    t.audience_fit,
    t.api_available,
    t.open_source,
    trs.avg_stars,
    trs.rating_count,
    c.name  AS category_name,
    c.slug  AS category_slug,
    t.is_featured,
    -- Featured + unexpired tools always rank highest (100000 + their order)
    CASE
      WHEN t.is_featured AND (t.featured_until IS NULL OR t.featured_until > now())
        THEN 100000 - t.featured_order
      WHEN query IS NOT NULL AND query <> ''
        THEN ts_rank(t.search_vector, websearch_to_tsquery('english', query))::real * 1000
      ELSE t.popularity_score::real
    END AS rank
  FROM public.tools t
  LEFT JOIN public.tool_rating_stats trs ON trs.tool_id = t.id
  LEFT JOIN public.categories c ON c.id = t.primary_category_id
  WHERE
    t.status = 'published'
    AND (query IS NULL OR query = '' OR t.search_vector @@ websearch_to_tsquery('english', query))
    AND (cat_slugs IS NULL OR c.slug = ANY(cat_slugs))
    AND (pricing_tiers IS NULL OR t.pricing_tier = ANY(pricing_tiers))
    AND (audiences IS NULL OR t.audience_fit = ANY(audiences))
    AND (has_api IS NULL OR t.api_available = has_api)
    AND (open_source IS NULL OR t.open_source = open_source)
  ORDER BY rank DESC NULLS LAST, t.name ASC
  LIMIT page_size
  OFFSET page_offset
$$;
