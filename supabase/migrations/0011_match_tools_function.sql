-- match_tools: ANN vector search for semantic search + chat RAG
-- Returns tools whose embedding is within match_threshold cosine similarity

create or replace function public.match_tools(
  query_embedding  vector(1536),
  match_threshold  float default 0.3,
  match_count      int    default 12
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
  order by t.embedding <=> query_embedding
  limit match_count;
$$;

-- llm_cost_by_feature: aggregate cost + call count for the admin dashboard
create or replace function public.llm_cost_by_feature(since timestamptz default now() - interval '7 days')
returns table (feature text, total_cost numeric, call_count bigint)
language sql stable security definer
as $$
  select
    feature,
    coalesce(sum(cost_usd), 0)  as total_cost,
    count(*)                    as call_count
  from public.llm_usage
  where created_at >= since
  group by feature
  order by total_cost desc;
$$;
