-- Cached comparison TL;DRs
create table public.comparisons (
  slug                text primary key,
  tool_ids            uuid[] not null,
  ai_summary          text,
  view_count          int not null default 0,
  last_generated_at   timestamptz,
  created_at          timestamptz not null default now()
);

-- Chat sessions
create table public.chat_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete cascade,
  title           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.chat_sessions(id) on delete cascade,
  role            text not null check (role in ('user','assistant')),
  content         text not null,
  tool_citations  uuid[] default '{}',
  created_at      timestamptz not null default now()
);

create index chat_messages_session_idx on public.chat_messages (session_id, created_at);

-- LLM usage tracking (cost guardrails)
create table public.llm_usage (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete set null,
  feature         text not null check (feature in ('url_to_draft','chat','compare_summary','moderate_comment','embed_tool','semantic_search')),
  input_tokens    int,
  output_tokens   int,
  cost_usd        numeric(10,6),
  created_at      timestamptz not null default now()
);

create index llm_usage_feature_idx on public.llm_usage (feature, created_at desc);
create index llm_usage_user_idx    on public.llm_usage (user_id, created_at desc);
