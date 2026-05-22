-- Drafts: in-progress submissions and admin edits
create table public.tool_drafts (
  id                  uuid primary key default gen_random_uuid(),
  submitter_id        uuid not null references public.profiles(id) on delete cascade,
  source_tool_id      uuid references public.tools(id),
  status              text not null check (status in ('in_progress','submitted','in_review','approved','rejected')),
  data                jsonb not null,
  reviewer_id         uuid references public.profiles(id),
  reviewer_notes      text,
  rejection_reason    text,
  submitted_at        timestamptz,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index tool_drafts_status_idx     on public.tool_drafts (status, submitted_at desc);
create index tool_drafts_submitter_idx  on public.tool_drafts (submitter_id, status);

-- Audit log: every action on every draft
create table public.submissions_log (
  id              uuid primary key default gen_random_uuid(),
  draft_id        uuid not null references public.tool_drafts(id) on delete cascade,
  actor_id        uuid references public.profiles(id),
  action          text not null check (action in ('created','edited','submitted','reviewed','approved','rejected','published')),
  diff            jsonb,
  notes           text,
  created_at      timestamptz not null default now()
);

create index submissions_log_draft_idx on public.submissions_log (draft_id, created_at desc);
