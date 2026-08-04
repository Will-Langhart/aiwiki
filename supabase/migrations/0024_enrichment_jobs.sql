-- Enrichment pipeline: job queue + LLM usage feature reconciliation
--
-- Context: the multi-agent enrichment service (services/enrichment/, Python +
-- LangGraph) replaces the single-shot discover-tools extraction with a graph
-- of specialist steps (extract → categorize → verify → write → critique).
-- Each step is its own LLM call, so it needs its own llm_usage.feature label,
-- and the whole run is tracked as a row in enrichment_jobs.

-- ---------------------------------------------------------------------------
-- 1. Reconcile llm_usage.feature check constraint.
--    'discover_tools' and 'reenrich_tools' are already written by existing
--    edge functions but were never added to the constraint — fix that here,
--    and add the new per-node enrichment features.
-- ---------------------------------------------------------------------------
alter table public.llm_usage drop constraint if exists llm_usage_feature_check;

alter table public.llm_usage
  add constraint llm_usage_feature_check check (feature in (
    -- existing
    'url_to_draft', 'chat', 'compare_summary', 'moderate_comment',
    'embed_tool', 'semantic_search', 'discover_tools', 'reenrich_tools',
    -- new: enrichment graph nodes
    'enrich_extract', 'enrich_categorize', 'enrich_verify',
    'enrich_write', 'enrich_critique'
  ));

-- ---------------------------------------------------------------------------
-- 2. enrichment_jobs — one row per URL run through the graph.
--    The Python service polls for 'queued', flips to 'running', and lands on
--    'needs_review' (draft written, awaiting admin approval) or 'failed'.
-- ---------------------------------------------------------------------------
create table public.enrichment_jobs (
  id              uuid primary key default gen_random_uuid(),
  url             text not null,
  status          text not null default 'queued'
                    check (status in ('queued','running','needs_review','published','failed')),
  tool_id         uuid references public.tools(id) on delete set null,
  -- critic output: claims that were nulled/rejected, plus an overall 0-1 score
  flags           jsonb not null default '[]'::jsonb,
  confidence      numeric(4,3),
  error           text,
  attempts        int not null default 0,
  requested_by    uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create index enrichment_jobs_status_idx  on public.enrichment_jobs (status, created_at);
create index enrichment_jobs_tool_idx    on public.enrichment_jobs (tool_id);

-- Generic updated_at trigger (first use in the schema; kept generic for reuse).
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger enrichment_jobs_set_updated_at
  before update on public.enrichment_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS — admin-only. The service uses the service role (bypasses RLS);
--    admins can watch the queue from the dashboard.
-- ---------------------------------------------------------------------------
alter table public.enrichment_jobs enable row level security;

create policy "enrichment_jobs_admin_all"
  on public.enrichment_jobs for all
  using (public.is_admin());
