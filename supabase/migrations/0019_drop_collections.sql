-- Remove the collections feature.
-- The frontend (routes, nav, prerender) has been removed; this drops the
-- backing tables. CASCADE also removes the foreign key, the
-- collection_tools_collection_rank_idx index, and the public-read RLS policies
-- created in 0017_collections.sql.
--
-- NOTE: tool_suggestions (also created in 0017) is intentionally preserved —
-- it backs the /suggest page and is unrelated to collections.

drop table if exists public.collection_tools cascade;
drop table if exists public.collections cascade;
