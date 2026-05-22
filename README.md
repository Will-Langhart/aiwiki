# AI Wiki

A community-curated directory and reference site for AI tools. Browse, compare, and learn about 100+ AI products with structured data, audience-aware content, and an AI-powered chat interface that searches and summarizes across the whole catalog.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com)

---

## What it is

- **Directory** — 100+ AI tools, organized by category, with structured comparison data
- **Tool pages** — Overview, docs, and use cases for each tool, with a technical/non-technical audience toggle
- **Side-by-side compare** — Pick 2–3 tools, see facts and AI-generated TL;DRs lined up
- **Community submissions** — Anyone can submit a tool; admin review polishes and publishes
- **Ask AI Wiki** — RAG chat across all published tool content, with source citations
- **Bookmarks + ratings** — Signed-in users save tools and rate what they've used

## Tech stack

React Router v7 (framework mode) · TypeScript · Vite · Tailwind · shadcn/ui · Supabase (Postgres + Auth + Storage + Edge Functions + Realtime) · Vercel · Resend · Anthropic Claude API · OpenAI embeddings

## Architecture in one paragraph

Most pages are **prerendered at build time** — `react-router.config.ts` reads the published tool list from Supabase and emits static HTML for every tool's overview/docs/use-cases routes plus popular comparison combinations. Dynamic surfaces (search, chat, submission wizard, admin) run as **SPA** in the same app. Database mutations from admins fire **Vercel deploy hooks** to rebuild. AI features (URL-to-draft autofill, compare TL;DR, semantic search, chat) live in **Supabase Edge Functions** with per-feature cost caps tracked in `llm_usage`.

## Getting started

```bash
# 1. Clone and install
git clone <repo-url> ai-wiki
cd ai-wiki
npm install

# 2. Set up env
cp .env.example .env.local
# Fill in SUPABASE_URL, ANTHROPIC_API_KEY, etc.

# 3. Set up Supabase locally
supabase start
supabase db reset                # applies all migrations
npm run db:seed                  # seeds categories + 14 starter tools

# 4. Run dev
npm run dev                      # Vite dev server on :5173
supabase functions serve         # Edge Functions on :54321 (in another terminal)
```

Visit `http://localhost:5173`. Sign up at `/auth`, then promote your user to admin via SQL:

```sql
update profiles set is_admin = true where username = '<your-username>';
```

## Project structure

```
app/                  React Router v7 app source
  routes/             File-based routes
  components/         UI primitives (shadcn) and domain components
  lib/                Supabase clients, hooks, utilities
  styles/             Global CSS + design tokens
supabase/
  migrations/         Database schema (run in order)
  functions/          Edge Functions (Deno)
scripts/              Build-time helpers (seed, sitemap)
```

Full layout in `SPEC.md §13`.

## Documentation

- **`SPEC.md`** — Full product spec, data model, route map, design tokens, phased build plan. Read this first.
- **`CLAUDE.md`** — Working instructions if you're using Claude Code in this repo.
- **`CHANGELOG.md`** — Per-release notes.

## Status

Pre-launch. Tracking against the phased build plan in `SPEC.md §15`.

| Phase | Status |
|---|---|
| 0 — Foundation | Not started |
| 1 — Directory + Tool Pages | Not started |
| 2 — Compare + Bookmarks | Not started |
| 3 — Submissions Flow | Not started |
| 4 — Notifications + Ratings | Not started |
| 5 — AI Features | Not started |
| 6 — v1.1: Comments + Polish | Not started |

## License

TBD before v1 launch. Likely permissive for the code, with content (tool entries) under a Creative Commons license to encourage contribution and reuse.

## Contributing

Once v1 ships, community submissions happen through the `/submit` flow in the site itself. Code contributions via PR — see `CLAUDE.md` for conventions.
