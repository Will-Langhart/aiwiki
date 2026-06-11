-- Improve handle_new_user to sync avatar_url and display_name from OAuth providers.
-- GitHub supplies: user_name, name, avatar_url
-- Google  supplies: name, avatar_url (no user_name)
-- Magic link: no metadata — falls back to generated username

create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    -- username: prefer GitHub's user_name, then fallback to generated
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'user_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'preferred_username'), ''),
      'user_' || substring(new.id::text, 1, 8)
    ),
    -- display_name: prefer full name from OAuth provider
    nullif(trim(coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'display_name'
    )), ''),
    -- avatar: pull directly from OAuth provider metadata
    nullif(trim(new.raw_user_meta_data->>'avatar_url'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;
