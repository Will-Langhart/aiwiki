# SPEC Amendment — Public Answer Pages (the answer-engine flywheel)

> **Status:** Proposed amendment — pending review, not yet merged into `SPEC.md`
> **Owner:** Lang
> **Date:** 2026-08-05
> **Amends:** `SPEC.md` §4 (Data Model), §5 (Route Map), §10 (AI Integration Surface), §11/§14 (SEO & performance)
> **Depends on:** the chat funnel analytics module (`app/lib/analytics.ts`) and the
> `[tool:slug]` citation convention already shipped.

This is a foundational addition: it introduces a **new public route family** and a
**new content model**. Per `prelaunch-plan.md`, a new product concept must be added
to the spec before implementation. Once reviewed, fold the sections below into
`SPEC.md` at the indicated anchors and delete this file.

---

## 0. Motivation & the one binding decision

AI Wiki's chat (`/chat`) produces genuinely good, directory-grounded answers, but
they are private, client-rendered (SPA), and invisible to search engines. A
directory's growth model is long-tail search intent — "best AI tool for X", "X vs
Y", "free alternative to Z". **Public answer pages turn the assistant's best
answers into indexable content**, so usage produces the SEO surface instead of a
human hand-writing hundreds of pages.

```
visitor asks a question  ──▶  grounded, cited answer (chat, already built)
                                        │
                     an editor promotes the good ones (curation gate)
                                        │
                     /answers/:slug  — prerendered, FAQPage schema, cited tools
                                        │
                     Google indexes it ──▶ new visitor lands ──▶ asks ──▶ loop
```

**Binding decision (v1): editor-curated only.** Answer pages are created and
published exclusively by an admin. There is **no** user submission and **no**
auto-publishing, mirroring the enrichment pipeline's "never auto-publish" stance
(`SPEC.md` §10.6). Rationale: auto-published LLM Q&A is exactly what search
engines' helpful-content/spam systems penalize; a human curation gate is the moat,
not the bottleneck, at our volume. User-submitted and auto-promoted answers are
explicit non-goals (see §E) and require a future amendment.

---

## A. Data Model — add as `SPEC.md` §4.10

New migration `0027_public_answers.sql`. Regenerate `app/types/database.ts`.

```sql
-- Public, editor-curated answer pages ("best X for Y", "X vs Y", etc.).
-- These are the indexable SEO surface for the AI assistant. Never auto-published.
create table public.public_answers (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,          -- "best-free-ai-image-generators"
  question          text not null,                 -- H1 / the FAQ question
  answer_md         text not null,                 -- curated markdown; may contain [tool:slug]
  summary           text,                          -- meta description / OG (<=160 chars)
  tool_ids          uuid[] not null default '{}',  -- cited tools, ordered → ItemList + links
  category_id       uuid references public.categories(id) on delete set null, -- optional hub link
  source_message_id uuid references public.chat_messages(id) on delete set null, -- provenance
  status            text not null default 'draft'
                      check (status in ('draft','published','archived')),
  curated_by        uuid references public.profiles(id) on delete set null,
  view_count        int not null default 0,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index public_answers_status_idx    on public.public_answers (status, published_at desc);
create index public_answers_category_idx   on public.public_answers (category_id);

-- Reuse the generic updated_at trigger from migration 0024.
create trigger public_answers_set_updated_at
  before update on public.public_answers
  for each row execute function public.set_updated_at();
```

**Notes**
- `answer_md` reuses the `[tool:slug]` convention. The page renderer reuses
  `MarkdownRenderer`'s new `components` prop (shipped in the chat trust-&-polish
  work) so inline mentions render as client-side links to tool pages — identical
  to chat citations. No new markdown machinery.
- `tool_ids` must reference **published** tools; enforced in the admin editor and
  re-checked at publish (a stripped/archived tool blocks publish or is dropped).
- `source_message_id` records provenance when an answer is promoted from a real
  chat message (nullable — admins may also author from scratch).

### RLS — add to `SPEC.md` §4.7

```sql
alter table public.public_answers enable row level security;

-- Public can read only published answers (prerender uses the service role).
create policy "public_answers_read_published"
  on public.public_answers for select using (status = 'published');

-- Admins do everything (create/edit/publish/archive).
create policy "public_answers_admin_all"
  on public.public_answers for all using (public.is_admin());
```

