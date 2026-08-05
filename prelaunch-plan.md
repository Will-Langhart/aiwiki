# Prelaunch Growth Plan (AI Wiki)

## Goal

Build a measurable prelaunch growth loop that helps visitors find a useful AI tool in under 60 seconds, then gives high-intent visitors a clear reason to return.

## Scope Decision

This plan authorizes first-party product analytics for the event set defined below and a homepage message experiment. This is a deliberate extension of the page-view and Web Vitals analytics named in `SPEC.md` §2. It does **not** authorize third-party ad pixels, cross-site tracking, or analytics beyond these prelaunch funnels.

The binding product and architecture decisions in `SPEC.md` still win. New product concepts in this plan—onboarding, follows, public lists, and lifecycle digests—must be added to the spec before implementation if they change launch scope, data models, or route rendering strategy.

## Working Rules

- Optimize one funnel bottleneck at a time; do not ship the whole plan as one project.
- Preserve prerendering and the performance budgets in `SPEC.md` §14.
- Use anonymous, privacy-conscious properties; never send email addresses, names, free-form search text, or other personal data to analytics.
- Gate account creation only after a visitor expresses intent (save or follow), never on first page view.
- Every shipped experiment needs an owner, start date, primary metric, guardrail, and stop date.
- Update `CHANGELOG.md` with each implementation PR.

## Repo Baseline (July 3, 2026)

Legend: **Available** exists in the repo; **Partial** needs validation or extension; **New** is not yet implemented.

| Capability | Status | Evidence / implication |
|---|---|---|
| Vercel Web Analytics | Available | Mounted globally in `app/root.tsx`; custom funnel events are not instrumented. |
| Homepage discovery experience | Available | Search, categories, featured tools, comparison spotlights, and AI prompts exist. Messaging still needs a focused experiment. |
| Tool bookmarks + soft auth prompt | Available | Bookmarking and account bookmarks exist; signed-out actions open auth. Instrument and validate rather than rebuild. |
| Category landing pages | Available | `/categories/:slug` exists with route metadata. Audit content depth and internal linking. |
| Shareable comparison pages | Partial | Canonical slug routes, metadata, and structured data exist in the current working tree. Validate indexing and ship before treating as complete. |
| Tool-page SEO | Partial | Canonicals, Open Graph/Twitter metadata, `SoftwareApplication`, and breadcrumbs exist. Rich-results and crawl validation remain. |
| First-visit onboarding | New | No interest-selection or instant recommendation flow found. |
| Follow category/tag/tool | New | Requires a product decision, schema, RLS, and notification behavior. |
| Public lists/collections | New | Requires spec, schema, RLS, routes, moderation rules, and OG behavior. |
| Growth dashboard | New | Define from supported Vercel Analytics views before considering another tool. |

## Measurement Framework

### Core funnel

1. Landing page visit
2. Tool detail view
3. High-intent action (compare, save, or follow)
4. Signup completion
5. Return visit within 7 days

### Event contract

Use these exact names. Keep properties low-cardinality and drawn from controlled values.

| Event | Fires when | Required properties |
|---|---|---|
| `landing_view` | Homepage becomes viewable | `route`, `channel`, `signed_in` |
| `tool_view` | Tool detail becomes viewable | `route`, `channel`, `category`, `signed_in` |
| `compare_click` | Visitor opens or commits a comparison | `route`, `source`, `tool_count`, `signed_in` |
| `save_click` | Visitor attempts to save a tool | `route`, `category`, `signed_in`, `result` |
| `follow_click` | Visitor attempts to follow an entity | `route`, `entity_type`, `signed_in`, `result` |
| `signup_start` | Auth flow opens from a measured prompt | `route`, `source`, `intent` |
| `signup_complete` | Auth callback completes successfully | `source`, `intent` when attribution is available |
| `return_visit_7d` | Same anonymous or signed-in visitor returns within 7 days | `landing_route`, `signed_in` |

Allowed enums must be centralized in one typed analytics module. `channel` should resolve to `organic`, `direct`, `referral`, `social`, or `unknown`; do not send raw referrer URLs.

### Decision metrics

