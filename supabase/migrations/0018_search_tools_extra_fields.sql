-- Update search_tools to return self_hostable and model_provider
CREATE OR REPLACE FUNCTION public.search_tools(
  query text DEFAULT NULL,
  cat_slugs text[] DEFAULT NULL,
  pricing_tiers text[] DEFAULT NULL,
  audiences text[] DEFAULT NULL,
  has_api boolean DEFAULT NULL,
  open_source boolean DEFAULT NULL,
  page_size integer DEFAULT 20,
  page_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  tagline text,
  logo_url text,
  primary_category_id uuid,
  pricing_tier text,
  has_free_tier boolean,
  audience_fit text,
  api_available boolean,
  open_source boolean,
  self_hostable boolean,
  model_provider text,
  avg_stars numeric,
  rating_count bigint,
  category_name text,
  category_slug text,
  is_featured boolean,
  github_stars integer,
  pricing_detail text,
  integrations text[],
  traffic_tier text,
  rank real
)
LANGUAGE sql STABLE AS $$
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
    t.self_hostable,
    t.model_provider,
    trs.avg_stars,
    trs.rating_count,
    c.name  AS category_name,
    c.slug  AS category_slug,
    t.is_featured,
    t.github_stars,
    t.pricing_detail,
    t.integrations,
    t.traffic_tier,
    CASE
      WHEN query IS NOT NULL AND query <> ''
        THEN ts_rank(t.search_vector, websearch_to_tsquery('english', query))
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
