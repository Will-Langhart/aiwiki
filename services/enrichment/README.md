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
| `persist` | Upsert `tools` (status=`draft`) + 6 `content_blocks` | — | — |

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
