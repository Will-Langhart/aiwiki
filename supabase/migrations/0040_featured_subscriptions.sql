-- Paid featured listings (Stripe)
--
-- A maker with a verified claim (0031) can subscribe to "Featured" for their
-- tool via Stripe Checkout. Stripe is the source of truth: the stripe-webhook
-- Edge Function mirrors each subscription into featured_subscriptions and then
-- calls sync_tool_featured(), which derives tools.is_featured / featured_until
-- from the tool's live subscriptions. Writes are service-role only.
--
-- search_tools() now pins currently-featured tools to the top of unfiltered
-- and category listings (no keyword query — relevance still wins for search),
-- and stops reporting a lapsed featured_until as featured.

create table public.featured_subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  tool_id                 uuid not null references public.tools(id) on delete cascade,
  user_id                 uuid not null references public.profiles(id) on delete cascade,
  stripe_customer_id      text not null,
  stripe_subscription_id  text not null unique,
  -- Stripe's subscription status, verbatim (active, trialing, past_due, canceled, …)
  status                  text not null,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index featured_subscriptions_tool_idx on public.featured_subscriptions (tool_id);
create index featured_subscriptions_user_idx on public.featured_subscriptions (user_id);

-- Webhook idempotency: one row per processed Stripe event id.
create table public.stripe_events (
  id           text primary key,
  type         text not null,
  received_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS. Makers read their own subscriptions; admins read all. No client writes —
-- only the webhook (service role) inserts or updates. stripe_events has no
-- policies at all, so it is service-role only.
-- ---------------------------------------------------------------------------
alter table public.featured_subscriptions enable row level security;
alter table public.stripe_events enable row level security;

create policy "featured_subscriptions_read_own"
  on public.featured_subscriptions for select
  using (auth.uid() = user_id);

create policy "featured_subscriptions_admin_read"
  on public.featured_subscriptions for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- sync_tool_featured(tool_id) → whether the tool is now featured.
-- Featured while any subscription is active / trialing / past_due (Stripe is
-- still retrying payment). featured_until = latest period end + 3 days' grace
-- so a late renewal webhook never blinks the listing off.
-- ---------------------------------------------------------------------------
create or replace function public.sync_tool_featured(p_tool_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until timestamptz;
  v_live  boolean;
begin
  select max(current_period_end) + interval '3 days', count(*) > 0
    into v_until, v_live
    from public.featured_subscriptions
   where tool_id = p_tool_id
     and status in ('active', 'trialing', 'past_due');

  update public.tools
     set is_featured    = v_live,
         featured_until = case when v_live then v_until else null end
   where id = p_tool_id;

  return v_live;
end;
$$;

revoke all on function public.sync_tool_featured(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- search_tools: same signature and columns as 0018. Changes:
--   * is_featured is false once featured_until has passed
--   * with no keyword query, featured tools sort first
-- ---------------------------------------------------------------------------
create or replace function public.search_tools(
  query text default null,
  cat_slugs text[] default null,
  pricing_tiers text[] default null,
  audiences text[] default null,
  has_api boolean default null,
  open_source boolean default null,
  page_size integer default 20,
  page_offset integer default 0
)
returns table (
  id uuid,
  slug text,
  name text,
  tagline text,
  logo_url text,
  primary_category_id uuid,
  pricing_tier text,
  has_free_tier boolean,
  audience_fit text,
  api_available boolean,
  open_source boolean,
  self_hostable boolean,
  model_provider text,
  avg_stars numeric,
  rating_count bigint,
  category_name text,
  category_slug text,
  is_featured boolean,
  github_stars integer,
  pricing_detail text,
  integrations text[],
  traffic_tier text,
  rank real
)
language sql stable as $$
  select
    t.id,
    t.slug,
    t.name,
    t.tagline,
    t.logo_url,
    t.primary_category_id,
    t.pricing_tier,
    t.has_free_tier,
    t.audience_fit,
    t.api_available,
    t.open_source,
    t.self_hostable,
    t.model_provider,
    trs.avg_stars,
    trs.rating_count,
    c.name  as category_name,
    c.slug  as category_slug,
    (t.is_featured and (t.featured_until is null or t.featured_until > now())) as is_featured,
    t.github_stars,
    t.pricing_detail,
    t.integrations,
    t.traffic_tier,
    case
      when query is not null and query <> ''
        then ts_rank(t.search_vector, websearch_to_tsquery('english', query))
      else t.popularity_score::real
    end as rank
  from public.tools t
  left join public.tool_rating_stats trs on trs.tool_id = t.id
  left join public.categories c on c.id = t.primary_category_id
  where
    t.status = 'published'
    and (query is null or query = '' or t.search_vector @@ websearch_to_tsquery('english', query))
    and (cat_slugs is null or c.slug = any(cat_slugs))
    and (pricing_tiers is null or t.pricing_tier = any(pricing_tiers))
    and (audiences is null or t.audience_fit = any(audiences))
    and (has_api is null or t.api_available = has_api)
    and (open_source is null or t.open_source = open_source)
  order by
    case
      when (query is null or query = '')
       and t.is_featured and (t.featured_until is null or t.featured_until > now())
        then 0 else 1
    end,
    rank desc nulls last,
    t.name asc
  limit page_size
  offset page_offset
$$;
