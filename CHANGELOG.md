# Changelog

All notable changes to AI Wiki are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
