-- Profiles (extends auth.users)
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
  icon            text,
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
  search_vector         tsvector generated always as (
                          setweight(to_tsvector('english', coalesce(name, '')),    'A') ||
                          setweight(to_tsvector('english', coalesce(tagline, '')), 'B')
                        ) stored,
  embedding             vector(1536),
  status                text not null default 'draft' check (status in ('draft','published','archived')),
  submitted_by          uuid references public.profiles(id),
  edited_by_admin       boolean not null default false,
  published_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index tools_search_idx           on public.tools using gin (search_vector);
create index tools_embedding_idx        on public.tools using hnsw (embedding vector_cosine_ops);
create index tools_status_published_idx on public.tools (status, published_at desc);
create index tools_primary_category_idx on public.tools (primary_category_id);

-- Many-to-many: tools ↔ categories
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

-- Audience-tagged prose content
create table public.content_blocks (
  id              uuid primary key default gen_random_uuid(),
  tool_id         uuid not null references public.tools(id) on delete cascade,
  section         text not null check (section in ('overview','docs','use_cases')),
  audience        text not null default 'both' check (audience in ('technical','non_technical','both')),
  heading         text,
  body_md         text not null,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index content_blocks_tool_section_idx on public.content_blocks (tool_id, section, sort_order);

-- Screenshots
create table public.tool_screenshots (
  id              uuid primary key default gen_random_uuid(),
  tool_id         uuid not null references public.tools(id) on delete cascade,
  storage_path    text not null,
  alt_text        text,
  caption         text,
  sort_order      int not null default 0,
  width           int,
  height          int,
  created_at      timestamptz not null default now()
);
