-- Freshness engine: a per-tool change log + "last verified" date
--
-- Context: the enrichment pipeline's refresh mode (0029) re-checks a published
-- tool against its own website and auto-applies verified changes, but the only
-- record of what changed lived in enrichment_jobs.proposal (private, admin-only),
-- and nothing told visitors or crawlers how recently a listing was checked.
--
--   * tools.last_verified_at — set by services/enrichment/refresh.py whenever a
--     verified refresh is applied (auto or admin-approved). Distinct from
--     updated_at, which admin edits also bump: "verified" means the facts were
--     re-checked against the vendor's site with evidence.
--   * tool_changes — one row per field a refresh actually wrote, with old/new
--     values and the evidence quote. Every row is admin-readable; the public
--     subset (is_notable) drives the tool-page "Recent changes" list and the
--     /changes page.
--
-- Writes come only from the enrichment service (service role); there are no
-- insert/update policies.

alter table public.tools add column last_verified_at timestamptz;

create table public.tool_changes (
  id          uuid primary key default gen_random_uuid(),
  tool_id     uuid not null references public.tools(id) on delete cascade,
  job_id      uuid references public.enrichment_jobs(id) on delete set null,
  field       text not null,
  old_value   jsonb,
  new_value   jsonb,
  evidence    text,
  created_at  timestamptz not null default now(),
  -- What visitors see: changes to buying-decision facts that had a prior value.
  -- Filling a blank ("unlisted → $20") is a data-quality fix, not news, and
  -- prose-ish fields (key_strengths, integrations) churn on most refreshes.
  is_notable  boolean generated always as (
    field in (
      'pricing_tier', 'has_free_tier', 'pricing_starts_at', 'pricing_detail',
      'api_available', 'open_source', 'self_hostable', 'model_provider'
    )
    and old_value is not null
    and old_value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
  ) stored
);

create index tool_changes_tool_idx    on public.tool_changes (tool_id, created_at desc);
create index tool_changes_notable_idx on public.tool_changes (created_at desc) where is_notable;

-- ---------------------------------------------------------------------------
-- RLS: notable changes on published tools are public; admins see everything.
-- ---------------------------------------------------------------------------
alter table public.tool_changes enable row level security;

create policy "tool_changes_read_notable"
  on public.tool_changes for select
  using (
    is_notable
    and exists (
      select 1 from public.tools t
      where t.id = tool_changes.tool_id and t.status = 'published'
    )
  );

create policy "tool_changes_admin_all"
  on public.tool_changes for all
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Backfill from refreshes already applied (proposal.fields ∩ applied_fields).
-- ---------------------------------------------------------------------------
insert into public.tool_changes (tool_id, job_id, field, old_value, new_value, evidence, created_at)
select
  j.tool_id,
  j.id,
  f.key,
  f.value -> 'old',
  f.value -> 'new',
  f.value ->> 'evidence',
  coalesce(j.finished_at, j.updated_at)
from public.enrichment_jobs j
cross join lateral jsonb_each(j.proposal -> 'fields') f
where j.mode = 'refresh'
  and j.status = 'applied'
  and j.tool_id is not null
  and f.key = any (j.applied_fields);

-- A tool counts as verified when it was last written by the evidence-gated
-- pipeline: an applied refresh, or the create run it was published from.
update public.tools t
set last_verified_at = v.verified_at
from (
  select tool_id, max(coalesce(finished_at, updated_at)) as verified_at
  from public.enrichment_jobs
  where tool_id is not null
    and ((mode = 'refresh' and status = 'applied') or (mode = 'create' and status = 'published'))
  group by tool_id
) v
where v.tool_id = t.id;