### Rebuild trigger — extend `SPEC.md` §4.8

Publishing (or updating a published) answer must trigger a Vercel rebuild so the
new static page ships, mirroring `trigger_vercel_rebuild()` on `tools`:

```sql
create trigger on_public_answer_published
  after insert or update on public.public_answers
  for each row
  when (new.status = 'published')
  execute function public.trigger_vercel_rebuild();  -- reuse existing fn
```

---

## B. Route Map — add to `SPEC.md` §5

| Route | Rendering | Layout | Purpose |
|---|---|---|---|
| `/answers` | Prerender | RootLayout | Hub: lists published answers, grouped by category |
| `/answers/:slug` | Prerender per published slug | RootLayout (comfortable) | A single curated answer page |
| `/admin/answers` | SPA (admin) | AdminLayout | Answer queue + editor entry |
| `/admin/answers/:id` | SPA (admin) | AdminLayout | Create/edit/publish an answer |

**Rendering strategy:** `/answers` and every published `/answers/:slug` are
**prerendered at build time** (SEO + speed), following the established
`loader` + `clientLoader` pattern (`SPEC.md` SEO note; see the
`seo-loader-prerender` convention) so the answer HTML ships static for crawlers
and hydrates for navigation. Draft/archived answers are **never** prerendered and
return 404 publicly (RLS enforces it).

### `react-router.config.ts` prerender addition

Extend `prerender()` to include published answers (alongside tools/categories/
compares):

```ts
const { data: answers } = await supabase
  .from('public_answers')
  .select('slug')
  .eq('status', 'published');

const answerPaths = (answers ?? []).map(a => `/answers/${a.slug}`);
// return [...existing, '/answers', ...answerPaths];
```

### Sitemap — `scripts/generate-sitemap.ts`

Add `/answers` and all published `/answers/:slug` with `lastmod = published_at`
(or `updated_at`). Drafts are excluded. Keep the same helper both the prerender
config and the sitemap script consume (mirrors `app/lib/compare-paths.ts`).

---

## C. Page contract & structured data — add to `SPEC.md` §11 (SEO)

Each `/answers/:slug` page renders:

1. **`<h1>` = `question`**, `summary` as the intro/meta description.
2. **Answer body** — `answer_md` via `MarkdownRenderer`, inline `[tool:slug]` →
   client-side tool links.
3. **Cited tools** — the `tool_ids` rendered as `ToolCard`s (internal links; the
   crawlable link equity into tool pages is the point).
4. **Breadcrumb** — Home ▸ Answers ▸ (Category) ▸ Question.
5. **A conversational CTA** — "Ask a follow-up" → `/chat?q=<question>&src=answer`
   (closes the flywheel; `src=answer` is a new `ChatSource`).

**Structured data (JSON-LD)** — reuse `app/lib/seo.ts` helpers:
- `FAQPage` with a single `Question` (`question`) → `Answer` (plain-text of
  `answer_md`). Only emit when the answer genuinely fits Q&A shape.
- `ItemList` of the cited tools (ordered), each an internal URL.
- `BreadcrumbList`.
- Canonical, Open Graph, Twitter (default OG image — no per-answer image in v1).

**Performance:** these are static, content-light pages — they must meet the same
budget as tool pages in `SPEC.md` §14 (Lighthouse Performance ≥ 95, LCP < 2s).

---

## D. Curation workflow — add as `SPEC.md` §10.8

### D.1 Creating an answer (admin only)

Two entry points, one destination (the `/admin/answers/:id` editor):

- **Promote from chat.** In the admin view of a chat answer, a "Promote to answer
  page" action pre-fills a new `public_answers` draft from that `chat_messages`
  row: `question` from the preceding user message, `answer_md` from the assistant
  content, `tool_ids` from its `tool_citations`, `source_message_id` set.
- **Author from scratch.** "New answer" opens an empty draft.

### D.2 The editor

Fields: `slug` (auto-suggested from `question`, editable, uniqueness-checked),
`question`, `answer_md` (markdown editor with live preview reusing the public page
renderer), `summary`, `tool_ids` (searchable tool picker; published tools only),
`category_id` (optional). A live preview renders exactly as the published page.

