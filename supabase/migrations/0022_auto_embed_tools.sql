-- 0022_auto_embed_tools.sql
-- Auto-embed a tool when it becomes published, and re-embed when the text that
-- feeds the embedding (name, tagline, or the `overview` content_block) changes.
--
-- Motivation: nothing previously embedded a tool on publish, so `tools.embedding`
-- drifted — 219/281 published tools had NULL embeddings and had to be backfilled
-- by hand via scripts/embed-backfill.ts. A NULL embedding makes a tool invisible
-- to every pgvector path (match_tools_filtered / match_tools_hybrid / semantic-search).
--
-- Mechanism mirrors the existing pg_net hooks (0008 fanout_notification,
-- trigger_vercel_rebuild): a Postgres trigger fires net.http_post() to the
-- `embed-tool` Edge Function, which holds the OpenAI key server-side, computes the
-- embedding from name + tagline + first 2000 chars of overview, and writes it back.
--
-- Deploy prerequisites (set once per environment; NOT committed here because the
-- service-role key is a secret — same handling as app.* GUCs in SPEC.md §"Deploy"):
--   alter database postgres set app.embed_tool_url     = 'https://<ref>.supabase.co/functions/v1/embed-tool';
--   alter database postgres set app.service_role_key   = '<SUPABASE_SERVICE_ROLE_KEY>';
-- pg_net must be enabled (it is on hosted Supabase). If either GUC is unset the
-- helper no-ops silently, exactly like the other hooks, so the migration is safe to
-- apply before the GUCs exist.

-- ============================================================
-- Helper: queue an embed request for one tool (fire-and-forget).
-- Async via pg_net — the request runs in pg_net's background worker AFTER the
-- writing transaction commits, so the Edge Function always reads committed state
-- (including any overview block inserted later in the same transaction).
-- ============================================================
create or replace function public.request_tool_embed(p_tool_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fn_url  text;
  svc_key text;
begin
  if p_tool_id is null then
    return;
  end if;

  -- pg_net is only present on hosted Supabase / local with the extension enabled.
  if (select count(*) from pg_extension where extname = 'pg_net') = 0 then
    return;
  end if;

  fn_url  := current_setting('app.embed_tool_url', true);
  svc_key := current_setting('app.service_role_key', true);

  -- Not configured yet — skip silently (don't break the write).
  if fn_url is null or fn_url = '' or svc_key is null or svc_key = '' then
    return;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body    := jsonb_build_object('tool_id', p_tool_id)
  );
exception when others then
  -- Never let an embedding hiccup roll back the user's write.
  null;
end;
$$;

-- ============================================================
-- Trigger 1: tools — embed on publish, and on name/tagline edits while published.
-- Guards with `is distinct from` so a bare embedding write-back (or any unrelated
-- column change) does NOT re-fire — that's what keeps embed-tool's own UPDATE from
-- looping and keeps cost bounded on no-op updates.
-- ============================================================
create or replace function public.embed_tool_on_tools_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'published' then
      perform public.request_tool_embed(new.id);
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status = 'published' and (
         old.status  is distinct from 'published'   -- just became published
         or new.name    is distinct from old.name    -- embedded text changed
         or new.tagline is distinct from old.tagline
       ) then
      perform public.request_tool_embed(new.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger embed_tool_on_change
  after insert or update on public.tools
  for each row
  execute function public.embed_tool_on_tools_change();

-- ============================================================
-- Trigger 2: content_blocks — re-embed when the `overview` block of a published
-- tool is inserted, edited, or removed. Other sections (docs/use_cases) are not
-- part of the embedding input, so they no-op.
-- ============================================================
create or replace function public.embed_tool_on_overview_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tool_id uuid;
  v_status  text;
begin
  if tg_op = 'DELETE' then
    if old.section <> 'overview' then
      return old;
    end if;
    v_tool_id := old.tool_id;
  elsif tg_op = 'UPDATE' then
    -- Ignore rows that are not overview before or after the change.
    if new.section <> 'overview' and old.section <> 'overview' then
      return new;
    end if;
    -- Skip no-op edits to the overview text.
    if new.section is not distinct from old.section
       and new.body_md is not distinct from old.body_md then
      return new;
    end if;
    v_tool_id := new.tool_id;
  else -- INSERT
    if new.section <> 'overview' then
      return new;
    end if;
    v_tool_id := new.tool_id;
  end if;

  select status into v_status from public.tools where id = v_tool_id;
  if v_status = 'published' then
    perform public.request_tool_embed(v_tool_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger embed_tool_on_overview_change
  after insert or update or delete on public.content_blocks
  for each row
  execute function public.embed_tool_on_overview_change();
