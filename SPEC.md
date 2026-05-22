# AI Wiki — Specification

> **Status:** v1 spec, ready for implementation  
> **Owner:** Lang  
> **Last updated:** May 22, 2026  
> **Stack:** React Router v7 (framework mode) · TypeScript · Vite · Tailwind · shadcn/ui · Supabase · Vercel

---

## 1. Product Brief

**AI Wiki** is a community-curated directory and reference site for AI tools. It combines the depth of developer documentation with the discoverability of a directory and the social trust of community contribution. Every tool has structured comparison data, audience-tagged prose content (technical vs. non-technical), real screenshots, ratings, and is accessible through both browsing and an AI-powered chat interface.

### Primary user jobs
1. **Discover** — "What AI tool should I use for X?"
2. **Learn** — "How does Claude actually work and what can it do?"
3. **Compare** — "Claude vs. ChatGPT for code generation — which is better and why?"
4. **Contribute** — "Add the AI tool I love so others can find it."
5. **Save** — "Keep a personal list of tools I want to try or use regularly."

### Success metrics (12-month targets)
- 250+ published tool pages
- Sub-2s LCP on tool detail pages
- 100+ community-submitted tools (post-moderation)
- 1k+ MAU on the chat interface
- Lighthouse Performance ≥ 95 on every prerendered route