### D.3 State machine

```
draft ──(publish)──▶ published ──(archive)──▶ archived
  ▲                      │
  └──────(unpublish)─────┘
```

- `draft → published`: requires non-empty `question`, `answer_md`, a valid unique
  `slug`, and all `tool_ids` referencing **published** tools. Sets
  `published_at`, `curated_by`; the DB trigger fires the Vercel rebuild.
- `published → archived` / `→ draft`: page 404s publicly on next build; removed
  from sitemap. Use `archived` for retired content (keeps the row + provenance).

### D.4 Quality gate (the anti-thin-content rule)

Publishing is a deliberate human act. Guidance encoded in the editor and review
habit (not auto-enforced beyond the field checks above):
- Each page answers one distinct user job with substantive, unique prose — no
  near-duplicate permutations, no empty combinations (mirrors `prelaunch-plan.md`
  P1.2's indexing thresholds).
- **Optional future gate:** an LLM consistency check (does `answer_md` only make
  claims supported by the cited tools' verified facts?) before publish, logged to
  `llm_usage` under a new `answer_consistency` feature. Out of scope for v1;
  noted so the check-constraint migration is anticipated.

---

## E. Funnel instrumentation — extend `app/lib/analytics.ts`

Add to the typed `EventMap` (same privacy rules — enums/counts only):

| Event | Fires when | Properties |
|---|---|---|
| `answer_view` | An answer page becomes viewable | `channel`, `signed_in`, `has_category` |
| `answer_tool_click` | Click from an answer to a cited tool page | `signed_in`, `source: "card" \| "inline"` |
| `answer_followup_click` | Click the "Ask a follow-up" CTA → `/chat` | `signed_in` |

Add `"answer"` to the `ChatSource` union so a follow-up conversation started from
an answer page is attributable (`/chat?q=…&src=answer`). This closes the loop:
`answer_view → answer_tool_click | answer_followup_click → chat_start(source=answer)`.

---

## F. Non-goals (v1) — explicit, require a future amendment to change

- **No user-submitted answers.** Editor-curated only.
- **No auto-publishing.** No pipeline promotes answers without a human publish.
- **No comments / ratings on answers.**
- **No per-answer generated OG images** (default site OG only).
- **No answer versioning UI** (`updated_at` is the only history in v1).
- **No programmatic permutation generation** — every page is a deliberate,
  reviewed piece of content selected from demonstrated intent (real chat logs /
  search demand), not a generated matrix.

---

## G. Rollout

1. Ship migration `0027` + regenerate types + RLS + rebuild trigger.
2. Build the admin editor and the public `/answers/:slug` + `/answers` routes;
   wire prerender + sitemap.
3. Seed **5–10** high-intent Q&As promoted from real `chat_messages` logs
   (questions people actually asked), reviewed and published by hand.
4. Link `/answers` from the footer (and the `/chat` header once populated).
5. Submit the new sitemap section to Search Console; watch indexing +
   `answer_view → answer_tool_click` for ~2–3 weeks before scaling the count.
6. Only expand the page count once the first cohort demonstrably indexes and
   converts — never bulk-publish ahead of that signal.

---

## H. Effort / touch-list (for planning)

- `supabase/migrations/0027_public_answers.sql` (+ apply via Supabase MCP, given
  the known `db push` history mismatch) and `npm run db:types`.
- `app/routes/answers._index.tsx`, `app/routes/answers.$slug.tsx`.
- `app/routes/admin.answers._index.tsx`, `app/routes/admin.answers.$id.tsx`.
- `app/components/answer/*` (AnswerEditor, ToolPicker, public renderer wrapper).
- `react-router.config.ts` prerender + `scripts/generate-sitemap.ts` +
  a shared `app/lib/answer-paths.ts` helper.
- `app/lib/seo.ts` (FAQPage + ItemList JSON-LD helpers).
- `app/lib/analytics.ts` (3 events + `ChatSource` "answer").
- `app/components/layout/AppShell.tsx` footer link; optional `/chat` header link.
- Admin nav entry (`AppShell` UserMenu already links `/admin`).
