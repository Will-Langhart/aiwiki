-- 0010_storage_and_deploy_hook.sql
-- Creates the tool-screenshots storage bucket and a DB-level
-- "notify on publish" mechanism via a Postgres function.
-- The actual Vercel deploy hook is called from the Edge Function
-- (trigger-rebuild) which is invoked by the admin approve flow.

-- ============================================================
-- Storage bucket for screenshot uploads
-- NOTE: Supabase storage buckets must be created via the dashboard
-- or management API; this migration adds the RLS policies.
-- Run `supabase storage create-bucket tool-screenshots --public`
-- in CI or manually before first use.
-- ============================================================

-- Allow authenticated users to upload into their own folder
-- (storage/<bucket> policies live in storage.objects)
create policy "screenshots_upload_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'tool-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow anyone to read screenshots (bucket is public)
create policy "screenshots_read_public"
  on storage.objects for select
  using ( bucket_id = 'tool-screenshots' );

-- Allow owners to delete their own uploads
create policy "screenshots_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'tool-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- Vercel rebuild hook: notify when a tool is published
-- Called by the approve flow in AdminSubmissionEditor.
-- The Edge Function reads VERCEL_DEPLOY_HOOK_URL from env.
-- ============================================================

-- Function that posts to the deploy hook via pg_net (if installed)
create or replace function public.notify_vercel_on_publish()
returns trigger
language plpgsql
security definer
as $$
declare
  hook_url text;
begin
  -- Only fire when status transitions to 'published'
  if (NEW.status = 'published' and OLD.status <> 'published') then
    hook_url := current_setting('app.vercel_deploy_hook_url', true);
    if hook_url is not null and hook_url <> '' then
      -- pg_net extension must be enabled; silently skip if not
      begin
        perform net.http_post(url := hook_url, body := '{}'::jsonb);
      exception when others then
        null; -- don't fail the transaction if pg_net isn't available
      end;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger tools_publish_notify
  after update on public.tools
  for each row
  execute function public.notify_vercel_on_publish();
