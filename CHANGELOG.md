# Changelog

All notable changes to AI Wiki are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **"Featured on AI Wiki" badge + claim your listing.** `/claim/:slug` gives
  any listed tool an embeddable badge (dark/light SVG at `/badges/`, HTML and
  Markdown snippets linking back with `?ref=badge`), and lets a signed-in maker
  claim the listing via `claim_tool()`: an email on the tool's website domain
  verifies instantly, anything else goes to `/admin/claims` for review.
  Verified listings show a "Verified by maker" mark; unclaimed tool pages link
  to the claim page. Migration `0031` adds `tool_claims` (RLS: verified claims
  public, own claims private, admins all; inserts only through the function).
- **Watch a tool for changes.** Tool pages get a "Get alerts when {tool}
  changes" card — the sign-up hook for search visitors. Logged out it opens the
  auth modal and returns to the page with `?watch=1`, which completes the watch;
  logged in it toggles a bookmark. When an enrichment refresh writes a notable
  change (pricing tier, free tier, starting price, plans, API, open source,
  self-hosting), every bookmarker gets a `tool_updated` notification, emailed by
  the existing trigger unless they opted out. Migration `0030` adds the type.
- **"Where next" on tool pages.** Alternatives (6 same-category tools), three
  head-to-head compare links, and a link to the category page — rendered from
  loader data, so they ship as internal links in the prerendered HTML.
- **Category pages.** `/categories/:slug` replaces the "coming in Phase 1"
  placeholder for all 27 categories: icon, description and live stats (tools,
  free options, with API, open source), URL-state filters (pricing / API /
  open source) and sort, the tool grid, and links to every other category.
  Prerendered per category with Breadcrumb + ItemList JSON-LD and indexable
  meta; landing-page category tiles now link here.
- **Landing hero refresh.** Real tool logos orbit the headline on two tilted
  rings over a brighter galaxy backdrop, with a cursor spotlight, a staggered
  entrance, and a slowly rotating accent ring on the Ask box. Below the fold,
  sections fade up as they scroll in and carry eyebrow labels. All CSS-only
  (transform/opacity), off under `prefers-reduced-motion`, decorative layers
  hidden on phones; prerendered HTML stays fully visible for crawlers.
- **Enrichment refresh mode.** `uv run enrich --refresh <slug>` /
  `--refresh-batch N` re-enriches published tools in place and auto-applies
  the result when verified (not admin-edited, critic-approved, confidence ≥ 0.7,
  name still matches); otherwise parks a proposal on `enrichment_jobs` for
  `--apply-job`. Never changes status, publish date, slug, name, category or
  logo; never overwrites a value with null. Migration `0029` adds
  `enrichment_jobs.mode/proposal/applied_fields` and the `applied` status.
  **SPEC §10.6 updated** — the pipeline can now write to published tools.
- **Batch new-tool enrichment.** `uv run enrich --file urls.txt`, skipping URLs
  that match an existing tool before any LLM spend.
- **Agent QA seed entry.** Add YAML-based web and mobile regression testing to
  the Coding & development catalog, with software license and provider costs.
- **Chat funnel analytics.** New typed, centralized analytics module
  (`app/lib/analytics.ts`) wrapping Vercel Web Analytics custom events, with
  privacy-preserving channel resolution (referrer host → enum; never PII, raw
  referrer URLs, or free-form chat text). Instruments the chat surface:
  `landing_view`, `chat_start` (attributed by entry source — home hero, teaser,
  deep link, or composer), `chat_message_sent`, `recommendation_shown`, and
  `citation_click` (chat → tool).
- **Wayfinding header on `/chat`.** The standalone chat route (outside AppShell)
  now has a minimal header — logo → home, Browse, Compare — so it is no longer a
  navigational dead-end.
- **Chat trust & polish.** The assistant now shows a "Searching the directory…"
  status while it runs retrieval (previously hidden behind a generic spinner);
  inline tool mentions render as clickable links to the tool page (client-side
  navigation, tracked as `citation_click`); and each answer gains Stop (cancel
  streaming), Copy, and Retry (on error) controls. `MarkdownRenderer` gained an
  optional `components` prop to support the client-side citation links.
- **Save from chat.** Recommendation cards in a chat answer now have a one-tap
  "save to bookmarks" control — auth-gated for signed-out visitors — turning a
  recommendation into a saved tool (and an account signal). Tracked as
  `chat_save`.

### Fixed

- **Bookmark on a tool page sent logged-out visitors to `/submit`.** It now
  opens the sign-in modal and returns them to the tool. The category breadcrumb
  (UI and JSON-LD) now links to `/categories/:slug` instead of `/tools`.
