-- Auto-create profile on signup
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      'user_' || substring(new.id::text, 1, 8)
    ),
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
  select
    tid,
    avg(stars)::numeric(3,2),
    count(*),
    now()
  from public.ratings
  where tool_id = tid and status = 'visible'
  on conflict (tool_id) do update
    set avg_stars    = excluded.avg_stars,
        rating_count = excluded.rating_count,
        updated_at   = now();
  return null;
end;
$$ language plpgsql;

create trigger refresh_rating_stats
  after insert or update or delete on public.ratings
  for each row execute function public.refresh_tool_rating_stats();

-- Notification email fanout (calls Edge Function via pg_net if available)
create or replace function public.fanout_notification() returns trigger as $$
begin
  if exists (
    select 1 from public.notification_preferences
    where user_id = new.user_id and notification_type = new.type and email = true
  ) or not exists (
    select 1 from public.notification_preferences
    where user_id = new.user_id and notification_type = new.type
  ) then
    -- Only fires if pg_net is installed (available on hosted Supabase)
    if (select count(*) from pg_extension where extname = 'pg_net') > 0 then
      perform net.http_post(
        url     := current_setting('app.send_notification_email_url', true),
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || current_setting('app.edge_function_secret', true)
        ),
        body := jsonb_build_object('notification_id', new.id)
      );
    end if;
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
    if (select count(*) from pg_extension where extname = 'pg_net') > 0 then
      perform net.http_post(
        url     := current_setting('app.vercel_deploy_hook_url', true),
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object('source', 'tool_published', 'slug', new.slug)
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_tool_published
  after insert or update on public.tools
  for each row execute function public.trigger_vercel_rebuild();

-- Full-text search RPC (used by frontend via supabase.rpc())
create or replace function public.search_tools(
  query           text        default null,
  cat_slugs       text[]      default null,
  pricing_tiers   text[]      default null,
  audiences       text[]      default null,
  has_api         boolean     default null,
  open_source     boolean     default null,
  page_size       int         default 24,
  page_offset     int         default 0
) returns table (
  id                  uuid,
  slug                text,
  name                text,
  tagline             text,
  logo_url            text,
  primary_category_id uuid,
  pricing_tier        text,
  audience_fit        text,
  rank                real
) language sql stable as $$
  select
    t.id, t.slug, t.name, t.tagline, t.logo_url,
    t.primary_category_id, t.pricing_tier, t.audience_fit,
    case
      when query is null or query = ''
      then 0::real
      else ts_rank(t.search_vector, websearch_to_tsquery('english', query))
    end as rank
  from public.tools t
  left join public.categories c on c.id = t.primary_category_id
  where t.status = 'published'
    and (query is null or query = '' or t.search_vector @@ websearch_to_tsquery('english', query))
    and (cat_slugs       is null or c.slug          = any(cat_slugs))
    and (pricing_tiers   is null or t.pricing_tier  = any(pricing_tiers))
    and (audiences       is null or t.audience_fit  = any(audiences))
    and (has_api         is null or t.api_available = has_api)
    and (open_source     is null or t.open_source   = open_source)
  order by rank desc nulls last, t.published_at desc
  limit page_size offset page_offset;
$$;
