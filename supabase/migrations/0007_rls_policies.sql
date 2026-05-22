-- Enable RLS on all public tables
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
alter table public.tool_rating_stats         enable row level security;
alter table public.comparisons               enable row level security;
alter table public.llm_usage                 enable row level security;

-- Helper: is caller an admin?
create or replace function public.is_admin() returns boolean as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin);
$$ language sql stable security definer;

-- Profiles: public read, owner write
create policy "profiles_read_all"    on public.profiles for select using (true);
create policy "profiles_update_own"  on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id);

-- Tools: public read published; admin all
create policy "tools_read_published" on public.tools for select using (status = 'published');
create policy "tools_admin_all"      on public.tools for all using (public.is_admin());

-- Content blocks: visible when parent tool is published
create policy "content_blocks_read_published" on public.content_blocks for select using (
  exists (select 1 from public.tools where id = content_blocks.tool_id and status = 'published')
);
create policy "content_blocks_admin_all" on public.content_blocks for all using (public.is_admin());

-- Tool screenshots: same as content blocks
create policy "screenshots_read_published" on public.tool_screenshots for select using (
  exists (select 1 from public.tools where id = tool_screenshots.tool_id and status = 'published')
);
create policy "screenshots_admin_all" on public.tool_screenshots for all using (public.is_admin());

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

-- Submissions log: submitter + admin read; no direct writes
create policy "log_read" on public.submissions_log for select using (
  exists (select 1 from public.tool_drafts where id = submissions_log.draft_id and submitter_id = auth.uid())
  or public.is_admin()
);
create policy "log_admin_insert" on public.submissions_log for insert with check (public.is_admin());

-- Bookmarks: owner only
create policy "bookmarks_owner_all" on public.bookmarks for all using (user_id = auth.uid());

-- Ratings: public read visible; owner write own; admin all
create policy "ratings_read_visible" on public.ratings for select using (status = 'visible');
create policy "ratings_owner_write"  on public.ratings for all using (user_id = auth.uid());
create policy "ratings_admin_all"    on public.ratings for all using (public.is_admin());

-- Rating stats: public read
create policy "rating_stats_read" on public.tool_rating_stats for select using (true);

-- Comments: public read visible; owner write own; admin all
create policy "comments_read_visible" on public.comments for select using (status = 'visible');
create policy "comments_owner_write"  on public.comments for all using (user_id = auth.uid());
create policy "comments_admin_all"    on public.comments for all using (public.is_admin());

-- Flags: reporter sees own; admin sees all; any authed user can create
create policy "flags_read_own" on public.flags for select using (
  reporter_id = auth.uid() or public.is_admin()
);
create policy "flags_insert_authed" on public.flags for insert with check (reporter_id = auth.uid());
create policy "flags_admin_update"  on public.flags for update using (public.is_admin());

-- Notifications: recipient only
create policy "notifications_owner_read"   on public.notifications for select using (user_id = auth.uid());
create policy "notifications_owner_update" on public.notifications for update using (user_id = auth.uid());

-- Notification prefs: owner
create policy "notif_prefs_owner_all" on public.notification_preferences for all using (user_id = auth.uid());

-- Chat: owner only (or anonymous session with null user_id)
create policy "chat_sessions_owner_all" on public.chat_sessions for all
  using (user_id = auth.uid() or user_id is null);
create policy "chat_messages_owner_all" on public.chat_messages for all using (
  exists (
    select 1 from public.chat_sessions
    where id = chat_messages.session_id and (user_id = auth.uid() or user_id is null)
  )
);

-- Comparisons: public read
create policy "comparisons_read" on public.comparisons for select using (true);
create policy "comparisons_admin_all" on public.comparisons for all using (public.is_admin());

-- LLM usage: owner reads own; admin all
create policy "llm_usage_owner_read" on public.llm_usage for select using (user_id = auth.uid());
create policy "llm_usage_admin_all"  on public.llm_usage for all using (public.is_admin());