| Metric | Definition | Initial use |
|---|---|---|
| Landing → tool view | Unique sessions with `tool_view` / sessions with `landing_view` | Primary activation metric |
| Time to first meaningful action | Time from `landing_view` to first tool view, compare, save, or follow | Activation speed |
| Qualified visit → signup | Sessions with a high-intent action that complete signup / sessions with a high-intent action | Conversion |
| 7-day return rate | Visitors with `return_visit_7d` / eligible first-time visitors | Retention |
| Tool-view failure rate | Tool page errors or empty states / tool views | Guardrail |
| Tool-page LCP | p75 LCP on tool pages | Must remain under 2 seconds |

Record baseline values before setting numeric uplift targets. The first seven complete days after event validation are the baseline window.

## Execution Backlog

### P0 — Establish signal and improve first value

#### P0.1 Instrument the core funnel

- **Owner:** TBD
- **Dependency:** Vercel custom-event support and privacy review
- **Status:** Ready
- [ ] Create one typed analytics helper with the event names and property contracts above.
- [ ] Instrument homepage, tool pages, compare actions, bookmark intent, auth start, and auth completion.
- [ ] Decide whether `return_visit_7d` can be measured reliably with the approved analytics stack; document a proxy if not.
- [ ] Exclude development, preview deployments, bots where supported, and automated tests.
- [ ] Validate each event in production or a dedicated analytics test deployment.
- [ ] Document the weekly dashboard/view and baseline snapshot.

**Acceptance criteria**

- Every implemented event fires once per intended action with no personal or free-form data.
- Signed-out bookmark intent is attributable through signup completion where technically reliable.
- A reviewer can calculate landing → tool view → action → signup by channel.
- Seven clean days of baseline data are recorded before interpreting experiments.

#### P0.2 Homepage message experiment

- **Owner:** TBD
- **Dependency:** P0.1 validated
- **Status:** Ready after analytics
- **Hypothesis:** A task-oriented promise centered on “find the right AI tool fast” increases landing → tool view compared with the current directory-led message.
- **Primary metric:** Landing → tool view
- **Guardrails:** Search engagement, bounce proxy, p75 LCP, and tool-view failure rate
- [ ] Write control and one challenger; keep layout and downstream experience identical.
- [ ] Assign variants consistently without personal profiling.
- [ ] Define sample-size or fixed-duration stopping rules before launch.
- [ ] Run only one homepage-message experiment at a time.
- [ ] Keep the winner only if the primary metric improves without breaching guardrails.

**Acceptance criteria**

- Variant assignment and exposure are measurable and stable across a visit.
- The experiment has a written start date, stop rule, and result.
- Removing the experiment leaves no dead variant code or stale analytics properties.

#### P0.3 First-visit interest onboarding

- **Owner:** TBD
- **Dependency:** P0.1 baseline plus product approval
- **Status:** Spec decision required
- **Hypothesis:** Optional use-case selection gives first-time visitors a faster path to a relevant tool.
- [ ] Choose 3–5 controlled use-case choices mapped to existing categories/tags.
- [ ] Design an inline, dismissible experience; do not block browsing with a mandatory modal.
- [ ] Return recommendations using existing catalog data before introducing a new recommendation service.
- [ ] Persist choices locally for anonymous visitors and define account behavior separately.
- [ ] Add an explicit spec note covering UX, state, and measurement before implementation.

**Acceptance criteria**

- A visitor can select interests, see useful recommendations, or dismiss the flow in under 60 seconds.
- Keyboard, screen-reader, mobile, and reduced-motion behavior are verified.
- The flow does not reduce baseline landing → tool view or page performance.

#### P0.4 Validate the existing soft signup wall

- **Owner:** TBD
- **Dependency:** P0.1
- **Status:** Existing behavior; validation needed
- [ ] Instrument signed-out bookmark attempts, auth modal starts, auth completion, and successful post-auth saves.
- [ ] Preserve the visitor's intended destination and action across auth where possible.
- [ ] Verify cancellation leaves the visitor on the current page without data loss.
- [ ] Do not add a first-page-view signup prompt.

**Acceptance criteria**

- Signed-out save attempts produce a clear auth prompt.
- Successful auth returns the visitor to the intended context.
- Save intent → signup and save intent → completed save are measurable.

