# Enrichment service — multi-agent tool enrichment (LangGraph)

A Python + LangGraph pipeline that replaces the single-shot `discover-tools`
extraction with a graph of specialist steps, optimized for **factual accuracy
over fabrication**. It writes tools as **drafts** for admin approval; it never
auto-publishes.

## Why this exists

The `supabase/functions/discover-tools` edge function makes **one** Claude call
that invents structured facts (pricing, founding year, GitHub stars) and six
prose blocks all at once, with no verification. That co-mingling is the source
of fabricated data. This service splits the work and adds two accuracy guards.

## The graph

```
ingest → extract → categorize → verify → write → critique ──┐
                                            ▲                │ unsupported claims
                                            └──── retry ─────┘ (max 2)
                                                             │ approved
                                                             ▼
                                                          persist (draft)
```

| Node | Job | Model (default) | llm_usage feature |
|------|-----|-----------------|-------------------|
| `ingest` | Fetch homepage + `/pricing` + **GitHub API** (real stars/license/year) | — | — |
| `extract` | Pull facts, each with a verbatim **evidence quote**; no evidence ⇒ null | Sonnet | `enrich_extract` |
| `categorize` | Classify against the **live `categories` table** | Haiku | `enrich_categorize` |
| `verify` | Deterministic evidence gate + LLM support check; nulls unsupported facts | Sonnet | `enrich_verify` |
| `write` | 6 dual-audience blocks grounded **only** on the verified fact sheet | Sonnet | `enrich_write` |
| `critique` | Flags prose claims absent from the fact sheet; loops back to `write` | Haiku | `enrich_critique` |
| `persist` | **create:** insert `tools` (status=`draft`) + 6 `content_blocks` · **refresh:** auto-apply or propose (below) | — | — |

**The anti-fabrication mechanism** is the evidence envelope in
[`state.py`](enrichment/state.py): every fact is `{value, evidence, confidence}`,
and [`verify`](enrichment/nodes.py) nulls any field whose evidence is missing,
low-confidence, or whose quote isn't actually found in the source text. The
writer only ever sees survivors, so it cannot reintroduce a stripped claim.

## Setup

```bash
cd services/enrichment
cp .env.example .env            # fill ANTHROPIC_API_KEY + SUPABASE_* (service role)
uv sync                          # or: pip install -e .
```

Apply the migration first (adds `enrichment_jobs` + new `llm_usage` features):

```bash
supabase db push                 # or: supabase db reset for local
```

## Run

```bash
# One URL, directly — writes a draft, prints flags + confidence
uv run enrich https://www.langchain.com

# Drain queued jobs from enrichment_jobs
uv run enrich --poll
```

## Refresh existing tools

Refresh mode re-runs the same graph against an **already-published** tool's
website and writes the result **in place** — the tool stays published; slug,
name, category, website, logo, `status` and `published_at` are never touched.
Logic lives in [`refresh.py`](enrichment/refresh.py).

```bash
uv run enrich --refresh cursor perplexity            # specific tools (slug or id)
uv run enrich --refresh-batch 25                     # most in need first
uv run enrich --refresh-batch 5 --dry-run            # print the diff, write nothing
uv run enrich --apply-job <job_id>                   # apply a reviewed proposal
```

**Auto-apply if verified.** A refresh is written live only when *all* hold:

- the tool is not `edited_by_admin` (human edits are never overwritten),
- the critic approved the final prose (no unsupported claims after retries),
- the verifier's confidence ≥ `ENRICH_REFRESH_MIN_CONFIDENCE` (default `0.7`),
- the name on the site still matches the tool (guards against a domain that
  changed hands).

Anything else lands in `needs_review` with the full proposal (field diff with
evidence, the six blocks, and the blocking reasons) on `enrichment_jobs.proposal`.

**Merge rules.** Only facts that survived the evidence gate are candidates; a
null fact never overwrites an existing value; fields the advisory critic doubted
are withheld; only the six graph-owned blocks (`overview`/`docs`/`use_cases`)
are replaced — insert-then-delete, so a failure never leaves a tool blank.

