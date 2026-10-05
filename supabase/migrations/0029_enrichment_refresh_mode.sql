-- Enrichment pipeline: refresh mode for already-published tools
--
-- Context: the enrichment graph (services/enrichment/, migration 0024) was
-- create-only — it upserted on slug and forced status='draft', so pointing it
-- at an existing tool unpublished it and wiped its content blocks. Refresh mode
-- re-runs the same graph against a published tool and either:
--   * auto-applies the verified result in place ('applied') — the tool stays
--     published, only non-null verified fields and the six content blocks change;
--   * or stores the result as a proposal for an admin ('needs_review') when it
--     does not clear the verification bar (see services/enrichment/README.md).

-- ---------------------------------------------------------------------------
-- 1. Job mode + proposal payload.
-- ---------------------------------------------------------------------------
alter table public.enrichment_jobs
  add column mode text not null default 'create'
    check (mode in ('create', 'refresh')),
  -- refresh only: { fields: {name: {old, new, evidence}}, content: {...6 blocks},
  --                 withheld: [field], reasons: [string] }
  add column proposal jsonb,
  -- refresh only: the tool columns actually written ('content_blocks' included
  -- when the six blocks were replaced)
  add column applied_fields text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- 2. 'applied' status: a refresh that was written straight to the live tool.
-- ---------------------------------------------------------------------------
alter table public.enrichment_jobs drop constraint if exists enrichment_jobs_status_check;

alter table public.enrichment_jobs
  add constraint enrichment_jobs_status_check check (status in (
    'queued', 'running', 'needs_review', 'published', 'applied', 'failed'
  ));

-- Batch selection skips tools refreshed recently.
create index enrichment_jobs_refresh_idx
  on public.enrichment_jobs (tool_id, finished_at desc)
  where mode = 'refresh';
