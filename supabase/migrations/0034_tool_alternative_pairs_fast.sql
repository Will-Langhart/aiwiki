-- tool_alternative_pairs: one row per tool, and fast
--
-- The 0033 version returned one row per (tool, alternative) pair — 1,649 rows,
-- but PostgREST caps responses at 1,000, so the build only prerendered 857 of
-- the 1,329 compare pages. It also took ~6.4s (re-running tool_alternatives
-- and its URL regexes 552 times), past the anon statement timeout.
--
-- Now: one row per tool with its top-N alternative slugs as an array (552
-- rows), hosts/apexes computed once, top-8 heapsort per tool, then dedupe by
-- host and keep N. ~2.1s. Verified to return the same slugs in the same order
-- as tool_alternatives(slug, 3) for every published tool.
--
-- Return type changes, so drop first.

drop function if exists public.tool_alternative_pairs(int);

create function public.tool_alternative_pairs(p_per_tool int default 3)
returns table (slug text, alt_slugs text[])
language sql
stable
as $$
  with t as materialized (
    select id, slug, name, embedding, primary_category_id, popularity_score, host,
           regexp_replace(host, '^.*?([^.]+\.[^.]+)$', '\1') as apex
    from (
      select id, slug, name, embedding, primary_category_id, popularity_score,
             split_part(regexp_replace(lower(website_url), '^https?://(www\.)?', ''), '/', 1) as host
      from public.tools
      where status = 'published'
    ) x
  )
  select s.slug, array(
    select d.alt from (
      select distinct on (top.host) top.alt, top.score, top.name
      from (
        select c.slug as alt, c.name, c.host,
               case
                 when s.embedding is not null and c.embedding is not null
                   then 1 - (c.embedding <=> s.embedding)
                 else 0
               end
               + case
                   when c.primary_category_id = s.primary_category_id
                     then 0.12 + 0.15 * coalesce(c.popularity_score, 0) / 100.0
                   else 0
                 end as score
        from t c
        where c.id <> s.id
          and c.apex <> s.apex
          and (
            (s.embedding is not null and c.embedding is not null)
            or c.primary_category_id = s.primary_category_id
          )
        order by score desc, c.name
        limit 8
      ) top
      order by top.host, top.score desc
    ) d
    order by d.score desc, d.name
    limit greatest(1, least(p_per_tool, 8))
  ) as alt_slugs
  from t s;
$$;

grant execute on function public.tool_alternative_pairs(int) to anon, authenticated;
