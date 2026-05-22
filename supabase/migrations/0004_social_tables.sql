-- Saved tools
create table public.bookmarks (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  tool_id         uuid not null references public.tools(id) on delete cascade,
  notes           text,
  created_at      timestamptz not null default now(),
  primary key (user_id, tool_id)
);

create index bookmarks_tool_idx on public.bookmarks (tool_id);

-- Ratings (one per user per tool)
create table public.ratings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  tool_id         uuid not null references public.tools(id) on delete cascade,
  stars           int not null check (stars between 1 and 5),
  review_text     text,
  status          text not null default 'visible' check (status in ('visible','hidden','flagged')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, tool_id)
);

create index ratings_tool_idx on public.ratings (tool_id, status, created_at desc);

-- Materialized rating aggregate
create table public.tool_rating_stats (
  tool_id         uuid primary key references public.tools(id) on delete cascade,
  avg_stars       numeric(3,2),
  rating_count    int not null default 0,
  updated_at      timestamptz not null default now()
);

-- Threaded comments (v1.1 — schema ready, UI deferred)
create table public.comments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  tool_id         uuid not null references public.tools(id) on delete cascade,
  parent_id       uuid references public.comments(id) on delete cascade,
  body_md         text not null,
  status          text not null default 'visible' check (status in ('visible','hidden','flagged','deleted')),
  edited_at       timestamptz,
  created_at      timestamptz not null default now()
);

create index comments_tool_idx on public.comments (tool_id, status, created_at desc);

-- Abuse reports
create table public.flags (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references public.profiles(id),
  target_type     text not null check (target_type in ('tool','rating','comment')),
  target_id       uuid not null,
  reason          text not null,
  status          text not null default 'open' check (status in ('open','reviewed','dismissed','actioned')),
  resolved_by     uuid references public.profiles(id),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index flags_status_idx on public.flags (status, created_at desc);
