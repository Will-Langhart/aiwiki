-- "Watch this tool" alerts
--
-- Watching a tool is a bookmark (no new table). When the enrichment pipeline's
-- refresh mode writes a notable change to a published tool — pricing, free
-- tier, API availability, open-source status — it inserts one 'tool_updated'
-- notification per bookmarker (services/enrichment/enrichment/refresh.py).
-- The existing on_notification_created trigger then emails them unless they
-- opted out in notification_preferences.

alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'submission_received', 'submission_approved', 'submission_rejected',
    'comment_replied', 'rating_received', 'tool_published',
    'tool_updated'
  ));
