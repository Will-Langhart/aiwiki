"""Shadow-diff: old single-shot extraction vs the new multi-agent graph.

For each URL it runs BOTH approaches and prints a field-by-field disagreement
report, so you can calibrate on numbers across many tools before cutting
`discover-tools` over.

- OLD: one Anthropic call, homepage-only (10K chars), "don't fabricate" prompt —
  a faithful replica of supabase/functions/discover-tools.
- NEW: the LangGraph pipeline in dry-run (multi-source + evidence gating + critic),
  no DB write.

Per field the verdict is one of:
  agree      — same value
  differ     — both have a value, but they disagree  (inspect these!)
  only-old   — old guessed a value, new left it null  (new is more conservative)
  only-new   — new found a value, old missed it       (usually better sourcing)
  both-blank — neither had it

Usage:
    uv run shadow https://www.langchain.com https://cursor.com
    uv run shadow --file urls.txt
"""

from __future__ import annotations

import os
import sys
from typing import Optional

import httpx
from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from pydantic import BaseModel

from .runner import run_url
from .sources import _to_text, _UA  # reuse homepage fetch/strip
from .state import ExtractedFacts
from .supabase_client import get_supabase

# The structured fields we compare (prose blocks are out of scope for the diff).
FIELDS = [
    "name", "tagline", "pricing_tier", "has_free_tier", "pricing_starts_at",
    "pricing_detail", "audience_fit", "model_provider", "open_source",
    "self_hostable", "api_available", "github_stars", "integrations",
    "traffic_tier", "founded_year", "hq_country", "hq_city", "key_strengths",
]


class SingleShotFacts(BaseModel):
    """Flat schema mirroring the old discover-tools structured output."""

    name: Optional[str] = None
    tagline: Optional[str] = None
    pricing_tier: Optional[str] = None
    has_free_tier: Optional[bool] = None
    pricing_starts_at: Optional[float] = None
    pricing_detail: Optional[str] = None
    audience_fit: Optional[str] = None
    model_provider: Optional[str] = None
    open_source: Optional[bool] = None
    self_hostable: Optional[bool] = None
    api_available: Optional[bool] = None
    github_stars: Optional[int] = None
    integrations: list[str] = []
    traffic_tier: Optional[str] = None
    founded_year: Optional[int] = None
    hq_country: Optional[str] = None
    hq_city: Optional[str] = None
    key_strengths: list[str] = []


_OLD_SYSTEM = (
    "You are an AI tool directory curator. Extract accurate, factual information "
    "about AI tools from their website content. Be concise and precise. Never "
    "fabricate features or pricing."
)


def _old_single_shot(url: str) -> tuple[SingleShotFacts, int, int]:
    """Replica of the discover-tools single call: homepage-only, no verification."""
    with httpx.Client() as client:
        r = client.get(url, headers=_UA, follow_redirects=True, timeout=20)
        text = _to_text(r.text)[:10_000] if r.status_code == 200 else ""

    llm = ChatAnthropic(
        model=os.environ.get("MODEL_EXTRACT", "claude-sonnet-4-6"),
        max_tokens=2048,
        temperature=0,
    )
    structured = llm.with_structured_output(SingleShotFacts, include_raw=True)
    result = structured.invoke([
        ("system", _OLD_SYSTEM),
        ("human", f"Extract structured facts about this AI tool.\nURL: {url}\nPage content:\n---\n{text}\n---"),
    ])
    usage = getattr(result["raw"], "usage_metadata", None) or {}
    return result["parsed"], int(usage.get("input_tokens", 0)), int(usage.get("output_tokens", 0))


def _new_values(facts: ExtractedFacts) -> dict:
    return {name: getattr(getattr(facts, name), "value", None) for name in FIELDS}


def _blank(v) -> bool:
    return v in (None, "", [], {})


def _norm(v):
    if isinstance(v, list):
        return {str(x).strip().lower() for x in v}
    if isinstance(v, str):
        return v.strip().lower()
    return v


def _verdict(old, new) -> str:
    ob, nb = _blank(old), _blank(new)
    if ob and nb:
        return "both-blank"
    if ob and not nb:
        return "only-new"
    if nb and not ob:
        return "only-old"
    return "agree" if _norm(old) == _norm(new) else "differ"


def _short(v) -> str:
    if isinstance(v, list):
        return "[" + ", ".join(str(x) for x in v[:3]) + ("…" if len(v) > 3 else "") + "]"
    s = str(v)
    return s if len(s) <= 46 else s[:45] + "…"


def diff_url(url: str) -> dict[str, int]:
    print(f"\n{'='*88}\n{url}\n{'='*88}")
    old, in_tok, out_tok = _old_single_shot(url)
    _log_old_usage(in_tok, out_tok)
    old_vals = old.model_dump()

    state = run_url(url, dry_run=True)
    if "facts" not in state:
        print(f"NEW graph produced no facts — status={state.get('status')}, "
              f"error={state.get('error')}")
        return {}
    new_vals = _new_values(state["facts"])

    counts: dict[str, int] = {}
    print(f"{'field':<18} {'verdict':<11} {'OLD (single-shot)':<47} NEW (graph)")
    print("-" * 88)
    for f in FIELDS:
        v = _verdict(old_vals.get(f), new_vals.get(f))
        counts[v] = counts.get(v, 0) + 1
        if v == "both-blank":
            continue
        marker = "  ⚠" if v == "differ" else ""
        print(f"{f:<18} {v:<11} {_short(old_vals.get(f)):<47} {_short(new_vals.get(f))}{marker}")

    flags = state.get("flags", [])
    if flags:
        print(f"\nnew-graph flags ({len(flags)}):")
        for fl in flags:
            print(f"  - {fl}")
    print(f"\nsummary: " + " | ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    return counts


def _log_old_usage(in_tok: int, out_tok: int) -> None:
    # Attribute the benchmark's old-path spend honestly (same feature the old fn uses).
    try:
        get_supabase().table("llm_usage").insert({
            "feature": "discover_tools",
            "input_tokens": in_tok,
            "output_tokens": out_tok,
            "cost_usd": (in_tok * 3 + out_tok * 15) / 1_000_000,
        }).execute()
    except Exception:
        pass  # benchmarking must not fail on logging


def main() -> None:
    load_dotenv()
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return

    if args[0] == "--file":
        with open(args[1]) as fh:
            urls = [ln.strip() for ln in fh if ln.strip() and not ln.startswith("#")]
    else:
        urls = args

    totals: dict[str, int] = {}
    for url in urls:
        try:
            for k, v in diff_url(url).items():
                totals[k] = totals.get(k, 0) + v
        except Exception as exc:  # noqa: BLE001
            print(f"\n!! {url} failed: {exc}")

    print(f"\n{'#'*88}\nAGGREGATE across {len(urls)} URL(s): "
          + " | ".join(f"{k}={v}" for k, v in sorted(totals.items())))
    print("Focus on 'differ' (real disagreements) and 'only-new' (sourcing wins).")


if __name__ == "__main__":
    main()