### Non-goals
- No marketplace / no transactions (we don't sell access to tools)
- No affiliate links in v1 (revisit when traffic justifies)
- No video content hosting (link out to YouTube etc.)
- No private workspaces (this is a public wiki)
- No multi-language support in v1
- No comments at launch (ship in v1.1 — schema-ready but UI deferred)

---

## 2. Tech Stack (locked)

| Layer | Choice | Version | Why |
|---|---|---|---|
| Framework | React Router v7 (framework mode) | ^7.4 | First-class SSR + SSG + SPA mix; native Vercel support |
| Build tool | Vite | ^6.0 | RR7 framework mode bundles with Vite |
| Language | TypeScript | ^5.5 | Strict mode, exhaustive checks |
| Styling | Tailwind CSS | ^3.4 | Locked at 3.x; v4 still maturing |
| UI primitives | shadcn/ui (new-york preset) | latest | Radix-based, owned in-repo |
| Icons | Lucide React | latest | Ships with shadcn |
| Database | Supabase (Postgres 15+) | hosted | Auth + DB + Storage + Realtime + Edge Functions |
| Vector | pgvector | latest | For semantic embedding column on tools |
| Search | Postgres FTS (tsvector + GIN) | native | Hybrid-ready (vector + FTS) |
| Auth | Supabase Auth | native | Email + Google OAuth |
| File storage | Supabase Storage | native | Screenshots, logos |
| Email | Resend + React Email | latest | Transactional only |
| LLM | Anthropic Claude API | claude-sonnet-4-7 default | Autofill, chat, summaries, moderation |
| Embeddings | OpenAI `text-embedding-3-small` | 1536 dims | Cheap, performant |
| Hosting | Vercel (Hobby → Pro) | — | Static + Edge + ISR |
| Analytics | Vercel Web Analytics | — | Page views, Web Vitals |
| Forms | React Hook Form + Zod | ^7 / ^3 | Type-safe validation |
| Data fetching | TanStack Query | ^5 | Caching, refetch, suspense |
| State (local) | Zustand | ^5 | Compare tray, density, audience toggle |
| Markdown | `react-markdown` + `remark-gfm` | latest | Content rendering with sanitization |
| Code highlighting | Shiki | latest | Same syntax engine as VS Code |
| Date/time | `date-fns` | ^3 | Tree-shakeable, no Moment |
| Testing | Vitest + Testing Library | latest | Unit + integration |
| E2E | Playwright | latest | Critical-path smoke tests |
| Linting | Biome | latest | Faster than ESLint+Prettier |

### Versions to pin in `package.json`
Always pin minor versions for predictability; major upgrades go through a deliberate PR. Renovate or Dependabot configured to open weekly PRs.

---

## 3. Architecture Overview

```
                           ┌───────────────────────────────────┐
                           │    Vercel (Edge + Static CDN)     │
                           │                                   │
   Browser  ◀──────────────┤  Prerendered HTML + RR7 hydration │
                           │  + ISR for dynamic compare pages  │
                           └──────────────────┬────────────────┘
                                              │
                       ┌──────────────────────┼──────────────────────┐
                       ▼                      ▼                      ▼
              ┌────────────────┐    ┌──────────────────┐    ┌──────────────────┐
              │ Supabase DB    │    │ Supabase Storage │    │ Supabase Auth    │
              │ (Postgres)     │    │ (screenshots,    │    │ (email + OAuth)  │
              │  + pgvector    │    │  logos)          │    │                  │
              │  + Realtime    │    └──────────────────┘    └──────────────────┘
              └────────┬───────┘
                       │
                       │ trigger
                       ▼
              ┌────────────────────────────────────────────────┐
              │ Supabase Edge Functions (Deno)                 │
              │  · url-to-draft         (Claude API)           │
              │  · send-notification    (Resend)               │
              │  · compare-summary      (Claude API)           │
              │  · chat                 (Claude + pgvector RAG)│
              │  · moderate-comment     (Claude API)           │
              └────────────────────────────────────────────────┘
```

### Rendering strategy per route type

| Route type | Strategy | Why |
|---|---|---|
| `/`, `/tools`, `/tools/:slug/*`, popular `/compare?...` | **Prerender** at build time | SEO + speed |
| `/search`, arbitrary `/compare?...`, `/chat` | **SPA / client-side** | Dynamic, no SEO value |
| `/submit/*`, `/account/*`, `/admin/*` | **SPA, auth-gated** | Personal/admin only |
| Edge Functions | Deno on Supabase | LLM calls, email |

Rebuild trigger: when an admin publishes a submission, a Postgres trigger calls a Supabase Edge Function that hits a Vercel deploy hook. Builds for ~250 pages complete in well under 60s, comfortably within Vercel's free-tier limits.

---

## 4. Data Model

All DDL lives in `supabase/migrations/` and is applied in numbered order. Schema below is the complete v1 + v1.1 set; v1.1 tables (`comments`, `flags`) are created up front so we can ship the social layer without a follow-on migration.

### 4.1 Extensions

```sql
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "vector";
create extension if not exists "citext";
```

### 4.2 Core tables

```sql
-- Profile extends auth.users with public info
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        citext unique not null,
  display_name    text,
  bio             text,
  avatar_url      text,
  is_admin        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Categories (hierarchical)
create table public.categories (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  description     text,
  parent_id       uuid references public.categories(id) on delete set null,
  sort_order      int not null default 0,
  icon            text,                                -- lucide icon name
  created_at      timestamptz not null default now()
);

-- Free-form tags
create table public.tags (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  created_at      timestamptz not null default now()
);

-- Published tools (the catalog)
create table public.tools (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text unique not null,
  name                  text not null,
  tagline               text not null,
  website_url           text not null,
  logo_url              text,
  -- Structured facts (comparison-friendly)
  primary_category_id   uuid references public.categories(id),
  pricing_tier          text not null check (pricing_tier in ('free','freemium','paid','enterprise')),
  has_free_tier         boolean not null default false,
  pricing_starts_at     numeric(10,2),
  pricing_currency      text not null default 'USD',
  audience_fit          text not null check (audience_fit in ('technical','non_technical','both')),
  model_provider        text,
  open_source           boolean not null default false,
  self_hostable         boolean not null default false,
  api_available         boolean not null default false,
  founded_year          int,
  hq_country            text,
  hq_city               text,
  key_strengths         text[] default '{}',
  -- Search
  search_vector         tsvector generated always as (
                          setweight(to_tsvector('english', coalesce(name, '')),    'A') ||
                          setweight(to_tsvector('english', coalesce(tagline, '')), 'B')
                        ) stored,
  embedding             vector(1536),                  -- populated by Edge Function
  -- Lifecycle
  status                text not null default 'draft' check (status in ('draft','published','archived')),
  submitted_by          uuid references public.profiles(id),
  edited_by_admin       boolean not null default false,
  published_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index tools_search_idx               on public.tools using gin (search_vector);
create index tools_embedding_idx            on public.tools using hnsw (embedding vector_cosine_ops);
create index tools_status_published_idx     on public.tools (status, published_at desc);
create index tools_primary_category_idx     on public.tools (primary_category_id);

-- Many-to-many: tools ↔ categories (secondary categories)
create table public.tool_categories (
  tool_id         uuid not null references public.tools(id) on delete cascade,
  category_id     uuid not null references public.categories(id) on delete cascade,
  primary key (tool_id, category_id)
);

-- Many-to-many: tools ↔ tags
create table public.tool_tags (
  tool_id         uuid not null references public.tools(id) on delete cascade,
  tag_id          uuid not null references public.tags(id) on delete cascade,
  primary key (tool_id, tag_id)
);

-- Audience-tagged prose content (Overview / Docs / Use Cases)
create table public.content_blocks (
  id              uuid primary key default gen_random_uuid(),
  tool_id         uuid not null references public.tools(id) on delete cascade,
  section         text not null check (section in ('overview','docs','use_cases')),
  audience        text not null default 'both' check (audience in ('technical','non_technical','both')),
  heading         text,
  body_md         text not null,                       -- markdown
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index content_blocks_tool_section_idx on public.content_blocks (tool_id, section, sort_order);

-- Screenshots (stored in Supabase Storage)
create table public.tool_screenshots (
  id              uuid primary key default gen_random_uuid(),
  tool_id         uuid not null references public.tools(id) on delete cascade,
  storage_path    text not null,                       -- e.g. tools/<slug>/01.webp
  alt_text        text,
  caption         text,
  sort_order      int not null default 0,
  width           int,
  height          int,
  created_at      timestamptz not null default now()
);
```

### 4.3 Submission workflow tables

```sql
-- Drafts: in-progress submissions and admin's working edits
create table public.tool_drafts (
  id                  uuid primary key default gen_random_uuid(),
  submitter_id        uuid not null references public.profiles(id) on delete cascade,
  source_tool_id      uuid references public.tools(id),   -- if editing an existing tool
  status              text not null check (status in ('in_progress','submitted','in_review','approved','rejected')),
  data                jsonb not null,                     -- full submission payload (mirrors tools shape)
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
  diff            jsonb,                                  -- JSON diff of changed fields
  notes           text,
  created_at      timestamptz not null default now()
);
create index submissions_log_draft_idx on public.submissions_log (draft_id, created_at desc);
```

### 4.4 Social layer

```sql
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

-- Materialized rating aggregate (refreshed via trigger on ratings)
create table public.tool_rating_stats (
  tool_id         uuid primary key references public.tools(id) on delete cascade,
  avg_stars       numeric(3,2),
  rating_count    int not null default 0,
  updated_at      timestamptz not null default now()
);

-- Threaded comments (v1.1 — schema ready)
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
```

### 4.5 Notifications

```sql
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  type            text not null check (type in (
                    'submission_received', 'submission_approved', 'submission_rejected',
                    'comment_replied', 'rating_received', 'tool_published'
                  )),
  payload         jsonb not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications (user_id, read_at, created_at desc);

create table public.notification_preferences (
  user_id             uuid not null references public.profiles(id) on delete cascade,
  notification_type   text not null,
  in_app              boolean not null default true,
  email               boolean not null default true,
  primary key (user_id, notification_type)
);
```

### 4.6 AI surface tables

```sql
-- Cached comparison TL;DRs (so we're not re-summarizing on every view)
create table public.comparisons (
  slug                text primary key,                  -- "claude-vs-chatgpt"
  tool_ids            uuid[] not null,
  ai_summary          text,
  view_count          int not null default 0,
  last_generated_at   timestamptz,
  created_at          timestamptz not null default now()
);

-- Chat sessions for "Ask AI Wiki"
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
  tool_citations  uuid[] default '{}',                  -- referenced tool IDs
  created_at      timestamptz not null default now()
);
create index chat_messages_session_idx on public.chat_messages (session_id, created_at);

-- LLM usage tracking (cost guardrails)
create table public.llm_usage (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete set null,
  feature         text not null check (feature in ('url_to_draft','chat','compare_summary','moderate_comment')),
  input_tokens    int,
  output_tokens   int,
  cost_usd        numeric(10,6),
  created_at      timestamptz not null default now()
);
create index llm_usage_feature_idx on public.llm_usage (feature, created_at desc);
```

### 4.7 Row-Level Security policies

All public tables have RLS enabled. Pattern: public reads on published content, owners can manage their own rows, admins (`profiles.is_admin = true`) can do anything.

```sql
-- Enable on all public tables
alter table public.profiles                  enable row level security;
alter table public.tools                     enable row level security;
alter table public.content_blocks            enable row level security;
alter table public.tool_screenshots          enable row level security;
alter table public.tool_drafts               enable row level security;
alter table public.submissions_log           enable row level security;
alter table public.bookmarks                 enable row level security;
alter table public.ratings                   enable row level security;
alter table public.comments                  enable row level security;
alter table public.flags                     enable row level security;
alter table public.notifications             enable row level security;
alter table public.notification_preferences  enable row level security;
alter table public.chat_sessions             enable row level security;
alter table public.chat_messages             enable row level security;

-- Helper function: is the caller an admin?
create or replace function public.is_admin() returns boolean as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin);
$$ language sql stable security definer;

-- Profiles: public read, owner write
create policy "profiles_read_all" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id);

-- Tools: public read published; admin all
create policy "tools_read_published" on public.tools for select using (status = 'published');
create policy "tools_admin_all" on public.tools for all using (public.is_admin());

-- Content blocks: inherit visibility from parent tool
create policy "content_blocks_read_published" on public.content_blocks for select using (
  exists (select 1 from public.tools where id = content_blocks.tool_id and status = 'published')
);
create policy "content_blocks_admin_all" on public.content_blocks for all using (public.is_admin());

-- Tool drafts: submitter manages own in_progress; admin all
create policy "drafts_read_own" on public.tool_drafts for select using (
  submitter_id = auth.uid() or public.is_admin()
);
create policy "drafts_insert_self" on public.tool_drafts for insert with check (
  submitter_id = auth.uid()
);
create policy "drafts_update_own_in_progress" on public.tool_drafts for update using (
  submitter_id = auth.uid() and status = 'in_progress'
);
create policy "drafts_admin_all" on public.tool_drafts for all using (public.is_admin());

-- Bookmarks: owner only
create policy "bookmarks_owner_all" on public.bookmarks for all using (user_id = auth.uid());

-- Ratings: public read visible; owner write own; admin all
create policy "ratings_read_visible" on public.ratings for select using (status = 'visible');
create policy "ratings_owner_write" on public.ratings for all using (user_id = auth.uid());
create policy "ratings_admin_all" on public.ratings for all using (public.is_admin());

-- Comments: public read visible; owner write own; admin all
create policy "comments_read_visible" on public.comments for select using (status = 'visible');
create policy "comments_owner_write" on public.comments for all using (user_id = auth.uid());
create policy "comments_admin_all" on public.comments for all using (public.is_admin());

-- Flags: reporter sees own; admin sees all; anyone authed can create
create policy "flags_read_own" on public.flags for select using (
  reporter_id = auth.uid() or public.is_admin()
);
create policy "flags_insert_authed" on public.flags for insert with check (
  reporter_id = auth.uid()
);
create policy "flags_admin_update" on public.flags for update using (public.is_admin());

-- Notifications: recipient only
create policy "notifications_owner_read" on public.notifications for select using (user_id = auth.uid());
create policy "notifications_owner_update" on public.notifications for update using (user_id = auth.uid());

-- Notification prefs: owner
create policy "notif_prefs_owner_all" on public.notification_preferences for all using (user_id = auth.uid());

-- Chat: owner only
create policy "chat_sessions_owner_all" on public.chat_sessions for all using (user_id = auth.uid() or user_id is null);
create policy "chat_messages_owner_all" on public.chat_messages for all using (
  exists (
    select 1 from public.chat_sessions
    where id = chat_messages.session_id and (user_id = auth.uid() or user_id is null)
  )
);
```

### 4.8 Triggers and functions

```sql
-- Auto-create profile on signup
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substring(new.id::text, 1, 8)),
    new.raw_user_meta_data->>'display_name'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Rate limit submissions (max 5/hour per user)
create or replace function public.check_submission_rate_limit() returns trigger as $$
begin
  if (
    select count(*) from public.tool_drafts
    where submitter_id = new.submitter_id
      and status = 'submitted'
      and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'Rate limit: maximum 5 submissions per hour';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger enforce_submission_rate_limit
  before update of status on public.tool_drafts
  for each row when (new.status = 'submitted' and old.status <> 'submitted')
  execute function public.check_submission_rate_limit();

-- Recompute rating stats on insert/update/delete
create or replace function public.refresh_tool_rating_stats() returns trigger as $$
declare tid uuid;
begin
  tid := coalesce(new.tool_id, old.tool_id);
  insert into public.tool_rating_stats (tool_id, avg_stars, rating_count, updated_at)
  select tid, avg(stars)::numeric(3,2), count(*), now()
  from public.ratings
  where tool_id = tid and status = 'visible'
  on conflict (tool_id) do update
    set avg_stars = excluded.avg_stars,
        rating_count = excluded.rating_count,
        updated_at = now();
  return null;
end;
$$ language plpgsql;

create trigger refresh_rating_stats
  after insert or update or delete on public.ratings
  for each row execute function public.refresh_tool_rating_stats();

-- Notification fanout: when a row is inserted into notifications, enqueue email
create or replace function public.fanout_notification() returns trigger as $$
begin
  -- Check user preferences; only enqueue email if user has it enabled
  if exists (
    select 1 from public.notification_preferences
    where user_id = new.user_id and notification_type = new.type and email = true
  ) or not exists (
    select 1 from public.notification_preferences
    where user_id = new.user_id and notification_type = new.type
  ) then
    perform net.http_post(
      url := current_setting('app.send_notification_email_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.edge_function_secret')
      ),
      body := jsonb_build_object('notification_id', new.id)
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_notification_created
  after insert on public.notifications
  for each row execute function public.fanout_notification();

-- Trigger Vercel rebuild when a tool is published
create or replace function public.trigger_vercel_rebuild() returns trigger as $$
begin
  if new.status = 'published' and (old.status is null or old.status <> 'published') then
    perform net.http_post(
      url := current_setting('app.vercel_deploy_hook_url'),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('source', 'tool_published', 'slug', new.slug)
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_tool_published
  after insert or update on public.tools
  for each row execute function public.trigger_vercel_rebuild();
```

### 4.9 Seed data (categories)

Initial category set, refined later:

```sql
insert into public.categories (slug, name, icon, sort_order) values
  ('chat-assistants',       'Chat assistants',         'message-square', 10),
  ('coding',                'Coding & development',    'code',           20),
  ('image-generation',      'Image generation',        'image',          30),
  ('video',                 'Video generation',        'video',          40),
  ('audio-music',           'Audio & music',           'music',          50),
  ('search-research',       'Search & research',       'search',         60),
  ('writing',               'Writing & editing',       'pen-tool',       70),
  ('presentations-docs',    'Presentations & docs',    'presentation',   80),
  ('design',                'Design',                  'palette',        90),
  ('data-analytics',        'Data & analytics',        'bar-chart',     100),
  ('automation',            'Automation & agents',     'workflow',      110),
  ('infrastructure',        'AI infrastructure',       'server',        120),
  ('voice',                 'Voice & speech',          'mic',           130),
  ('marketing-sales',       'Marketing & sales',       'megaphone',     140);
```

---

## 5. Route Map

Every route is enumerated below with its rendering strategy and purpose. Prerendered routes are listed in `react-router.config.ts`'s `prerender()` function.

| Route | Rendering | Layout | Purpose |
|---|---|---|---|
| `/` | Prerender | RootLayout | Home — featured tools, categories, value prop |
| `/tools` | Prerender | RootLayout (dense) | Directory grid with filters + search bar |
| `/tools/:slug` | Prerender per slug | ToolLayout (comfortable) | Tool overview (canonical) |
| `/tools/:slug/docs` | Prerender per slug | ToolLayout (comfortable) | Tool reference docs |
| `/tools/:slug/use-cases` | Prerender per slug | ToolLayout (comfortable) | Use cases & examples |
| `/categories/:slug` | Prerender per category | RootLayout (dense) | Browse by category |
| `/compare` | Hybrid (prerender popular) | RootLayout | Side-by-side compare; popular combos prerendered |
| `/search` | SPA | RootLayout | Full search results page |
| `/chat` | SPA | ChatLayout | Ask AI Wiki — RAG chat |
| `/submit` | SPA (auth) | RootLayout | Submission wizard entry |
| `/submit/:draftId` | SPA (auth) | RootLayout | Resume a draft |
| `/account` | SPA (auth) | RootLayout | Profile + settings |
| `/account/bookmarks` | SPA (auth) | RootLayout | Saved tools |
| `/account/drafts` | SPA (auth) | RootLayout | My submissions |
| `/account/notifications` | SPA (auth) | RootLayout | Notification list |
| `/admin` | SPA (admin) | AdminLayout | Admin home with queues |
| `/admin/submissions` | SPA (admin) | AdminLayout | Submission queue |
| `/admin/submissions/:id` | SPA (admin) | AdminLayout | Three-column editor |
| `/admin/flags` | SPA (admin) | AdminLayout | Flag queue (v1.1) |
| `/admin/tools/:slug/edit` | SPA (admin) | AdminLayout | Direct edit of published tool |
| `/auth/callback` | SPA | — | OAuth callback handler |
| `/sitemap.xml` | Generated at build | — | All published tool routes |
| `/robots.txt` | Static | — | Sitemap pointer, allow all |

### `react-router.config.ts`

```typescript
import type { Config } from '@react-router/dev/config';
import { createClient } from '@supabase/supabase-js';

export default {
  ssr: false,                       // SPA fallback for dynamic routes
  prerender: async () => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: tools } = await supabase
      .from('tools')
      .select('slug')
      .eq('status', 'published');

    const { data: categories } = await supabase
      .from('categories')
      .select('slug');

    const { data: popularCompares } = await supabase
      .from('comparisons')
      .select('slug, tool_ids')
      .order('view_count', { ascending: false })
      .limit(20);

    const toolPaths = (tools ?? []).flatMap(t => [
      `/tools/${t.slug}`,
      `/tools/${t.slug}/docs`,
      `/tools/${t.slug}/use-cases`,
    ]);
    const categoryPaths = (categories ?? []).map(c => `/categories/${c.slug}`);
    const comparePaths = (popularCompares ?? []).map(c =>
      `/compare?tools=${c.tool_ids.join(',')}`
    );

    return ['/', '/tools', ...toolPaths, ...categoryPaths, ...comparePaths];
  },
} satisfies Config;
```

---

## 6. Component Inventory

shadcn primitives are added via `npx shadcn add <component>` on demand and live under `app/components/ui/`. Domain components live in feature folders.

### 6.1 shadcn primitives we'll install

`button`, `input`, `textarea`, `label`, `form`, `card`, `badge`, `avatar`, `tabs`, `sheet`, `dialog`, `drawer`, `dropdown-menu`, `popover`, `command`, `sonner` (toast), `skeleton`, `select`, `checkbox`, `radio-group`, `switch`, `tooltip`, `separator`, `accordion`, `breadcrumb`, `alert`, `progress`, `hover-card`, `table`, `pagination`, `scroll-area`, `slider`

### 6.2 Domain components

**Layout**
- `<AppShell>` — top nav, footer, theme + density providers
- `<ToolLayout>` — header, tab nav, breadcrumbs, audience toggle
- `<AdminLayout>` — sidebar, queue badges, admin-only chrome
- `<ChatLayout>` — full-height chat container

**Tool**
- `<ToolCard>` — directory card; dense variant; shows tagline, category, free-tier badge, rating
- `<ToolHeader>` — logo, name, tagline, primary CTA (visit), bookmark button
- `<ToolHero>` — structured facts block (pricing, audience fit, key strengths)
- `<ContentBlocks>` — renders audience-filtered content blocks by section
- `<AudienceToggle>` — segmented control: Technical / General / Both
- `<RatingDisplay>` — stars + count, links to reviews
- `<RatingInput>` — interactive star picker + review textarea
- `<BookmarkButton>` — toggle, optimistic update
- `<ToolScreenshots>` — gallery, lightbox

**Directory & search**
- `<DirectoryGrid>` — virtualized at >50 items
- `<FilterSidebar>` — category, pricing, audience, has-API, open-source facets
- `<SearchInput>` — debounced, supports `Cmd+K` global
- `<SearchCommandPalette>` — cmdk-powered modal; instant results
- `<CategoryGrid>` — for `/categories`

**Compare**
- `<CompareTable>` — side-by-side; sticky first column with field labels
- `<CompareTray>` — sticky bottom-right; growing chip; opens slide-in
- `<CompareTrayPanel>` — sheet listing selected tools with Compare CTA
- `<CompareSummary>` — AI TL;DR card; streamed in

**Submission**
- `<SubmissionWizard>` — multi-step orchestrator; persists to `tool_drafts`
- `<SubmissionStep_Basics>`, `<SubmissionStep_Description>`, `<SubmissionStep_Facts>`, `<SubmissionStep_Screenshots>`, `<SubmissionStep_Review>`
- `<URLAutofillButton>` — triggers Edge Function, shows progress
- `<LivePreviewRail>` — renders the in-progress draft as it would appear published

**Admin**
- `<SubmissionQueue>` — list with status badges and time-since-submitted
- `<AdminSubmissionEditor>` — three-column layout (original | edits | preview)
- `<DiffHighlight>` — visual diff between submitter content and admin edits
- `<FlagQueue>` (v1.1) — reports list with quick-resolve actions

**Notifications**
- `<NotificationBell>` — in nav; unread badge; subscribes to Realtime
- `<NotificationDropdown>` — recent items; mark-read on view
- `<NotificationPreferences>` — per-type, per-channel toggles

**Chat (Ask AI Wiki)**
- `<ChatInterface>` — input, message list, scroll management
- `<MessageList>` — alternates user/assistant; copy-to-clipboard
- `<MessageContent>` — streams markdown; renders code blocks; expandable citations
- `<ToolCitationCard>` — inline-renderable preview of a referenced tool

**Auth + account**
- `<AuthDialog>` — email + Google buttons; embedded into protected routes
- `<UserMenu>` — dropdown from avatar in nav
- `<BookmarkList>`, `<DraftList>`, `<NotificationList>`

**Utilities**
- `<ThemeProvider>`, `<ThemeToggle>` — dark/light, persisted, no flash
- `<DensityProvider>` — applies `data-density` attribute for CSS scope
- `<MarkdownRenderer>` — sanitized markdown with Shiki for code
- `<ErrorBoundary>` — catches render errors; logs to Supabase `errors` table

---

## 7. Design System

### 7.1 Color tokens (CSS variables in `app/styles/tokens.css`)

```css
:root {
  /* Light theme (default fallback only — site starts dark) */
  --bg:         #ffffff;
  --surface:    #fafafa;
  --surface-2:  #f4f4f5;   /* zinc-100 */
  --border:     #e4e4e7;   /* zinc-200 */
  --text:       #18181b;   /* zinc-900 */
  --text-muted: #71717a;   /* zinc-500 */
  --text-subtle:#a1a1aa;   /* zinc-400 */
  --accent:     #3b82f6;   /* blue-500 — final pick: confirm with Lang */
  --accent-fg:  #ffffff;
  --success:    #10b981;
  --warning:    #f59e0b;
  --danger:     #ef4444;
}

.dark {
  --bg:         #0a0a0a;   /* zinc-950 */
  --surface:    #18181b;   /* zinc-900 */
  --surface-2:  #27272a;   /* zinc-800 */
  --border:     #27272a;
  --text:       #fafafa;   /* zinc-50 */
  --text-muted: #a1a1aa;   /* zinc-400 */
  --text-subtle:#71717a;   /* zinc-500 */
  --accent:     #60a5fa;   /* blue-400 — slightly lighter for contrast */
  --accent-fg:  #0a0a0a;
}
```

### 7.2 Spacing & type tokens (density-aware)

```css
:root {
  --space-section: 4rem;   /* 64px — comfortable default */
  --space-element: 1.5rem; /* 24px */
  --text-body: 1rem;       /* 16px */
  --text-lh: 1.7;
  --content-width: 72ch;
}

[data-density='dense'] {
  --space-section: 2rem;   /* 32px */
  --space-element: 0.75rem;/* 12px */
  --text-body: 0.875rem;   /* 14px */
  --text-lh: 1.5;
  --content-width: 100%;
}
```

Apply at layout boundaries:
```jsx
// Root and directory routes
<div data-density="dense">…</div>

// Tool detail routes (via <ToolLayout>)
<div data-density="comfortable">…</div>
```

### 7.3 Type scale

| Use | Size | Weight | Line height |
|---|---|---|---|
| `h1` (tool name) | `text-4xl` / `clamp(2rem, 4vw, 2.75rem)` | 700 | 1.15 |
| `h2` (section) | `text-2xl` | 600 | 1.25 |
| `h3` (subsection) | `text-lg` | 600 | 1.35 |
| Body (comfortable) | `text-base` | 400 | 1.7 |
| Body (dense) | `text-sm` | 400 | 1.5 |
| Caption | `text-xs` | 500 | 1.4 |
| Code | `text-sm` | 400 (mono) | 1.5 |

### 7.4 Tailwind config

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1280px' } },
    extend: {
      colors: {
        bg:        'var(--bg)',
        surface:   'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border:    'var(--border)',
        text:      'var(--text)',
        'text-muted':  'var(--text-muted)',
        'text-subtle': 'var(--text-subtle)',
        accent:    'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', '"JetBrains Mono"', 'monospace'],
      },
      transitionDuration: { DEFAULT: '200ms' },
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
} satisfies Config;
```

### 7.5 Theme hydration (avoid flash)

In `app/root.tsx`, inject an inline script in `<head>` that runs before React hydrates:

```html
<script>
  (function() {
    var t = localStorage.getItem('theme') || 'dark';
    if (t === 'dark') document.documentElement.classList.add('dark');
  })();
