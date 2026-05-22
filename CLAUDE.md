# CLAUDE.md — Working Instructions for Claude Code

> This file primes you (Claude Code) on how to work effectively in this repo. Read `SPEC.md` first for the full product and architecture. This file is the **operating manual** — how to make changes, what conventions to follow, and where to look for what.

---

## Repo identity

**AI Wiki** — a community-curated directory and reference site for AI tools. Tech stack: React Router v7 (framework mode) + TypeScript + Tailwind + shadcn/ui + Supabase + Vercel. Full details in `SPEC.md`.

## Source of truth

1. **`SPEC.md`** — the binding spec. If anything in code contradicts it, surface the conflict; don't silently diverge.
2. **`supabase/migrations/`** — the database is what the migrations say it is. Schema changes go through new migration files, never by editing old ones.
3. **`app/types/database.ts`** — auto-generated from Supabase. Don't hand-edit; regenerate with `npm run db:types`.

## Project conventions

### Code style
- **Biome** is the formatter and linter (not Prettier + ESLint). Run `npm run lint` and `npm run format`.
- TypeScript strict mode is on. `any` is forbidden; use `unknown` and narrow.
- Path alias `@/` resolves to `./app/`. Always use it for internal imports; never use long relative paths like `../../../lib/x`.
- Components are PascalCase files in PascalCase folders matching their feature area (e.g., `app/components/tool/ToolCard.tsx`).
- Hooks are `useFoo.ts` files in `app/hooks/`.
- Server-only modules end in `.server.ts`. Build-time-only modules also end in `.server.ts`.

### React patterns
- Function components only. No class components.
- Server-side data via React Router loaders. Client-side data via TanStack Query.
- Forms via React Hook Form + Zod resolver. No uncontrolled inputs except `<input type="file" />`.
- State: prefer URL state (search params) > React state > Zustand. Only reach for Zustand when state must persist across routes (compare tray, theme, density, audience toggle).
- Suspense boundaries are mandatory around any component that triggers a query.

### Tailwind / styling
- Always use the design tokens defined in `app/styles/tokens.css` via CSS variables (e.g., `bg-bg`, `text-text-muted`, `border-border`). Never use raw `zinc-*` classes — they break theme switching.
- Density-sensitive spacing uses `var(--space-section)` and `var(--space-element)`. Don't hardcode `mt-8` or `gap-6` for things that should adapt to density.
- shadcn components are owned in-repo at `app/components/ui/`. Customize them in place; don't wrap them just to change a class.

### Supabase
- All DB access through `app/lib/supabase.client.ts` (browser) or `app/lib/supabase.server.ts` (build-time / Edge Function).
- Never use the service role key in client code. Service role is **only** for: `react-router.config.ts` prerender, scripts, and Edge Functions.
- RLS is the security boundary. Don't add `if (user.is_admin)` checks in client code as the primary defense — write the RLS policy.
- New tables require a migration, the RLS policy, and an entry in `app/types/database.ts` (regenerate).

### Edge Functions
- Each lives in its own folder under `supabase/functions/`.
- Shared helpers go in `supabase/functions/_shared/`.
- Every Edge Function that calls an LLM **must** write a row to `llm_usage` and check the per-feature daily cost cap before the call.
- All LLM responses use structured output (JSON schema) where the response will be parsed; never regex-parse free-form text.

### Git / PRs
- Branch names: `feat/...`, `fix/...`, `chore/...`, `db/...` (for migrations), `docs/...`.
- Conventional commits. Squash-merge to `main`.
- Every PR includes: what changed, why, screenshots for UI changes, and notes any DB migration that needs applying.
- If a PR touches `SPEC.md`, that's the signal that a foundational decision shifted — flag it loudly.

## How to add a feature (worked example)

Suppose the task is: "Add a 'related tools' sidebar on tool pages."

1. **Check the spec.** Search `SPEC.md` for "related" — confirm whether this is in scope, deferred, or net new. If net new, propose adding it to the spec first.
2. **Identify routes touched.** `tools.$slug.tsx` (the parent route) — sidebar lives in the layout.
3. **Identify data needed.** Probably an RPC `related_tools(tool_id uuid, limit int)` that returns tools sharing categories or tags. Define it in a new migration `0010_related_tools_function.sql`.
4. **Update generated types.** `npm run db:types`.
5. **Component.** Build `<RelatedTools>` in `app/components/tool/RelatedTools.tsx`. Density: comfortable. Style with tokens.
6. **Wire data.** Loader in `tools.$slug.tsx` calls the RPC and passes to layout.
7. **Tests.** Vitest unit test for the RPC client wrapper. Playwright assertion that the sidebar renders on a tool page.
8. **Prerender.** Confirm the RPC is callable from the prerender environment (it is — `react-router.config.ts` uses the same Supabase client). Re-run `npm run build` and check the static HTML includes the sidebar.

## Things to never do without explicit permission

- Add a new third-party dependency. (We are already at scope; new deps need justification.)
- Change the rendering strategy of a route (prerender ↔ SPA).
- Add an unauthenticated mutation endpoint.
- Bypass RLS with the service role key in user-facing code.
- Add tracking/analytics beyond what's in `SPEC.md §2`.
- Reach for a CMS or external content service to replace the Supabase content model.
- Touch `auth.users` directly. Use `profiles` and let the trigger in `0008` keep them in sync.

## Things you should proactively do

- When uncertain about a UX detail, **render two variants** and ask which is preferred.
- When a query is slow, **explain analyze** it and propose an index in a follow-up migration.
- When LLM cost shows up in `llm_usage` higher than expected, **report and propose throttling** before implementing more LLM features.
- When the spec is ambiguous, surface the ambiguity and propose a resolution.
- Keep `CHANGELOG.md` updated per PR.

## Useful commands

```bash
npm run dev                       # Vite dev server
npm run build                     # Production build (prerender + bundle)
npm run preview                   # Preview production build locally

supabase start                    # Local Supabase
supabase db reset                 # Re-run all migrations from scratch
supabase db diff -f <name>        # Generate a new migration from local changes
supabase functions serve          # Serve Edge Functions locally
supabase functions deploy <name>  # Deploy a single Edge Function

npm run db:types                  # Regenerate app/types/database.ts
npm run db:seed                   # Seed categories + 14 starter tools
npm run lint                      # Biome lint
npm run format                    # Biome format
npm run test                      # Vitest
npm run test:e2e                  # Playwright

vercel                            # Deploy a preview
vercel --prod                     # Deploy to production
vercel env pull                   # Pull production env vars to .env.local
```

## When in doubt

- The spec wins.
- Then the migrations.
- Then the existing patterns in the codebase.
- Then ask.