### P1 — Build distribution

#### P1.1 SEO and indexability audit

- **Owner:** TBD
- **Dependency:** Stable production URLs
- **Status:** Partial
- [ ] Validate tool-page `SoftwareApplication`, breadcrumb, canonical, Open Graph, and Twitter output.
- [ ] Audit category pages for unique copy, headings, indexability, and internal links.
- [ ] Validate shareable comparison routes, canonicals, sitemap inclusion, and crawl behavior.
- [ ] Check `robots.txt`, generated sitemap coverage, status codes, and orphan pages.
- [ ] Run Rich Results validation and Lighthouse against representative production pages.

**Acceptance criteria**

- Representative tool pages pass applicable structured-data validation.
- Published tool, category, and approved comparison pages are indexable and internally linked.
- Sitemap entries resolve with canonical 200 responses.
- Tool-page Lighthouse Performance remains at least 95 and LCP remains below 2 seconds.

#### P1.2 High-intent landing pages

- **Owner:** TBD
- **Dependency:** P1.1 and search-demand research
- **Status:** Spec decision required for new route families
- [ ] Improve existing category and comparison templates before creating programmatic pages.
- [ ] Select an initial small set from demonstrated search intent, not generated permutations.
- [ ] Require unique editorial value, useful comparisons, and strong internal links.
- [ ] Define indexing thresholds and prevent thin or empty combinations from entering the sitemap.

**Acceptance criteria**

- Each page answers a distinct user job and has unique, useful content.
- No empty, near-duplicate, or unreviewed generated pages are indexable.
- Organic landing → tool view can be measured by page family.

#### P1.3 Public lists and social sharing

- **Owner:** TBD
- **Dependency:** Spec, schema, RLS, moderation, and privacy decisions
- **Status:** Deferred until product approval
- [ ] Define list ownership, visibility, slugs, edit permissions, deletion, and moderation.
- [ ] Design public list pages and per-list Open Graph output.
- [ ] Add migration, RLS policies, generated types, routes, tests, and sitemap rules.
- [ ] Measure list creation, share intent, referral visits, and referred activation.

### P2 — Improve conversion and retention

#### P2.1 Follow model and digest

- **Owner:** TBD
- **Dependency:** Spec, schema, RLS, notification preference, and email-volume decisions
- **Status:** Deferred until product approval
- [ ] Decide whether launch scope supports category follows only or also tags and tools.
- [ ] Define what constitutes a notable update and how duplicates are batched.
- [ ] Add explicit opt-in, unsubscribe, frequency controls, and in-app preference management.
- [ ] Reuse the existing notification architecture where it fits; do not overload transactional notification types silently.

**Acceptance criteria**

- Follow/unfollow is protected by RLS and reflected immediately in the UI.
- Digests are batched, idempotent, preference-aware, and easy to unsubscribe from.
- Delivery, click-through, unsubscribe, and return behavior are measurable without personal data in analytics.

#### P2.2 Recommendation quality

- **Owner:** TBD
- **Dependency:** Sufficient validated interaction data and a documented privacy model
- **Status:** Later optimization
- [ ] Start with explicit interests and catalog attributes.
- [ ] Define an offline relevance set and quality metric before using behavioral history.
- [ ] Add behavioral personalization only after consent, retention, and deletion behavior are specified.

## Execution Rhythm

- **Weekly:** Review data quality, funnel drop-off, performance guardrails, and choose one bottleneck.
- **Biweekly:** Ship at most one activation experiment plus one distribution improvement.
- **Monthly:** Review channel quality and 7-day retention; archive losing experiments and stale flags.
- **Per PR:** Include what changed, hypothesis, event changes, screenshots for UI work, test evidence, migration notes, and `CHANGELOG.md` entry.

## Recommended Sequence

1. P0.1 — Instrument and validate the existing funnel.
2. Record seven complete baseline days.
3. P0.2 — Run the homepage message experiment.
4. P0.4 — Fix any measured loss between save intent and completed save.
5. P1.1 — Finish SEO/indexability validation for existing routes.
6. Decide whether P0.3 onboarding is justified by the measured activation bottleneck.
7. Promote follows or public lists only through explicit spec updates after the core funnel is healthy.