</script>
```

---

## 8. Submission & Moderation Workflow

### 8.1 State machine

```
                    ┌──────────────┐
                    │ in_progress  │  (user has not submitted yet)
                    └──────┬───────┘
                           │ submit
                           ▼
                    ┌──────────────┐
       ┌────────────┤  submitted   │   ← user can no longer edit
       │            └──────┬───────┘
       │                   │ admin picks up
       │                   ▼
       │            ┌──────────────┐
       │            │  in_review   │   ← admin is editing
       │            └──┬─────────┬─┘
       │       approve │         │ reject
       │               ▼         ▼
       │      ┌────────────┐ ┌─────────────┐
       │      │  approved  │ │  rejected   │
       │      └──────┬─────┘ └─────────────┘
       │             │ publish
       │             ▼
       │      ┌────────────┐
       │      │ published  │   (a row appears in public.tools)
       │      └────────────┘
       │
       └─── (rate-limit error) → user notified
```

State transitions allowed:
- `in_progress → submitted` (by submitter)
- `submitted → in_review` (by admin, on first edit)
- `in_review → approved` (by admin)
- `approved → published` (by admin; copies draft.data into a new/updated `tools` row)
- `submitted | in_review → rejected` (by admin, with required reason)

### 8.2 Submission form fields (multi-step)

**Step 1 — Basics**
- Website URL (required, URL validation)
- Name (required, 2–60 chars)
- Tagline (required, 10–140 chars)
- Primary category (required, from `categories`)
- Secondary categories (optional, ≤3)
- Tags (optional, ≤8)

**Step 2 — Description** — uses URL-to-draft autofill on entry
- Overview body — markdown editor, default audience "both"
- Optionally split into audience-specific blocks via "Add a technical version" / "Add a general version" buttons
- Docs intro — markdown
- Use cases — markdown, prompted with 3 sample use case prompts

**Step 3 — Structured facts** (drives compare view)
- Pricing tier (radio: free / freemium / paid / enterprise)
- Has free tier (boolean)
- Pricing starts at (numeric, conditional on tier)
- Audience fit (technical / non-technical / both)
- Model provider (text, optional)
- Open source (boolean)
- Self-hostable (boolean)
- API available (boolean)
- Founded year
- HQ country, HQ city (optional)
- Key strengths (chip input, 1–5 items)

**Step 4 — Screenshots**
- Upload 1–5 images
- Client-side compression to WebP, max 1600px wide, max 400KB
- Alt text required per image
- Optional caption

**Step 5 — Review**
- Live preview of the published tool page
- Submit button (disabled until all required fields valid)

### 8.3 URL autofill Edge Function

`supabase/functions/url-to-draft/index.ts`:

1. Receives `{ url }`
2. Fetches the page HTML (User-Agent: `AIWikiBot/1.0`), strips scripts/styles, extracts text
3. Sends to Claude API with a structured-output prompt:

```typescript
const prompt = `Extract structured information about this AI tool from its website.
URL: ${url}
Content (truncated): ${textContent.slice(0, 8000)}

Return JSON matching this schema:
{
  name: string,
  tagline: string,
  overview_md: string,
  primary_category_suggestion: string,
  pricing_tier: 'free' | 'freemium' | 'paid' | 'enterprise',
  has_free_tier: boolean,
  audience_fit: 'technical' | 'non_technical' | 'both',
  open_source: boolean,
  api_available: boolean,
  key_strengths: string[]
}`;
```

4. Returns the JSON to the client
5. Logs token usage to `llm_usage`
6. Client merges into the wizard form (submitter polishes)

Rate limit: 10 calls / user / day at RLS-equivalent level (table `llm_usage` counted).

### 8.4 Admin three-column editor

`/admin/submissions/:id`:

| Column 1: Submission (read-only) | Column 2: Edits (live form) | Column 3: Preview |
|---|---|---|
| Submitter's name, time, URL | Same fields as wizard, prefilled with submission | Renders as if published |
| Each field shows diff badge if edited | Save draft / Approve / Reject buttons | Updates as you type |
| Inline comments per field | Reviewer notes field | Audience toggle works |

**Reject flow**: requires picking a reason from a select (spam, low quality, duplicate, off-topic, other) + optional message. Submitter gets notification with the reason.

**Approve flow**: writes a row to `tools` (or updates the existing one), copies `content_blocks` and `tool_screenshots`, sets `tools.status = 'published'`, sets `submitted_by`. Trigger fires Vercel deploy hook.

---

## 9. Notification System

### 9.1 Events that fire notifications

| Event | Recipient | Type | Channels |
|---|---|---|---|
| User submits a draft | Admin (Lang) | `submission_received` | email + in-app |
| Admin approves draft | Submitter | `submission_approved` | email + in-app |
| Admin rejects draft | Submitter | `submission_rejected` | email + in-app |
| Tool actually publishes | Submitter | `tool_published` | email + in-app |
| Someone rates a tool you submitted | Submitter | `rating_received` | in-app only (default) |
| Reply to your comment (v1.1) | Parent author | `comment_replied` | email + in-app |

### 9.2 In-app delivery

- `NotificationBell` subscribes to Realtime on the `notifications` table filtered by `user_id = auth.uid()`
- New row → bell badge increments, brief toast appears (via Sonner)
- Opening dropdown lists last 20; clicking sets `read_at`
- Full list at `/account/notifications`

### 9.3 Email delivery

Edge Function `send-notification-email`:

1. Triggered by Postgres trigger on `notifications` insert (via `pg_net.http_post`)
2. Reads notification by ID, joins `notification_preferences` and `profiles`
3. If user has disabled email for this type, exits
4. Dedup check: if a row with same `user_id + type + sha256(payload)` was sent in the last 5 minutes, exits
5. Renders the React Email template for the notification type
6. Sends via Resend
7. Records a row in a `notification_email_log` table

### 9.4 Preferences UI

`/account/notifications/preferences`:

| Notification type | In-app | Email |
|---|---|---|
| Submission updates | ☑ | ☑ |
| Tool published | ☑ | ☑ |
| Ratings on your tools | ☑ | ☐ |
| Comment replies | ☑ | ☑ |

Saved to `notification_preferences`.

---

## 10. AI Integration Surface

Four LLM-powered features. Each lives in its own Edge Function for isolation, has cost tracking via `llm_usage`, and uses Claude Sonnet 4.7 by default with structured output where applicable.

### 10.1 URL → Draft (already detailed in §8.3)
- Trigger: submitter pastes a URL in wizard step 1
- Output: JSON pre-fill for wizard form
- Cost ceiling: 10 calls/user/day

### 10.2 Compare TL;DR

Edge Function `compare-summary`:
- Triggered when `/compare?tools=...` is rendered and the combination isn't cached
- Fetches the structured facts and overview blocks for each selected tool
- Sends to Claude: `"Generate a 3–4 sentence TL;DR comparing these tools, focused on the most meaningful differences. Don't repeat facts the table already shows."`
- Streams response back via SSE so it appears progressively
- Caches result in `comparisons` table by `slug = sorted_tool_slugs.join('-vs-')`
- Re-generates if any selected tool's `updated_at` is newer than `comparisons.last_generated_at`

### 10.3 Natural Language Search

Edge Function `semantic-search`:
- User query goes to `/search?q=...`
- Client-side: first tries Postgres FTS via Supabase RPC for instant results
- In parallel: server-side embeds the query (`text-embedding-3-small`), runs ANN search on `tools.embedding` with HNSW index
- Reciprocal rank fusion merges FTS and vector results
- For very long natural language queries (>50 chars), additionally calls Claude with `"Convert this user query to a structured filter object and a search query"` — returns `{ categories: [...], pricing: 'free', natural_query: 'image generators' }`
- Returns merged results with provenance per hit (matched via text / vector / both)
- Embeddings are computed when a tool is published (trigger on `tools` insert/update) — concatenate name + tagline + overview content_blocks → embed → store

### 10.4 Ask AI Wiki (chat with RAG)

Edge Function `chat`:
- Receives `{ session_id, message, user_id? }`
- Persists user message to `chat_messages`
- Performs RAG:
  1. Embed the user message
  2. ANN search `tools.embedding` for top 8 candidate tools
  3. Pull each tool's structured facts + overview + use cases content_blocks
  4. Build a system prompt: `"You are AI Wiki, an assistant for finding AI tools. Use only the provided context. If you reference a tool, include its slug as [tool:claude] so the UI can render a citation card. If you don't know, say so."`
  5. Call Claude with streaming enabled
- Streams response back to client via SSE
- On stream end, parses `[tool:slug]` tokens to extract citations
- Persists assistant message with `tool_citations` populated
- Logs to `llm_usage`

Rate limits: 50 messages/user/day (signed in), 5/IP/day (anonymous). Anonymous sessions get a `chat_sessions` row with `user_id = null`, cleaned up after 7 days.

### 10.5 Comment moderation (v1.1)

Edge Function `moderate-comment`:
- Triggered on `comments` insert
- Sends comment body to Claude with: `"Classify this comment. Return JSON: { is_spam: bool, is_abusive: bool, is_off_topic: bool, confidence: number }"`
- If `is_spam || is_abusive`, sets `comments.status = 'hidden'` automatically and notifies admin
- Logs to `llm_usage`

### 10.6 LLM cost guardrails

- `llm_usage` table tracks every call with input/output tokens and computed cost
- Daily admin dashboard widget: total spend by feature for last 7/30 days
- Hard cap per feature configurable via env var (`MAX_DAILY_SPEND_USD_CHAT=10`), enforced in each Edge Function before calling Claude
- Alerts via email to admin when daily spend exceeds 80% of cap

---

## 11. Search Architecture (v1)

v1 search is **Postgres FTS + faceted filters + ANN vector retrieval as a fallback for natural-language queries**. No external search service.

### 11.1 Indexes

- `tools.search_vector` — GIN, computed from name (A) + tagline (B)
- `tools.embedding` — HNSW, vector(1536)
- Composite index `(status, published_at desc)` for sorted listings

### 11.2 Query pattern (Postgres function)

```sql
create or replace function public.search_tools(
  query           text,
  cat_slugs       text[] default null,
  pricing_tiers   text[] default null,
  audiences       text[] default null,
  has_api         boolean default null,
  open_source     boolean default null,
  page_size       int default 24,
  page_offset     int default 0
) returns table (
  id uuid, slug text, name text, tagline text, logo_url text,
  primary_category_id uuid, pricing_tier text, audience_fit text,
  rank real
) language sql stable as $$
  select t.id, t.slug, t.name, t.tagline, t.logo_url,
         t.primary_category_id, t.pricing_tier, t.audience_fit,
         case when query is null or query = ''
              then 0::real
              else ts_rank(t.search_vector, websearch_to_tsquery('english', query))
         end as rank
  from public.tools t
  left join public.categories c on c.id = t.primary_category_id
  where t.status = 'published'
    and (query is null or query = '' or t.search_vector @@ websearch_to_tsquery('english', query))
    and (cat_slugs is null or c.slug = any(cat_slugs))
    and (pricing_tiers is null or t.pricing_tier = any(pricing_tiers))
    and (audiences is null or t.audience_fit = any(audiences))
    and (has_api is null or t.api_available = has_api)
    and (open_source is null or t.open_source = open_source)
  order by rank desc nulls last, t.published_at desc
  limit page_size offset page_offset;