- **Landing page scroll jank.** The hero's three star layers animated
  `background-position`, repainting the whole hero every frame on the main
  thread. They now translate on the compositor (static tile on an overhanging
  layer, edge fade on a static wrapper), and all hero animations pause while
  the hero is scrolled out of view. Scroll jank at 4× CPU throttle: 36 → 5
  dropped frames, 31.6 → 19.1 ms average frame.
- **Stale counts on the landing page.** Hero copy, meta description and the
  category blurb said "190+ tools" / "14 categories"; they now use the live
  counts (552 tools / 27 categories). Light theme: the headline gradient's white
  highlight was hard to read, now mixed toward the text colour.
- **Enrichment batches can no longer hang on Supabase.** A refresh batch sat
  for 47 minutes on one tool: postgrest-py's default HTTP/2 connection died
  silently and its 120s timeout never fired. The service now talks to Supabase
  over HTTP/1.1 with a 30s read timeout, and CLI batches fail any tool that runs
  past `ENRICH_TOOL_DEADLINE_S` (600s) and move on.
- **Browse page dropped tools past 500.** `/tools` requested `page_size: 500`,
  so once the catalog reached 552 published tools the unfiltered grid silently
  lost the last 52 (T–Z, e.g. tldraw, Tome, Zed, Warp). Raised to 1000 (the
  PostgREST `max_rows` ceiling); the search placeholder now shows the real
  count instead of a hardcoded "463".
- **Enrichment LLM calls can no longer hang forever.** Anthropic's client
  defaults to no request timeout; one stalled call held the 2026-10 batch on
  textio.com for ~5h. Calls now time out after `ENRICH_LLM_TIMEOUT_S` (90s)
  with 2 retries, so a hang fails that one tool and the batch moves on.
- **Seed scripts no longer wipe enriched content.** `scripts/seed.ts` and
  `scripts/seed-bulk.ts` used to delete every content block for each tool and
  reset `status`/`published_at` on re-run, destroying enrichment-pipeline
  output (19 bulk tools had docs/use-case/overview blocks at risk). They now
  insert only missing slugs and skip existing ones; `--update` refreshes tool
  fields only, never content blocks, status or publish date.
- **Enrichment create mode can no longer unpublish a live tool.** It used to
  upsert on slug with `status='draft'` and delete all content blocks; it now
  refuses existing slugs.
- **Auth modal on `/chat`.** The chat route (which lives outside `AppShell`) now
  renders `AuthModal`, so the sidebar "Sign in" button and the new
  save-to-bookmarks prompt actually open a dialog — previously they set store
  state with no modal mounted to react to it.

### Changed

- **Chat RAG: hybrid retrieval, relevance-aware prompt.** The `search_tools`
  agent tool now calls `match_tools_hybrid` (pgvector ANN + tsvector FTS fused
  via Reciprocal Rank Fusion) instead of pure vector search, so exact-name and
  jargon queries land alongside paraphrases. Results are returned ranked
  best-first with a per-hit relevance label (strong / good / weak / keyword
  match) so the model can down-weight marginal matches. The system prompt was
  rewritten to exploit this: date grounding (directory is the authority on
  pricing), a faithfulness section (concrete facts — price, tier, API — must
  come from tool results, never memory), permission to run multiple searches
  for multi-part needs, and a compact few-shot of the recommendation shape.
- **Conversational-first home hero.** The hero input now seeds an AI Wiki
  conversation (`/chat`) instead of a keyword search, and example-question chips
  replace the old keyword chips — making the AI assistant the primary entry
  point.
- **Global nav on the landing page.** Browse / Compare / Ask AI are now shown on
  the home page (previously hidden there), with "Ask AI" promoted as the primary
  conversational call to action.

### Security

- **Chat: enforce the anonymous rate limit.** The `chat` edge function declared
  `ANON_LIMIT = 5` but only ever checked it for authenticated users, so
  anonymous traffic was bounded solely by the global daily cost cap — a single
  client or crawler could drain the budget and take chat down for everyone. Anon
  requests are now capped per-IP per-day (salted SHA-256 of the IP; the raw
  address is never stored), enforced before any model spend. Adds the
  `anon_chat_usage` table and atomic `bump_anon_chat_usage()` RPC
  (migration `0025`).
- **Lock down public reference tables with RLS.** `categories`, `tags`,
  `tool_categories`, and `tool_tags` had RLS disabled, so the anon key (shipped
  in the client bundle) could read and write every row. Enabled RLS with
  public-read / admin-write policies. `notification_email_log` is now RLS-locked
  to the service role only (migration `0026`).
