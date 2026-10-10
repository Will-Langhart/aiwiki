-- Chat privacy: owners (and admins) only
--
-- The old policies granted ALL on chat_sessions / chat_messages when
-- `user_id IS NULL`, which made every anonymous conversation readable — and
-- editable / deletable — by anyone holding the public anon key (147 messages
-- across 73 sessions as of 2026-10-09). Anonymous chats contain personal
-- questions; they must not be public.
--
-- Clients only ever READ these tables (signed-in users' own history in the chat
-- sidebar); every write goes through the chat Edge Function with the service
-- role, which bypasses RLS. Anonymous sessions are never reloaded client-side,
-- so they need no client policy at all.

drop policy if exists "chat_sessions_owner_all" on public.chat_sessions;
drop policy if exists "chat_messages_owner_all" on public.chat_messages;

create policy "chat_sessions_owner_read"
  on public.chat_sessions for select
  using (user_id = auth.uid());

create policy "chat_messages_owner_read"
  on public.chat_messages for select
  using (
    exists (
      select 1 from public.chat_sessions s
      where s.id = chat_messages.session_id and s.user_id = auth.uid()
    )
  );

-- Admins read everything (answer curation works from real questions).
create policy "chat_sessions_admin_read"
  on public.chat_sessions for select
  using (public.is_admin());

create policy "chat_messages_admin_read"
  on public.chat_messages for select
  using (public.is_admin());
