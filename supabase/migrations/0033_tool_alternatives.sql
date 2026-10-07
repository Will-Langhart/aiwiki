-- tool_alternatives: ranked alternatives for one tool
--
-- Powers /tools/:slug/alternatives (prerendered for every published tool) and
-- the "Alternatives" block on tool pages. Same columns as search_tools so
-- <ToolCard> renders the rows unchanged, plus pricing_starts_at for the
-- at-a-glance table.
--
-- Score = embedding similarity
--       + 0.12 when the candidate shares the tool's primary category
--       + up to 0.15 popularity, also only within the category (outside it,
--         popularity pulled unrelated big names like GitHub Copilot into
--         Perplexity's list).
-- Excluded: the tool's own company (same apex domain, e.g. platform.openai.com
-- for ChatGPT) and duplicate listings of one product (one row per host).
-- Tools without an embedding fall back to same-category by popularity.

create or replace function public.tool_alternatives(p_slug text, p_limit int default 10)
returns table (
  id uuid,
  slug text,
  name text,
  tagline text,
  logo_url text,
  primary_category_id uuid,
  pricing_tier text,
  has_free_tier boolean,
  pricing_starts_at numeric,
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
  score double precision
)
language sql
stable
as $$
  with src as (
    select t.id, t.embedding, t.primary_category_id,
           regexp_replace(
             split_part(regexp_replace(lower(t.website_url), '^https?://(www\.)?', ''), '/', 1),
             '^.*?([^.]+\.[^.]+)$', '\1'
           ) as apex
    from public.tools t
    where t.slug = p_slug and t.status = 'published'
  ),
  candidates as (
    select t.*,
           split_part(regexp_replace(lower(t.website_url), '^https?://(www\.)?', ''), '/', 1) as host
    from public.tools t
    where t.status = 'published'
  ),
  scored as (
    select distinct on (c.host)
           c.id,
           case
             when s.embedding is not null and c.embedding is not null
               then (1 - (c.embedding <=> s.embedding))
             else 0
           end
           + case
               when c.primary_category_id = s.primary_category_id
                 then 0.12 + 0.15 * coalesce(c.popularity_score, 0) / 100.0
               else 0
             end as score
    from candidates c, src s
    where c.id <> s.id
      and regexp_replace(c.host, '^.*?([^.]+\.[^.]+)$', '\1') <> s.apex
      -- Without embeddings on either side, only same-category tools are comparable.
      and (
        (s.embedding is not null and c.embedding is not null)
        or c.primary_category_id = s.primary_category_id
      )
    order by c.host, 2 desc
  )
  select t.id, t.slug, t.name, t.tagline, t.logo_url, t.primary_category_id,
         t.pricing_tier, t.has_free_tier, t.pricing_starts_at, t.audience_fit,
         t.api_available, t.open_source, t.self_hostable, t.model_provider,
         trs.avg_stars, trs.rating_count, cat.name, cat.slug, t.is_featured,
         t.github_stars, t.pricing_detail, t.integrations, t.traffic_tier,
         sc.score
  from scored sc
  join public.tools t on t.id = sc.id
  left join public.tool_rating_stats trs on trs.tool_id = t.id
  left join public.categories cat on cat.id = t.primary_category_id
  order by sc.score desc, t.name
  limit greatest(1, least(p_limit, 24));
$$;

grant execute on function public.tool_alternatives(text, int) to anon, authenticated;

-- Every published tool's top-N alternative pairs, one call. Used at build time
-- (react-router.config.ts prerender + scripts/generate-sitemap.ts) to
-- prerender the /compare/a-vs-b pages that alternatives pages link to.
-- Pairs come back directional (tool, alternative); callers canonicalize with
-- canonicalCompareSlug() so the sort order matches the compare-summary cache
-- key (JS code-unit order, not the DB collation).
create or replace function public.tool_alternative_pairs(p_per_tool int default 3)
returns table (slug text, alt_slug text)
language sql
stable
as $$
  select t.slug, a.slug
  from public.tools t
  cross join lateral public.tool_alternatives(t.slug, p_per_tool) a
  where t.status = 'published';
$$;

grant execute on function public.tool_alternative_pairs(int) to anon, authenticated;
