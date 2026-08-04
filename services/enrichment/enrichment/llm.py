"""Model routing, structured-output calls, and the mandatory llm_usage logging.

CLAUDE.md rule (hard): every Edge Function / backend LLM call writes a row to
llm_usage and checks the per-feature daily cost cap before the call. This module
is the single choke point that enforces both for the enrichment graph, so no
node can bypass it.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Type, TypeVar

from langchain_anthropic import ChatAnthropic
from pydantic import BaseModel

from .supabase_client import get_supabase

T = TypeVar("T", bound=BaseModel)

# Feature label per node — must exist in the llm_usage.feature check constraint
# (see migration 0024_enrichment_jobs.sql).
Feature = str

# Anthropic per-MTok pricing (USD) for cost accounting. Keep in sync with the
# models actually configured via the MODEL_* env vars.
_PRICING: dict[str, tuple[float, float]] = {
    # model_id: (input_per_mtok, output_per_mtok)
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-sonnet-4-5": (3.0, 15.0),
    "claude-haiku-4-5-20251001": (1.0, 5.0),
}
_DEFAULT_PRICE = (3.0, 15.0)


def _model_for(node: str) -> str:
    return {
        "extract": os.environ.get("MODEL_EXTRACT", "claude-sonnet-4-6"),
        "categorize": os.environ.get("MODEL_CATEGORIZE", "claude-haiku-4-5-20251001"),
        "verify": os.environ.get("MODEL_VERIFY", "claude-sonnet-4-6"),
        "write": os.environ.get("MODEL_WRITE", "claude-sonnet-4-6"),
        "critique": os.environ.get("MODEL_CRITIQUE", "claude-haiku-4-5-20251001"),
    }[node]


def _cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    in_rate, out_rate = _PRICING.get(model, _DEFAULT_PRICE)
    return (input_tokens * in_rate + output_tokens * out_rate) / 1_000_000


class DailyCapExceeded(RuntimeError):
    """Raised before a call when today's enrichment spend is over the cap."""


def _assert_under_cap() -> None:
    cap = float(os.environ.get("ENRICH_DAILY_COST_CAP_USD", "5.0"))
    sb = get_supabase()
    start_of_day = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    ).isoformat()
    # Sum today's spend across every enrichment node.
    resp = (
        sb.table("llm_usage")
        .select("cost_usd")
        .like("feature", "enrich_%")
        .gte("created_at", start_of_day)
        .execute()
    )
    spent = sum(float(r["cost_usd"] or 0) for r in (resp.data or []))
    if spent >= cap:
        raise DailyCapExceeded(f"Enrichment daily cap ${cap} reached (spent ${spent:.4f}).")


def _log_usage(feature: Feature, model: str, input_tokens: int, output_tokens: int) -> None:
    sb = get_supabase()
    sb.table("llm_usage").insert(
        {
            "feature": feature,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": _cost_usd(model, input_tokens, output_tokens),
        }
    ).execute()


def call_structured(
    node: str,
    feature: Feature,
    system: str,
    user: str,
    schema: Type[T],
    *,
    max_tokens: int = 2048,
) -> T:
    """Run one structured-output call, enforce the cap, log usage, return the model.

    `node` selects the model (via MODEL_* env). `feature` is the llm_usage label.
    """
    _assert_under_cap()
    model_id = _model_for(node)

    llm = ChatAnthropic(model=model_id, max_tokens=max_tokens, temperature=0)
    structured = llm.with_structured_output(schema, include_raw=True)
    result = structured.invoke(
        [("system", system), ("human", user)]
    )

    raw = result["raw"]
    usage = getattr(raw, "usage_metadata", None) or {}
    _log_usage(
        feature,
        model_id,
        int(usage.get("input_tokens", 0)),
        int(usage.get("output_tokens", 0)),
    )

    parsed = result["parsed"]
    if parsed is None:
        raise ValueError(f"{node}: structured output failed to parse ({feature}).")
    return parsed
