# Changelog

All notable changes to AI Wiki are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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

### Changed

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
