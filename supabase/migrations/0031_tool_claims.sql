-- Tool claims: makers claim their listing ("Claim your listing" + badge flow)
--
-- A signed-in user claims a tool through claim_tool(). If their sign-in email's
-- domain matches the tool's website host (alice@cursor.com → cursor.com or
-- app.cursor.com), the claim is verified immediately; otherwise it waits for an
-- admin at /admin/claims. Free-mail domains never match a tool host, so they
-- always go to manual review. Verified claims are public (they drive the
-- "Verified by maker" mark on tool pages); everything else is private to the
-- claimant and admins.

create table public.tool_claims (
  id                   uuid primary key default gen_random_uuid(),
  tool_id              uuid not null references public.tools(id) on delete cascade,
  user_id              uuid not null references public.profiles(id) on delete cascade,
  status               text not null default 'pending'
                         check (status in ('pending', 'verified', 'rejected')),
  verification_method  text not null
                         check (verification_method in ('email_domain', 'manual')),
  claimant_email       text not null,
  note                 text check (char_length(note) <= 1000),
  created_at           timestamptz not null default now(),
  reviewed_at          timestamptz,
  reviewed_by          uuid references public.profiles(id) on delete set null,
  unique (tool_id, user_id)
);

create index tool_claims_status_idx on public.tool_claims (status, created_at);
create index tool_claims_tool_idx   on public.tool_claims (tool_id) where status = 'verified';

-- ---------------------------------------------------------------------------
-- RLS. Inserts happen only through claim_tool() (security definer), so there is
-- no direct insert policy — clients can't pick their own status/method.
-- ---------------------------------------------------------------------------
alter table public.tool_claims enable row level security;

create policy "tool_claims_read_verified"
  on public.tool_claims for select
  using (status = 'verified');

create policy "tool_claims_read_own"
  on public.tool_claims for select
  using (auth.uid() = user_id);

create policy "tool_claims_admin_all"
  on public.tool_claims for all
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- claim_tool(slug, note) → the caller's claim row (new or existing).
-- ---------------------------------------------------------------------------
create or replace function public.claim_tool(p_slug text, p_note text default null)
returns public.tool_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_domain text := split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 2);
  v_tool   public.tools;
  v_host   text;
  v_match  boolean;
  v_claim  public.tool_claims;
begin
  if v_uid is null then
    raise exception 'sign in to claim a tool' using errcode = '42501';
  end if;

  select * into v_tool from public.tools where slug = p_slug and status = 'published';
  if not found then
    raise exception 'tool % not found', p_slug using errcode = 'P0002';
  end if;

  -- host of the tool's website, without scheme / www / path / port
  v_host := regexp_replace(lower(v_tool.website_url), '^[a-z]+://(www\.)?', '');
  v_host := split_part(split_part(v_host, '/', 1), ':', 1);
  v_match := v_domain <> '' and (v_host = v_domain or v_host like '%.' || v_domain);

  select * into v_claim from public.tool_claims where tool_id = v_tool.id and user_id = v_uid;
  if found then
    -- Re-claiming after a rejection (or with a matching email now) re-evaluates.
    if v_claim.status <> 'verified' then
      update public.tool_claims set
        status              = case when v_match then 'verified' else 'pending' end,
        verification_method = case when v_match then 'email_domain' else 'manual' end,
        claimant_email      = v_email,
        note                = coalesce(p_note, note),
        reviewed_at         = case when v_match then now() else null end,
        reviewed_by         = null
      where id = v_claim.id
      returning * into v_claim;
    end if;
    return v_claim;
  end if;

  insert into public.tool_claims (tool_id, user_id, status, verification_method, claimant_email, note, reviewed_at)
  values (
    v_tool.id, v_uid,
    case when v_match then 'verified' else 'pending' end,
    case when v_match then 'email_domain' else 'manual' end,
    v_email, p_note,
    case when v_match then now() else null end
  )
  returning * into v_claim;
  return v_claim;
end;
$$;

revoke all on function public.claim_tool(text, text) from public, anon;
grant execute on function public.claim_tool(text, text) to authenticated;
