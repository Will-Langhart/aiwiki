-- Public, editor-curated answer pages ("best X for Y", "X vs Y", etc.) — the
-- indexable SEO surface for the AI assistant (the answer-engine flywheel).
-- See answer-pages-spec.md. Never auto-published: admins create and publish.
--
-- (Applied to the remote DB out-of-band: the table/indexes/updated_at trigger
--  via the SQL editor, then the RLS policies + rebuild trigger via the Supabase
--  MCP as migration `public_answers_rls_and_rebuild`. This file is the complete
--  record so `supabase db reset` reproduces it.)

create table if not exists public.public_answers (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,          -- "best-free-ai-image-generators"
  question          text not null,                 -- H1 / the FAQ question
  answer_md         text not null,                 -- curated markdown; may contain [tool:slug]
  summary           text,                          -- meta description / OG (<=160 chars)
  tool_ids          uuid[] not null default '{}',  -- cited tools, ordered → ItemList + links
  category_id       uuid references public.categories(id) on delete set null,
  source_message_id uuid references public.chat_messages(id) on delete set null, -- provenance
  status            text not null default 'draft'
                      check (status in ('draft','published','archived')),
  curated_by        uuid references public.profiles(id) on delete set null,
  view_count        int not null default 0,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists public_answers_status_idx   on public.public_answers (status, published_at desc);
create index if not exists public_answers_category_idx  on public.public_answers (category_id);

-- Reuse the generic updated_at trigger from migration 0024.
drop trigger if exists public_answers_set_updated_at on public.public_answers;
create trigger public_answers_set_updated_at
  before update on public.public_answers
  for each row execute function public.set_updated_at();

-- RLS: public reads published only; admins do everything.
alter table public.public_answers enable row level security;

drop policy if exists "public_answers_read_published" on public.public_answers;
create policy "public_answers_read_published"
  on public.public_answers for select using (status = 'published');

drop policy if exists "public_answers_admin_all" on public.public_answers;
create policy "public_answers_admin_all"
  on public.public_answers for all using (public.is_admin());

-- Ship a new static page when an answer is published (reuses the tools rebuild
-- fn, which internally fires only on the transition into 'published').
drop trigger if exists on_public_answer_published on public.public_answers;
create trigger on_public_answer_published
  after insert or update on public.public_answers
  for each row
  when (new.status = 'published')
  execute function public.trigger_vercel_rebuild();