$$;
```

Called from client via `supabase.rpc('search_tools', { query, ... })`.

### 11.3 Frontend behavior

- `/tools` page: `<FilterSidebar>` (collapsible on mobile) + `<DirectoryGrid>`
- Filter state in URL (`?q=...&cat=image-generation&pricing=freemium`) — shareable, back-button-safe
- Cmd+K opens `<SearchCommandPalette>` (cmdk modal) for instant search anywhere

---

## 12. Environment Variables

`.env.example` (committed) and `.env.local` (gitignored). All public-prefixed vars are exposed to the client via Vite's `import.meta.env`.

```bash
# ============================================================================
# Public (client-safe, prefix VITE_ for Vite to expose)
# ============================================================================
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=ey...
VITE_SITE_URL=https://aiwiki.dev

# ============================================================================
# Build-time only (used by react-router.config.ts prerender)
# ============================================================================
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ey...

# ============================================================================
# Edge Functions / server-only
# ============================================================================
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...                    # only used for embeddings
RESEND_API_KEY=re_...
VERCEL_DEPLOY_HOOK_URL=https://api.vercel.com/v1/integrations/deploy/...
EDGE_FUNCTION_SECRET=                    # shared secret for DB → Edge Function calls

# ============================================================================
# Cost caps (USD/day per feature; enforced server-side)
# ============================================================================
MAX_DAILY_SPEND_USD_CHAT=10
MAX_DAILY_SPEND_USD_AUTOFILL=5
MAX_DAILY_SPEND_USD_COMPARE=3
MAX_DAILY_SPEND_USD_MODERATE=2
```

Vercel: configure all server-side vars in the Vercel dashboard, NOT in `.env.local`. The `VITE_*` vars also go in Vercel (build-time substitution).

Supabase database settings (`alter database ... set ...`):
```sql
alter database postgres set app.send_notification_email_url = 'https://xxx.supabase.co/functions/v1/send-notification-email';
alter database postgres set app.edge_function_secret = '...';
alter database postgres set app.vercel_deploy_hook_url = '...';
```

---

## 13. Project Structure

```
ai-wiki/
├── app/
│   ├── routes/
│   │   ├── _index.tsx
│   │   ├── tools._index.tsx
│   │   ├── tools.$slug.tsx                  # parent layout (Overview default)
│   │   ├── tools.$slug.docs.tsx
│   │   ├── tools.$slug.use-cases.tsx
│   │   ├── categories.$slug.tsx
│   │   ├── compare.tsx
│   │   ├── search.tsx
│   │   ├── chat.tsx
│   │   ├── submit._index.tsx
│   │   ├── submit.$draftId.tsx
│   │   ├── account.tsx                       # account layout
│   │   ├── account.bookmarks.tsx
│   │   ├── account.drafts.tsx
│   │   ├── account.notifications.tsx
│   │   ├── account.preferences.tsx
│   │   ├── admin.tsx                         # admin layout (guard)
│   │   ├── admin._index.tsx
│   │   ├── admin.submissions._index.tsx
│   │   ├── admin.submissions.$id.tsx
│   │   ├── admin.flags.tsx
│   │   ├── admin.tools.$slug.edit.tsx
│   │   └── auth.callback.tsx
│   ├── components/
│   │   ├── ui/                               # shadcn primitives
│   │   ├── layout/
│   │   ├── tool/
│   │   ├── directory/
│   │   ├── compare/
│   │   ├── search/
│   │   ├── submission/
│   │   ├── admin/
│   │   ├── chat/
│   │   ├── notification/
│   │   └── auth/
│   ├── lib/
│   │   ├── supabase.client.ts
│   │   ├── supabase.server.ts                # build-time only
│   │   ├── anthropic.ts                      # server-side only
│   │   ├── search.ts
│   │   ├── density.tsx
│   │   ├── theme.tsx
│   │   ├── audience.tsx
│   │   ├── compare-tray.ts                   # zustand store
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── useNotifications.ts
│   │   ├── useBookmarks.ts
│   │   ├── useCurrentUser.ts
│   │   ├── useDebounce.ts
│   │   └── useStreamingFetch.ts
│   ├── types/
│   │   ├── database.ts                       # generated: supabase gen types
│   │   └── domain.ts
│   ├── styles/
│   │   ├── globals.css
│   │   └── tokens.css
│   ├── root.tsx
│   ├── routes.ts
│   ├── entry.client.tsx
│   └── entry.server.tsx
├── supabase/
│   ├── migrations/
│   │   ├── 0001_extensions.sql
│   │   ├── 0002_core_tables.sql
│   │   ├── 0003_submission_tables.sql
│   │   ├── 0004_social_tables.sql
│   │   ├── 0005_notification_tables.sql
│   │   ├── 0006_ai_tables.sql
│   │   ├── 0007_rls_policies.sql
│   │   ├── 0008_triggers_and_functions.sql
│   │   └── 0009_seed_categories.sql
│   ├── functions/
│   │   ├── url-to-draft/index.ts
│   │   ├── send-notification-email/index.ts
│   │   ├── compare-summary/index.ts
│   │   ├── semantic-search/index.ts
│   │   ├── chat/index.ts
│   │   ├── moderate-comment/index.ts
│   │   ├── embed-tool/index.ts               # called on tool publish
│   │   └── _shared/                          # common helpers
│   └── config.toml
├── public/
│   ├── favicon.svg
│   └── og-default.png
├── scripts/
│   ├── seed-from-docx.ts                     # seeds 14 tools from the original doc
│   └── generate-sitemap.ts                   # build-time, writes public/sitemap.xml
├── react-router.config.ts
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── package.json
├── biome.json
├── vercel.json
├── .env.example
├── .gitignore
├── README.md
├── SPEC.md
└── CLAUDE.md                                 # Claude Code working instructions
```

---

## 14. Build & Deployment

### 14.1 Local development

```bash
npm install
supabase start                         # local Postgres + Auth + Storage
supabase db reset                      # apply migrations
npm run db:seed                        # populate categories + 14 starter tools
npm run dev                            # vite dev server
supabase functions serve               # local Edge Functions
```

### 14.2 Vercel configuration

`vercel.json`:
```json
{
  "framework": "react-router",
  "buildCommand": "react-router build",
  "outputDirectory": "build/client",
  "installCommand": "npm install",
  "crons": [
    {
      "path": "/api/cron/regenerate-embeddings",
      "schedule": "0 4 * * 0"
    }
  ]
}
```

Vercel project settings:
- Connect Git repo
- Add all env vars in Production + Preview
- Deploy hook URL → put in Supabase `app.vercel_deploy_hook_url`
- Custom domain (when chosen) → CNAME via Vercel DNS

### 14.3 Deployment triggers

| Trigger | Action |
|---|---|
| Git push to `main` | Production deploy |
| Git push to PR branch | Preview deploy |
| Admin publishes a tool | DB trigger → Vercel deploy hook → production rebuild |
| Weekly cron | Refresh stale embeddings |

### 14.4 Performance budget (enforced via Lighthouse CI in PRs)

- LCP < 2.0s on tool detail pages
- TBT < 200ms
- CLS < 0.05
- JS bundle (initial) < 200KB gzipped
- Image budget per tool page: 500KB

---

## 15. Phased Build Plan

### Phase 0 — Foundation (≈3 days)

**Goal:** dev environment runs end-to-end, with a logged-in user, dark mode, and the database schema in place.

Tasks:
- Bootstrap repo (RR7 framework + Vite + TS + Tailwind + Biome + shadcn `new-york`)
- Connect Supabase project, run all migrations
- Install shadcn primitives listed in §6.1
- Implement `<ThemeProvider>`, `<DensityProvider>`, flash-free theme hydration
- Implement Supabase Auth (email + Google OAuth)
- `<AppShell>` with nav, user menu, theme toggle
- Generated types via `supabase gen types typescript`

**Acceptance:**
- `npm run dev` boots without errors
- A new user can sign up, sign in via Google, sign out
- The dark/light toggle persists across refresh with no flash
- `select * from tools` works locally; RLS denies anonymous select on `tool_drafts`

### Phase 1 — Directory + Tool Pages (≈5 days)

**Goal:** the 14 seed tools are browsable, searchable, filterable; each has a working overview/docs/use-cases page.

Tasks:
- Seed script populates 14 tools from the original docx data
- `<ToolCard>`, `<DirectoryGrid>`, `<FilterSidebar>`
- `/tools` route with URL-driven filter state
- `/tools/:slug` parent + child routes
- `<ToolLayout>` with tab nav, audience toggle, breadcrumbs
- `<ContentBlocks>` filters by audience; falls back to "both" when a specific audience is empty
- `<MarkdownRenderer>` with Shiki for code blocks
- Postgres FTS `search_tools` function and Supabase RPC integration
- Cmd+K `<SearchCommandPalette>`
- `react-router.config.ts` prerenders all 14 tools × 3 routes
- Vercel preview deploy works

**Acceptance:**
- Visit `/tools`, see grid of 14 tools, filter by category/pricing, search by name
- Click a tool → overview renders with correct content per audience toggle
- Tab to docs / use cases — each is its own URL, browser back works
- Lighthouse on `/tools/claude`: Performance ≥ 95
- View page source on a tool page: HTML contains the rendered content (proves prerender)

### Phase 2 — Compare + Bookmarks (≈4 days)

**Goal:** users can compare 2–3 tools side-by-side and save tools to bookmarks.

Tasks:
- `<CompareTray>` (Zustand store for selected tools, persisted to localStorage)
- "Compare" toggle on `<ToolCard>` and `<ToolHeader>`
- `/compare?tools=...` route — read structured facts, render `<CompareTable>`
- Prerender the top 20 popular combinations from `comparisons` table
- `<BookmarkButton>` with optimistic update
- `/account/bookmarks`

**Acceptance:**
- Flag 3 tools, open compare drawer, click "Compare" → see all three side-by-side
- Bookmark a tool while signed in, see it at `/account/bookmarks`
- Prerendered popular compare URL serves static HTML

### Phase 3 — Submissions Flow (≈7 days)

**Goal:** community members can submit tools through a polished wizard; admin can edit-then-publish.

Tasks:
- `<SubmissionWizard>` with 5 steps and persisted drafts
- Step 1 includes "Autofill from URL" button → calls `url-to-draft` Edge Function
- Edge Function `url-to-draft` implemented and deployed
- Screenshot upload to Supabase Storage with client-side compression
- `/submit` and `/submit/:draftId` routes (auth-gated)
- Submission state machine enforced in DB
- Admin queue at `/admin/submissions`
- `<AdminSubmissionEditor>` three-column UI with diff badges
- Approve flow writes to `tools` and triggers Vercel rebuild
- `submissions_log` populated on every action

**Acceptance:**
- A test community user can submit a full tool entry in under 5 minutes (autofill assist counted)
- Admin sees it in the queue immediately
- Admin edits a field → diff badge appears on that field
- Admin clicks Approve → tool publishes within 90s (rebuild time), submitter receives in-app notification

### Phase 4 — Notifications + Ratings (≈4 days)

**Goal:** users get notified of submission outcomes; can rate tools they've used.

Tasks:
- `notifications` table writes wired across all submission state changes
- `<NotificationBell>` subscribes to Supabase Realtime
- `send-notification-email` Edge Function with React Email templates
- `/account/notifications` and `/account/preferences`
- `<RatingDisplay>` on tool pages
- `<RatingInput>` modal — signed-in only, one rating per user per tool
- Rating aggregates auto-refreshed via trigger

**Acceptance:**
- Submit a draft → receive both an in-app toast and a transactional email within 30s
- Rate a tool — see updated average appear without refresh
- Toggle email off for "rating_received" in preferences → next rating triggers only in-app notification

### Phase 5 — AI Features (≈8 days)

**Goal:** Compare TL;DR, AI-powered search, and Ask AI Wiki chat are live.

Tasks:
- `embed-tool` Edge Function — runs on tool publish, stores embedding
- Backfill embeddings for all existing tools
- `compare-summary` Edge Function with SSE streaming
- `<CompareSummary>` component that streams in
- `semantic-search` Edge Function — hybrid FTS + vector
- `/search` page uses hybrid results
- `chat` Edge Function with RAG over top-K tools
- `<ChatInterface>` with streaming, source citations rendering inline
- `/chat` route + `<ChatLayout>`
- `llm_usage` writes from every Edge Function
- Cost guardrails enforced per feature
- Daily spend widget on admin home

**Acceptance:**
- Open a compare page that hasn't been cached → see a TL;DR stream in within 2s
- Search "image generators with free tiers" → returns Adobe Firefly, etc., even if those exact words aren't in the page
- Ask AI Wiki "what's the best AI for writing code in TypeScript?" → streams an answer with `<ToolCitationCard>` links to relevant tools
- Daily LLM spend visible on admin dashboard; capped per feature

### Phase 6 — v1.1: Comments + Polish (≈5 days)

**Goal:** social layer fully live; SEO and observability tightened.

Tasks:
- `<CommentThread>` + `<CommentForm>` on tool pages
- `moderate-comment` Edge Function
- `<FlagButton>` and `/admin/flags`
- OG image generation — at build, generate per-tool OG cards as static PNGs (or use `@vercel/og` for dynamic)
- `sitemap.xml` generated at build from `tools` table
- `robots.txt` allowing all, pointing at sitemap
- Schema.org structured data (`SoftwareApplication`, `BreadcrumbList`, `AggregateRating`) on tool pages
- Custom 404 page
- Vercel Web Analytics enabled
- E2E Playwright tests for the critical paths

**Acceptance:**
- Post a comment → it appears; post abusive content → auto-hidden, admin notified
- Validate any tool page in Google's Rich Results Test → passes
- Paste a tool URL into Slack/Twitter → preview card shows correct OG image
- Sitemap lists every published tool's three routes

---

## 16. Open Decisions (Punt to Implementation)

These are decisions intentionally deferred to be made when the work is in front of you, with no impact on the v1 scope above:

- **Accent color** — Spec uses `#3b82f6` (blue-500); alternative `#8b5cf6` (violet-500). Pick during Phase 0.
- **Brand name / wordmark** — "AI Wiki" is the working name; a logo treatment (typography + mark) gets locked in Phase 1.
- **Domain** — `aiwiki.dev` is suggested but not registered. `.dev` requires HSTS, which Vercel handles automatically.
- **Custom email sender domain** — `noreply@aiwiki.dev` or similar; requires Resend domain verification (SPF + DKIM).
- **Pricing for AI features in long run** — v1 is unmetered for users; if costs spike, gate the chat behind sign-in or rate-limit harder.
- **Whether to use a CMS overlay** — Some admins prefer Sanity Studio for content editing over a custom admin UI. We're building custom (the three-column editor) but it could be swapped to Sanity later if you'd rather edit there.

