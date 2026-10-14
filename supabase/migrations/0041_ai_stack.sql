-- "My AI stack": the AI tools a user actually pays for (SPEC §19)
--
-- A bookmark means "interested in"; a stack item means "I use this and pay
-- $X for it". The stack drives three things:
--
--   * my_stack() — the /account/stack page: each item joined with the tool's
--     current listed facts, plus an overlap group (2+ active items sharing a
--     primary category) and a flag when the tool is no longer listed.
--   * tool_watchers() — who gets a 'tool_updated' alert when the freshness
--     engine records a notable change: bookmarkers ∪ stack members. Replaces
--     the bookmarks-only lookup in services/enrichment/enrichment/refresh.py.
--   * (later, not here) anonymous per-tool aggregates for vendors — see §19
--     "Not yet". No aggregate function ships in this migration.
--
-- Stack data is private: owner-only RLS, no admin read policy. Costs are
-- user-entered and USD-only in v1.

create table public.stack_items (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  tool_id         uuid not null references public.tools(id) on delete cascade,
  plan_label      text check (char_length(plan_label) <= 80),       -- "Plus", "Pro", "Team"
  cost_usd        numeric(10,2) not null default 0 check (cost_usd >= 0),
  billing_period  text not null default 'month' check (billing_period in ('month','year')),
  monthly_cost    numeric(10,2) generated always as (
                    case billing_period when 'year' then round(cost_usd / 12, 2) else cost_usd end
                  ) stored,
  status          text not null default 'active' check (status in ('active','trial','cancelled')),
  renews_on       date,
  notes           text check (char_length(notes) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, tool_id)
);

create index stack_items_tool_idx on public.stack_items (tool_id) where status <> 'cancelled';

create trigger stack_items_set_updated_at
  before update on public.stack_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: owner-only for everything. No admin policy on purpose — what someone
-- pays for is private, and vendor-facing stats must go through an aggregate
-- with a minimum-count threshold (§19), never row access.
-- ---------------------------------------------------------------------------
alter table public.stack_items enable row level security;

create policy "stack_items_owner_select" on public.stack_items
  for select using (user_id = auth.uid());
create policy "stack_items_owner_insert" on public.stack_items
  for insert with check (user_id = auth.uid());
create policy "stack_items_owner_update" on public.stack_items
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "stack_items_owner_delete" on public.stack_items
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- my_stack(): the caller's stack with current listed facts. security invoker,
-- so RLS limits it to auth.uid()'s rows; anon gets an empty set.
--   overlap_group — primary category id when 2+ non-cancelled items share it
--   is_listed     — false once the tool is archived (defunct or merged)
-- ---------------------------------------------------------------------------
create or replace function public.my_stack()
returns table (
  tool_id            uuid,
  slug               text,
  name               text,
  logo_url           text,
  is_listed          boolean,
  category_name      text,
  plan_label         text,
  cost_usd           numeric,
  billing_period     text,
  monthly_cost       numeric,
  status             text,
  renews_on          date,
  notes              text,
  pricing_tier       text,
  has_free_tier      boolean,
  pricing_starts_at  numeric,
  last_verified_at   timestamptz,
  overlap_group      uuid,
  added_at           timestamptz
)
language sql stable security invoker set search_path = public as $$
  with mine as (
    select s.*, t.primary_category_id
    from stack_items s
    join tools t on t.id = s.tool_id
    where s.user_id = auth.uid()
  ),
  shared as (
    select primary_category_id
    from mine
    where status <> 'cancelled' and primary_category_id is not null
    group by primary_category_id
    having count(*) > 1
  )
  select
    t.id, t.slug, t.name, t.logo_url,
    t.status = 'published',
    c.name,
    m.plan_label, m.cost_usd, m.billing_period, m.monthly_cost, m.status,
    m.renews_on, m.notes,
    t.pricing_tier, t.has_free_tier, t.pricing_starts_at, t.last_verified_at,
    case when m.status <> 'cancelled' then sh.primary_category_id end,
    m.created_at
  from mine m
  join tools t on t.id = m.tool_id
  left join categories c on c.id = t.primary_category_id
  left join shared sh on sh.primary_category_id = m.primary_category_id
  order by (m.status = 'cancelled'), m.monthly_cost desc, t.name;
$$;

grant execute on function public.my_stack() to authenticated;

-- ---------------------------------------------------------------------------
-- tool_watchers(): users to alert when a tool changes. Called by the
-- enrichment service (service role) from notify_watchers(); not exposed to
-- clients, since it reveals who uses what.
-- ---------------------------------------------------------------------------
create or replace function public.tool_watchers(p_tool_id uuid)
returns table (user_id uuid, in_stack boolean)
language sql stable security definer set search_path = public as $$
  select u.user_id, bool_or(u.in_stack)
  from (
    select b.user_id, false as in_stack from bookmarks b where b.tool_id = p_tool_id
    union all
    select s.user_id, true from stack_items s
    where s.tool_id = p_tool_id and s.status <> 'cancelled'
  ) u
  group by u.user_id;
$$;

revoke execute on function public.tool_watchers(uuid) from public, anon, authenticated;
