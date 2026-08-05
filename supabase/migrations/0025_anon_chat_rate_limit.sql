-- Anonymous chat rate limiting (per-IP, per-day)
--
-- Context: the chat edge function (supabase/functions/chat) enforced a daily
-- message cap only for authenticated users; the ANON_LIMIT constant was dead
-- code. Anonymous traffic was bounded only by the global daily cost cap, so a
-- single anonymous client (or a crawler) could exhaust the whole budget and
-- take chat down for everyone. This adds durable per-IP counting the function
-- can enforce race-free.
--
-- Privacy: the function stores only a salted SHA-256 hash of the client IP,
-- never the raw address — consistent with the project's privacy-conscious
-- analytics stance (prelaunch-plan.md).

-- ---------------------------------------------------------------------------
-- 1. Counter table — one row per (ip_hash, day). Rows are disposable; prune
--    anything older than a couple of days with a scheduled job if desired.
-- ---------------------------------------------------------------------------
create table public.anon_chat_usage (
  ip_hash   text not null,
  day       date not null default current_date,
  count     int  not null default 0,
  primary key (ip_hash, day)
);

-- ---------------------------------------------------------------------------
-- 2. Atomic increment. Returns the post-increment count for the day so the
--    caller can read-and-enforce the limit in a single race-free round-trip.
-- ---------------------------------------------------------------------------
create or replace function public.bump_anon_chat_usage(p_ip_hash text)
returns int language plpgsql security definer as $$
declare v_count int;
begin
  insert into public.anon_chat_usage (ip_hash, day, count)
  values (p_ip_hash, current_date, 1)
  on conflict (ip_hash, day)
    do update set count = public.anon_chat_usage.count + 1
  returning count into v_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Lock it down. Only the service role (used by the edge function) should
--    touch this. RLS on with no policies denies anon/authenticated table
--    access, and the RPC is not callable from the public API roles — so it
--    can't be abused to inflate someone else's counter or as a DoS vector.
-- ---------------------------------------------------------------------------
alter table public.anon_chat_usage enable row level security;

revoke all on function public.bump_anon_chat_usage(text) from public;
grant execute on function public.bump_anon_chat_usage(text) to service_role;