---

## 17. Appendix: Reasoning Trail

Decisions made during spec, in case Claude Code needs context on **why**:

- **React Router v7 over Next.js**: Lang's stack is Vite-native; RR7 framework mode now provides SSG via `prerender()`, removing the historical reason to use Next for this kind of site.
- **Supabase over alternatives**: already in Lang's stack; Auth + DB + Storage + Realtime + Edge Functions in one place; RLS gives security boundaries we can express declaratively.
- **shadcn over Mantine**: owning components in-repo means design changes don't require library upgrades; Tailwind-native; new-york preset matches the dark/technical aesthetic.
- **Postgres FTS over Algolia**: at 100s–low-1000s of rows, FTS is sub-50ms and free; pgvector handles the semantic side without a second service.
- **Edit-then-publish over auto-approve**: protects quality; the diff UI keeps it fast.
- **Comments in v1.1**: schema is built in v1 so v1.1 ships in days, not weeks; deferring keeps v1 launch focused on getting the core right.
- **AI features all-in**: Lang specifically chose this; the architecture cleanly isolates AI features into Edge Functions with cost tracking so they can be turned off individually if needed.
- **Density as CSS-variable scope**: the alternative was passing density props through every component; the variable approach means a component is naturally responsive to its layout context.

---

*End of SPEC.*
