-- Answer engine: AI-drafted answer pages, human-published
--
-- The draft-answer Edge Function turns a real visitor question into a grounded
-- public_answers DRAFT (never published — answer-pages-spec §D, as amended).
-- It logs spend under the new llm_usage feature 'answer_draft', and stores the
-- problems its deterministic consistency check found in review_flags so the
-- editor can show them before an admin publishes.
--
-- Depends on 0038 (admins read chat_messages — the "Questions people ask" list).

alter table public.llm_usage drop constraint if exists llm_usage_feature_check;
alter table public.llm_usage add constraint llm_usage_feature_check check (feature in (
  'url_to_draft', 'chat', 'compare_summary', 'moderate_comment', 'embed_tool',
  'semantic_search', 'discover_tools', 'reenrich_tools',
  'enrich_extract', 'enrich_categorize', 'enrich_verify', 'enrich_write', 'enrich_critique',
  'eval_enrich_extract', 'eval_enrich_categorize', 'eval_enrich_verify',
  'eval_enrich_write', 'eval_enrich_critique', 'eval_judge',
  'answer_draft'
));

-- [{ "kind": "unknown_tool" | "unverified_price" | "uncited_tool" | ..., "detail": text }]
-- Empty for hand-written answers and for drafts that passed every check.
alter table public.public_answers
  add column if not exists review_flags jsonb not null default '[]'::jsonb;
