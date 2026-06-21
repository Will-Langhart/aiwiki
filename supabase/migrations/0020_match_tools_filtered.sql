-- match_tools_filtered: ANN vector search with optional metadata filters.
-- Backs the agentic `search_tools` tool in the chat Edge Function — lets the
-- model apply hard pricing/audience constraints that pure semantic search can't.
-- Same shape as match_tools (0011) plus three nullable filter args.

create or replace function public.match_tools_filtered(
  query_embedding       vector(1536),
  match_threshold       float   default 0.3,
  match_count           int     default 8,
  filter_pricing_tier   text    default null,
  filter_has_free_tier  boolean default null,
  filter_audience_fit   text    default null
)
returns table (
  id                    uuid,
  slug                  text,
  name                  text,
  tagline               text,
  logo_url              text,
  primary_category_id   uuid,
  pricing_tier          text,
  audience_fit          text,
  has_free_tier         boolean,
  api_available         boolean,
  open_source           boolean,
  similarity            float
)
language sql stable
as $$
  select
    t.id,
    t.slug,
    t.name,
    t.tagline,
    t.logo_url,
    t.primary_category_id,
    t.pricing_tier,
    t.audience_fit,
    t.has_free_tier,
    t.api_available,
    t.open_source,
    1 - (t.embedding <=> query_embedding) as similarity
  from public.tools t
  where
    t.status = 'published'
    and t.embedding is not null
    and 1 - (t.embedding <=> query_embedding) > match_threshold
    and (filter_pricing_tier is null or t.pricing_tier = filter_pricing_tier)
    and (filter_has_free_tier is null or t.has_free_tier = filter_has_free_tier)
    -- audience filter: a non-null request for technical/non_technical also keeps
    -- tools marked 'both'; an explicit 'both' request matches the first clause.
    and (
      filter_audience_fit is null
      or t.audience_fit = filter_audience_fit
      or t.audience_fit = 'both'
    )
  order by t.embedding <=> query_embedding
  limit match_count;
$$;
