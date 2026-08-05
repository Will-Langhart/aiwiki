-- Enable RLS on the public reference tables and add the right policies.
--
-- Context: categories, tags, tool_categories, tool_tags, and
-- notification_email_log were created without RLS, so the anon key (shipped in
-- the client bundle) could read AND write every row. This locks them down.
--
-- The catalog reference tables are public read / admin write — they drive the
-- homepage grid, /tools filters, and tool-page category display, so blocking
-- anon reads takes the site dark. notification_email_log is internal: RLS on
-- with NO policy leaves it reachable only by the service role.
--
-- (This file documents state applied to the remote DB via the Supabase MCP as
--  migrations `rls_reference_tables_read_policies`; the ENABLE RLS statements
--  were run manually. Kept here so `supabase db reset` reproduces production.)

alter table public.categories            enable row level security;
alter table public.tags                  enable row level security;
alter table public.tool_categories       enable row level security;
alter table public.tool_tags             enable row level security;
alter table public.notification_email_log enable row level security;

-- categories -----------------------------------------------------------------
create policy "categories_read_all" on public.categories for select using (true);
create policy "categories_admin_all" on public.categories for all using (public.is_admin());

-- tags -----------------------------------------------------------------------
create policy "tags_read_all" on public.tags for select using (true);
create policy "tags_admin_all" on public.tags for all using (public.is_admin());

-- tool_categories ------------------------------------------------------------
create policy "tool_categories_read_all" on public.tool_categories for select using (true);
create policy "tool_categories_admin_all" on public.tool_categories for all using (public.is_admin());

-- tool_tags ------------------------------------------------------------------
create policy "tool_tags_read_all" on public.tool_tags for select using (true);
create policy "tool_tags_admin_all" on public.tool_tags for all using (public.is_admin());

-- notification_email_log: intentionally NO policy — service-role-only.
