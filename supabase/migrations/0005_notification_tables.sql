create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  type            text not null check (type in (
                    'submission_received', 'submission_approved', 'submission_rejected',
                    'comment_replied', 'rating_received', 'tool_published'
                  )),
  payload         jsonb not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index notifications_user_unread_idx on public.notifications (user_id, read_at, created_at desc);

create table public.notification_preferences (
  user_id             uuid not null references public.profiles(id) on delete cascade,
  notification_type   text not null,
  in_app              boolean not null default true,
  email               boolean not null default true,
  primary key (user_id, notification_type)
);

-- Email send log (dedup + audit)
create table public.notification_email_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete set null,
  type            text not null,
  payload_hash    text not null,
  sent_at         timestamptz not null default now()
);

create index notif_email_log_dedup_idx on public.notification_email_log (user_id, type, payload_hash, sent_at desc);
