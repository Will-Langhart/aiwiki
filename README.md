<div align="center">
  <img src="public/logo.png" alt="AI Wiki logo" width="72" height="72" />
  <h1>AI Wiki</h1>
  <p><strong>Community-curated directory and reference site for AI tools.</strong><br/>
  Browse 200+ tools by category, compare side-by-side, and ask our AI assistant for recommendations.</p>

  <a href="https://aiwiki-orpin.vercel.app"><img src="https://img.shields.io/badge/live-aiwiki--orpin.vercel.app-blue?style=flat-square" alt="Live site" /></a>
  <a href="https://github.com/Will-Langhart/aiwiki/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-TBD-lightgrey?style=flat-square" alt="License" /></a>
  <a href="https://github.com/Will-Langhart/aiwiki/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs welcome" /></a>
</div>

---

## What it is

| Feature | Description |
|---|---|
| **Directory** | 200+ AI tools with structured data, logos, pricing, and audience tags |
| **Tool pages** | Overview, docs, and use cases with a technical / non-technical audience toggle |
| **Compare** | Pick 2–3 tools — structured facts + AI-generated TL;DR side-by-side |
| **Ask AI Wiki** | RAG chat across all published tool content, with source citations |
| **Ratings & reviews** | Signed-in users rate tools and leave written reviews |
| **Bookmarks** | Save tools to your personal list |
| **Submit a tool** | Community submission wizard → admin review → published |

## Tech stack

| Layer | Technology |
|---|---|
| Framework | React Router v7 (SPA mode) + TypeScript |
| Styling | Tailwind v4 + shadcn/ui + CSS design tokens |
| Database | Supabase (Postgres + RLS + Auth + Storage + Realtime) |
| AI | Anthropic Claude API (claude-sonnet-4-6) + OpenAI embeddings |
| Edge Functions | Supabase Deno runtime — chat, compare, discover-tools |
| Deployment | Vercel |

## Getting started

### Prerequisites

- Node 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker (for local Supabase)
- An [Anthropic API key](https://console.anthropic.com)

### 1. Clone & install

```bash
git clone https://github.com/Will-Langhart/aiwiki.git
cd aiwiki
npm install
```

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
VITE_SUPABASE_URL=       # from Supabase project settings
VITE_SUPABASE_ANON_KEY=  # from Supabase project settings
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_URL=
ANTHROPIC_API_KEY=       # sk-ant-...
```

### 3. Local Supabase

```bash
supabase start            # starts local Postgres + Auth + Storage
supabase db reset         # runs all migrations in supabase/migrations/
npm run db:seed           # seeds 14 categories + starter tools
```

### 4. Run

```bash
npm run dev               # Vite dev server
supabase functions serve  # Edge Functions (separate terminal)
```

Open `http://localhost:5173`. To make yourself admin:

```sql
-- in Supabase Studio → SQL Editor
update profiles set is_admin = true where username = 'your-username';
```

## Project structure

```
app/
  routes/           File-based routes (React Router v7)
  components/       Domain components + shadcn/ui primitives
    auth/           AuthModal, OAuth buttons
    chat/           Chat interface + sidebar
    compare/        Compare tray + table
    tool/           ToolCard, ratings, reviews, content blocks
    layout/         AppShell (nav + footer)
  lib/              Supabase clients, theme, density, utils
  stores/           Zustand stores (compare tray, auth modal)
  hooks/            useCurrentUser, etc.
  styles/           globals.css + tokens.css (design system)
supabase/
  migrations/       Numbered SQL migrations (source of truth)
  functions/        Edge Functions: chat, compare, discover-tools
scripts/            Seed, bulk-seed, discover-tools runner
```

## Auth — Google & GitHub OAuth setup

OAuth buttons are built. You just need to wire up the providers in Supabase.

### GitHub OAuth

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
2. Fill in:
   - **Homepage URL**: `https://your-project.supabase.co`
   - **Authorization callback URL**: `https://your-project.supabase.co/auth/v1/callback`
3. Copy the **Client ID** and generate a **Client Secret**
4. In **Supabase Dashboard → Authentication → Providers → GitHub**: paste both, enable it

For local dev, also add `http://localhost:5173` to Supabase's **Allowed redirect URLs** (Auth → URL Configuration).

### Google OAuth

1. Go to **Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client**
2. Application type: **Web application**
3. Add Authorized redirect URI: `https://your-project.supabase.co/auth/v1/callback`
4. Copy **Client ID** and **Client Secret**
5. In **Supabase Dashboard → Authentication → Providers → Google**: paste both, enable it

> Both providers are already wired in `app/components/auth/AuthModal.tsx` — no code changes needed.

## Contributing

### Adding or improving tools

The fastest way to contribute is through the **[Submit a tool](https://aiwiki-orpin.vercel.app/submit)** flow on the live site.

### Code contributions

1. Fork the repo and create a branch: `feat/my-feature` or `fix/my-bug`
2. Follow the conventions in [`CLAUDE.md`](CLAUDE.md) — Biome lint, design tokens, no raw `zinc-*` classes
3. Open a PR with: what changed, why, and screenshots for any UI changes
4. PRs that touch `supabase/migrations/` must include the migration SQL in the PR description

### What we'd love help with

- [ ] More tool entries (submit via the site or open a PR against the seed data)
- [ ] Tool screenshots / better logo coverage
- [ ] Playwright E2E tests for the compare and chat flows
- [ ] i18n / translations
- [ ] Dark mode refinements and accessibility audit

### Code style quick-ref

| Rule | Detail |
|---|---|
| Formatter | Biome (`npm run format`) |
| Linter | Biome (`npm run lint`) |
| Imports | `@/` alias for everything under `app/` |
| Styling | Design tokens only — `bg-bg`, `text-text-muted`, `border-border` |
| State | URL params → React state → Zustand (in that order) |
| Data fetching | React Router loaders (server) or TanStack Query (client) |

## Documentation

| File | Purpose |
|---|---|
| [`SPEC.md`](SPEC.md) | Full product spec — data model, routes, design tokens, build phases |
| [`CLAUDE.md`](CLAUDE.md) | Working instructions for Claude Code in this repo |
| [`CHANGELOG.md`](CHANGELOG.md) | Per-release notes |

## License

TBD before v1 launch. Code will be permissive (MIT or Apache-2.0); tool entries will be Creative Commons to encourage reuse.
