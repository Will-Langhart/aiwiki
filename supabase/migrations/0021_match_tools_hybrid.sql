-- match_tools_hybrid: fuse semantic (pgvector ANN) and lexical (tsvector FTS)
-- retrieval via Reciprocal Rank Fusion. Both indexes already exist on `tools`
-- (embedding from 0011/embed-tool, search_vector from 0018) — this combines them
-- so exact-name/jargon queries (FTS) and paraphrase queries (vector) both land.
--
-- IMPORTANT: the FTS query uses OR semantics. websearch_to_tsquery ANDs all terms,
-- so a conversational query ("pinecone alternative vector database") would only
-- match a tool whose short search_vector contains every word — which never happens.
-- We take websearch's sanitized/normalized lexemes and swap ' & ' for ' | ' so a
-- tool matching ANY term is a candidate; ts_rank still rewards matching more terms.
--
-- RRF score for a tool = sum over each ranked list of 1 / (rrf_k + rank_in_list).
-- A tool found by only one method still scores; tools found by both rank highest.

create or replace function public.match_tools_hybrid(
  query_embedding      vector(1536),
  query_text           text,
  match_count          int     default 8,
  rrf_k                int     default 60,
  pool_size            int     default 50,
  filter_pricing_tier  text    default null,
  filter_has_free_tier boolean default null,
  filter_audience_fit  text    default null
)
returns table (
  id                   uuid,
  slug                 text,
  name                 text,
  tagline              text,
  logo_url             text,
  primary_category_id  uuid,
  pricing_tier         text,
  audience_fit         text,
  has_free_tier        boolean,
  api_available        boolean,
  open_source          boolean,
  similarity           float,
  rrf_score            float
)
language sql stable
as $$
  with params as (
    -- OR-joined tsquery built from websearch's sanitized lexemes (empty when the
    -- query has no usable tokens, in which case lexical contributes nothing).
    select nullif(
      replace(websearch_to_tsquery('english', coalesce(query_text, ''))::text, ' & ', ' | '),
      ''
    )::tsquery as tsq
  ),
  filtered as (
    select t.*
    from public.tools t
    where t.status = 'published'
      and (filter_pricing_tier is null or t.pricing_tier = filter_pricing_tier)
      and (filter_has_free_tier is null or t.has_free_tier = filter_has_free_tier)
      and (
        filter_audience_fit is null
        or t.audience_fit = filter_audience_fit
        or t.audience_fit = 'both'
      )
  ),
  semantic as (
    select
      id,
      row_number() over (order by embedding <=> query_embedding) as rnk,
      1 - (embedding <=> query_embedding) as similarity
    from filtered
    where embedding is not null
    order by embedding <=> query_embedding
    limit pool_size
  ),
  lexical as (
    select
      f.id,
      row_number() over (order by ts_rank(f.search_vector, p.tsq) desc) as rnk
    from filtered f, params p
    where p.tsq is not null
      and f.search_vector @@ p.tsq
    limit pool_size
  ),
  fused as (
    select
      coalesce(s.id, l.id) as id,
      coalesce(1.0 / (rrf_k + s.rnk), 0.0) + coalesce(1.0 / (rrf_k + l.rnk), 0.0) as rrf_score,
      s.similarity as similarity
    from semantic s
    full outer join lexical l on s.id = l.id
  )
  select
    f.id,
    f.slug,
    f.name,
    f.tagline,
    f.logo_url,
    f.primary_category_id,
    f.pricing_tier,
    f.audience_fit,
    f.has_free_tier,
    f.api_available,
    f.open_source,
    fused.similarity,
    fused.rrf_score
  from fused
  join filtered f on f.id = fused.id
  order by fused.rrf_score desc, fused.similarity desc nulls last
  limit match_count;
$$;
