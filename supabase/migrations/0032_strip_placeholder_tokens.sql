-- Strip LLM placeholder tokens from tool list fields
--
-- 24 published tools carried a literal "<UNKNOWN>" in `integrations`, rendered
-- as a chip on tool cards (including ChatGPT and Perplexity on the homepage).
-- Refresh mode keeps re-saving the existing value, so cleaning the rows once
-- isn't enough: a BEFORE trigger sanitizes every writer (enrichment service,
-- Edge Functions, admin editor) at the boundary.
--
-- A token is dropped when it is blank, wrapped in angle brackets ("<UNKNOWN>",
-- "<none>"), or a bare unknown/none marker. Real values are left untouched.

create or replace function public.strip_placeholder_tokens(vals text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(v order by ord), '{}')
  from unnest(vals) with ordinality as t(v, ord)
  where v is not null
    and btrim(v) <> ''
    and btrim(v) !~ '^<[^>]*>$'
    and lower(btrim(v)) not in ('unknown', 'n/a', 'na', 'none', 'null', 'not specified');
$$;

create or replace function public.tools_strip_placeholders()
returns trigger
language plpgsql
as $$
begin
  if new.integrations is not null then
    new.integrations := public.strip_placeholder_tokens(new.integrations);
  end if;
  if new.key_strengths is not null then
    new.key_strengths := public.strip_placeholder_tokens(new.key_strengths);
  end if;
  return new;
end;
$$;

create trigger tools_strip_placeholders
  before insert or update of integrations, key_strengths on public.tools
  for each row
  execute function public.tools_strip_placeholders();

-- One-time cleanup of existing rows (fires the trigger above).
update public.tools
set integrations  = integrations,
    key_strengths = key_strengths
where integrations  is distinct from public.strip_placeholder_tokens(integrations)
   or key_strengths is distinct from public.strip_placeholder_tokens(key_strengths);