**Batch order** (`--refresh-batch`): tools with no content blocks → overview-only
→ everything else, oldest `updated_at` first; tools refreshed in the last 30
days are skipped. Batches stop cleanly at the daily cost cap (~$0.08/tool, so
the default $5 cap ≈ 60 tools/day — raise `ENRICH_DAILY_COST_CAP_USD` for a
one-off backfill). Refreshes don't trigger a Vercel rebuild (only a
→`published` status change does), so **deploy once after a batch** for the
prerendered pages to pick up the new content.

**Change log + last verified** (migration `0035`). Every applied proposal
stamps `tools.last_verified_at` and writes one `tool_changes` row per field
(old, new, evidence, job id). Notable rows (pricing, free tier, API, open
source, self-hosting, models — with a prior value) are public: they show on the
tool page and on `/changes`.

**Scheduled.** `.github/workflows/freshness.yml` runs `--refresh-batch 50`
every Monday, posts a summary + catalog-health report
(`scripts/freshness-report.ts`) to the job summary, and triggers the Vercel
deploy hook when anything was applied. Run it on demand from the Actions tab
(batch size + dry-run inputs).

**New tools from a list.** `uv run enrich --file urls.txt` runs create mode per
URL. A URL matching an existing tool's website is skipped before any LLM spend,
and create mode refuses to write onto an existing slug — it can no longer
unpublish a live tool.

## Calibrate: shadow-diff (old vs new)

Runs BOTH the old single-shot extraction (homepage-only, no verification — a
replica of `discover-tools`) and the new graph (dry-run, no DB write), and prints
a field-by-field disagreement report. This is how you decide cutover on numbers,
not vibes.

```bash
uv run shadow https://www.langchain.com https://cursor.com
uv run shadow --file urls.txt
```

Per field: `agree` · `differ` (⚠ inspect) · `only-old` (new more conservative) ·
`only-new` (new sourced more) · `both-blank`. Watch `differ` and `only-new`.

## Deploy (Vercel Python / Fluid Compute)

`api/enrich.py` is a Vercel Python function. Trigger it from a **Supabase
Database Webhook** on `INSERT` into `public.enrichment_jobs`, or POST it
`{"url": "..."}` / `{"poll": true}`. One invocation = one tool, well within the
300s timeout. For large batches, enqueue many rows and let the webhook fan out.

## Cost guardrails (CLAUDE.md)

Every LLM call goes through [`llm.py`](enrichment/llm.py), which checks the
daily cap (`ENRICH_DAILY_COST_CAP_USD`, summed across `enrich_%` features) and
logs an `llm_usage` row. No node can bypass it.

Calls also carry a request timeout (`ENRICH_LLM_TIMEOUT_S`, default 90s).
Anthropic's default is no timeout, which let a stalled connection hang a run
indefinitely; 90s x 3 attempts keeps a single node inside the 300s function
budget. A hang now fails that tool (`AnthropicTimeoutError`, recorded on its job) and the batch moves on.

Two more guards cover hangs outside the LLM call. The Supabase client uses
HTTP/1.1 with a 30s read timeout (postgrest-py's default HTTP/2 client once
blocked a request for 47 minutes despite its 120s timeout), and CLI batches give
each tool at most `ENRICH_TOOL_DEADLINE_S` (default 600s; a normal run is ~60s)
before failing it and moving on — see [`deadline.py`](enrichment/deadline.py).

## Rollout

1. Ship the migration; run this in **shadow mode** — enrich into drafts and diff
   the facts against what `discover-tools` produced for the same URLs.
2. Once `verify` is measurably catching fabrications, point
   `discover-tools` / `url-to-draft` at `enrichment_jobs` instead of calling
   Claude directly.
3. Retire the monolithic extraction call.

## LangSmith (optional)

Set `LANGCHAIN_TRACING_V2=true` + `LANGCHAIN_API_KEY` to trace every run — and
it's dogfooding, since LangSmith is in the directory.
