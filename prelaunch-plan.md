# Prelaunch Growth Plan (AI Wiki)

## Goal
Drive early user growth before launch by optimizing activation, building distribution loops, and improving conversion.

## Current State
- Vercel Analytics is already integrated.
- Next step is using that foundation to drive product decisions with a tighter growth loop.

## 0) Analytics Hardening (Week 0)
**Objective:** Turn existing analytics into actionable growth signal before feature work ramps.

- Define and standardize event names for key funnel actions.
- Ensure events include useful dimensions (route, referrer channel, category/tag context, signed-in status).
- Create one shared growth dashboard for weekly review.

**Core event set:**
- `landing_view`
- `tool_view`
- `compare_click`
- `save_click`
- `follow_click`
- `signup_start`
- `signup_complete`
- `return_visit_7d`

## 1) Activation Loop (Weeks 1-2)
**Objective:** Help new visitors reach value in under 60 seconds.

- Clarify homepage value proposition above the fold (who this is for, what problem it solves).
- Add guided onboarding for first-time visitors (interest/topic or use-case selection).
- Show immediate personalized tool recommendations based on onboarding input.
- Reduce friction on first core action (view, compare, or save a tool).

**Success signals:**
- Higher landing-to-tool-view rate
- Faster time-to-first-meaningful-action

## 2) Distribution Engine (Weeks 2-4)
**Objective:** Build sustainable top-of-funnel traffic.

- Strengthen SEO on tool pages (metadata, schema, indexability hygiene).
- Create high-intent pages (e.g., "best tools for X", category pages, comparison pages).
- Improve social share previews (Open Graph/Twitter cards) for tool and list pages.
- Enable user-generated lists/collections that become indexable landing pages.

**Success signals:**
- Growth in organic sessions
- Increase in shared links and referral traffic

## 3) Conversion + Retention (Weeks 3-6)
**Objective:** Turn visitors into returning users.

- Introduce lightweight account capture at high-intent moments (save list, follow category, set alert).
- Add follow/subscribe flows for categories, tags, or tools.
- Trigger lifecycle messaging (email or in-app): new tools in followed areas, notable updates.
- Add a simple re-engagement cadence (weekly digest or "new this week").

**Success signals:**
- More signups per qualified visit
- Increase in returning users

## 4) Measurement Framework (Start Day 1)
**Objective:** Make decisions by funnel impact.

Track this core funnel:
1. Landing page visit
2. Tool detail view
3. Compare/save/follow action
4. Signup
5. Return visit

Prioritize the highest-dropoff step first each sprint.

Because Vercel Analytics is already in place, focus on:
- Funnel conversion by source (organic, direct, referral, social)
- New vs returning performance
- Category-level intent (which topics convert best)

## Suggested Execution Rhythm
- **Weekly:** Review funnel dropoff + choose one bottleneck to improve.
- **Biweekly:** Ship one activation improvement + one distribution improvement.
- **Monthly:** Evaluate channel quality (organic, referral, direct) and retention trend.

## Initial Backlog Candidates
- Homepage messaging refresh and CTA hierarchy
- First-visit onboarding modal/flow
- Personalized recommendation block on landing/tool pages
- SEO schema for tool pages
- Compare pages template
- Save/follow actions gated by lightweight signup prompt
- Followed-topic notification flow
- Funnel analytics dashboard (landing -> tool view -> action -> signup -> return)

## Build-Next Backlog (Execution-Ready)
### P0 (Do first)
- Instrument and validate the core event set above in all key routes.
- Ship homepage hero + CTA A/B test focused on "find the right tool fast."
- Add first-visit onboarding (3-5 interest choices) and feed recommendations instantly.
- Implement soft signup wall only after high-intent actions (save/follow), not on first page view.

### P1 (Do next)
- Launch SEO-focused comparison and category pages with internal linking.
- Add shareable public lists with strong Open Graph cards.
- Add follow-category notifications (batched digest format).

### P2 (Then optimize)
- Improve recommendation quality using interaction history.
- Introduce programmatic landing pages for high-intent long-tail queries.
- Add referral loop incentives for list sharing.
