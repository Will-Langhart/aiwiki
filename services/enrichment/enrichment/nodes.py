"""The graph nodes: extract → categorize → verify → write → critique → persist.

Each node is a pure(ish) function of state → partial state update. The two
accuracy guards are `verify_facts` (evidence gating, mostly deterministic) and
`critique_content` (claims-vs-facts check that can loop back to the writer).
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher

from pydantic import BaseModel, Field

from .llm import call_structured
from .persist import persist_draft
from .sources import ingest
from .state import (
    CATEGORY_SLUGS,
    EnrichmentState,
    ExtractedFacts,
    GeneratedContent,
)
from .supabase_client import get_supabase

MAX_CONTENT_RETRIES = 2
MIN_CONFIDENCE = 0.4  # facts below this are treated as unknown


# --- helpers ----------------------------------------------------------------

def _sources_blob(state: EnrichmentState, limit: int = 16_000) -> str:
    parts = []
    for s in state.get("raw_sources", []):
        parts.append(f"[source:{s['kind']} {s['origin_url']}]\n{s['text']}")
    return "\n\n".join(parts)[:limit]


def _evidence_in_sources(evidence: str, haystack: str) -> bool:
    """True if the quote plausibly appears in the source text.

    Guards against fabricated evidence (a quote that never existed) while
    tolerating paraphrase and HTML-stripping noise. Three tiers:
      1. exact normalized substring
      2. longest common substring covers >=60% of the quote
      3. >=75% of the quote's significant words are present in the sources
    Note: comparing a short quote's SequenceMatcher ratio against the whole
    haystack is meaningless (lengths differ by orders of magnitude) — we use
    find_longest_match / token overlap instead.
    """
    if not evidence:
        return False
    norm = lambda s: re.sub(r"\s+", " ", s.lower()).strip()
    ev, hay = norm(evidence), norm(haystack)
    if len(ev) < 6:
        return False
    if ev in hay:
        return True
    sm = SequenceMatcher(None, ev, hay, autojunk=False)
    m = sm.find_longest_match(0, len(ev), 0, len(hay))
    if m.size / len(ev) >= 0.6:
        return True
    words = [w for w in re.findall(r"\w+", ev) if len(w) > 2]
    if words:
        present = sum(1 for w in words if w in hay)
        if present / len(words) >= 0.75:
            return True
    return False


# --- nodes ------------------------------------------------------------------

def ingest_node(state: EnrichmentState) -> EnrichmentState:
    sources, reason = ingest(state["url"])
    if not sources:
        return {"status": "failed", "error": f"Could not fetch {state['url']} ({reason})"}
    return {"raw_sources": sources, "retries": 0, "flags": []}


_EXTRACT_SYSTEM = (
    "You are a meticulous AI-tool directory researcher. Extract ONLY facts that "
    "are explicitly supported by the provided sources. For every field, quote the "
    "exact supporting text in `evidence`. If a fact is not stated in the sources, "
    "set its value to null and evidence to null — DO NOT guess, infer, or use prior "
    "knowledge. Prefer the GitHub API source (marked authoritative) for stars, "
    "license, open-source status, and founding year."
)


def extract_facts_node(state: EnrichmentState) -> EnrichmentState:
    user = (
        f"Tool URL: {state['url']}\n\n"
        f"Sources:\n---\n{_sources_blob(state)}\n---\n\n"
        "Extract the structured facts. Remember: no evidence ⇒ null value."
    )
    facts = call_structured(
        node="extract",
        feature="enrich_extract",
        system=_EXTRACT_SYSTEM,
        user=user,
        schema=ExtractedFacts,
        max_tokens=2048,
    )
    return {"facts": facts}


class CategoryChoice(BaseModel):
    slug: str = Field(description="The single best-fit category slug from the provided list.")


def categorize_node(state: EnrichmentState) -> EnrichmentState:
    # Ground the choice in the live category list (not free text).
    sb = get_supabase()
    rows = sb.table("categories").select("slug,name,description").execute().data or []
    valid = {r["slug"] for r in rows} or set(CATEGORY_SLUGS)
    listing = "\n".join(f"- {r['slug']}: {r.get('name','')} — {r.get('description') or ''}" for r in rows) or \
        "\n".join(f"- {s}" for s in CATEGORY_SLUGS)

    facts = state["facts"]
    summary = f"{facts.name.value or ''} — {facts.tagline.value or ''}. Strengths: {', '.join(facts.key_strengths.value)}"
    choice = call_structured(
        node="categorize",
        feature="enrich_categorize",
        system="Classify the tool into exactly one category slug from the list. Return only a slug that appears in the list.",
        user=f"Tool: {summary}\n\nCategories:\n{listing}",
        schema=CategoryChoice,
        max_tokens=64,
    )
    slug = choice.slug if choice.slug in valid else "productivity"
    if choice.slug not in valid:
        return {"category_slug": slug, "flags": [f"category '{choice.slug}' not in DB; fell back to 'productivity'"]}
    return {"category_slug": slug}


class VerifyVerdict(BaseModel):
    unsupported_fields: list[str] = Field(
        default_factory=list,
        description="Field names whose value is NOT genuinely supported by its evidence quote in context.",
    )
    confidence: float = Field(0.0, ge=0.0, le=1.0, description="Overall confidence in the surviving fact set.")
    notes: str = ""


def verify_facts_node(state: EnrichmentState) -> EnrichmentState:
    """Two-stage gate: deterministic evidence check, then an LLM support check."""
    facts = state["facts"]
    haystack = _sources_blob(state, limit=24_000)
    flags: list[str] = []

    # Stage 1 — deterministic. Null out any field lacking evidence, below the
    # confidence floor, or whose "quote" doesn't actually appear in the sources.
    for field_name, fact in facts:  # pydantic v2 __iter__ yields (name, value)
        if not hasattr(fact, "evidence"):
            continue
        value = getattr(fact, "value", None)
        has_value = value not in (None, [], "")
        if not has_value:
            continue
        if fact.evidence is None or fact.confidence < MIN_CONFIDENCE:
            _null_out(fact)
            flags.append(f"{field_name}: dropped (no evidence / low confidence)")
        elif not _evidence_in_sources(fact.evidence, haystack):
            _null_out(fact)
            flags.append(f"{field_name}: dropped (evidence not found in sources — possible fabrication)")

    # Stage 2 — semantic, ADVISORY ONLY. The deterministic gate above is
    # authoritative (it drops); the LLM critic merely flags surviving facts it
    # doubts, for the human reviewer, and sets the confidence score. It does NOT
    # auto-null — an early run showed it over-flagging correct fields (e.g. the
    # tagline), so we don't let it silently gut a draft.
    surviving = [name for name, f in facts if getattr(f, "value", None) not in (None, [], "")]
    verdict = call_structured(
        node="verify",
        feature="enrich_verify",
        system=(
            "You are a conservative fact-checker. For each field below, its `evidence` "
            "quote came from the tool's own website. Flag a field ONLY if the evidence "
            "clearly does NOT support the value. When in doubt, do not flag. "
            "`unsupported_fields` must contain ONLY exact field names from this list, "
            f"nothing else: {surviving}. Return an empty list if all are supported."
        ),
        user=_facts_for_review(facts),
        schema=VerifyVerdict,
        max_tokens=512,
    )
    for field_name in verdict.unsupported_fields:
        if field_name in surviving:
            flags.append(f"{field_name}: flagged by critic for review (advisory, not dropped)")

    return {"facts": facts, "flags": flags, "confidence": verdict.confidence}


def _null_out(fact) -> None:
    fact.value = [] if isinstance(getattr(fact, "value", None), list) else None
    fact.evidence = None
    fact.confidence = 0.0


def _facts_for_review(facts: ExtractedFacts) -> str:
    lines = []
    for name, fact in facts:
        if getattr(fact, "value", None) in (None, [], ""):
            continue
        lines.append(f"- {name}: value={fact.value!r} | evidence={fact.evidence!r}")
    return "Facts to check:\n" + "\n".join(lines)


def _fact_sheet(facts: ExtractedFacts) -> str:
    """Verified, non-null facts only — the sole ground truth the writer may use."""
    lines = []
    for name, fact in facts:
        v = getattr(fact, "value", None)
        if v in (None, [], ""):
            continue
        lines.append(f"- {name}: {v}")
    return "\n".join(lines)


_WRITE_SYSTEM = (
    "You write directory content for AI tools. Use ONLY the facts in the verified "
    "fact sheet. If a detail is not in the sheet, omit it — never fill gaps from "
    "prior knowledge. Write in clean markdown. Keep the two audiences distinct: "
    "'technical' is for developers (APIs, architecture); 'general' is for non-technical readers."
)


def write_content_node(state: EnrichmentState) -> EnrichmentState:
    facts = state["facts"]
    correction = ""
    recent = state.get("content_flags") or []
    if recent and state.get("retries", 0) > 0:
        correction = "\n\nThe previous draft was rejected for these unsupported claims — remove them:\n" + "\n".join(recent)

    user = (
        f"Verified fact sheet (the ONLY facts you may assert):\n{_fact_sheet(facts)}\n\n"
        "Write the six content blocks: overview_technical, overview_general, "
        "docs_technical, docs_general, use_cases_technical, use_cases_general."
        f"{correction}"
    )
    content = call_structured(
        node="write",
        feature="enrich_write",
        system=_WRITE_SYSTEM,
        user=user,
        schema=GeneratedContent,
        max_tokens=3072,
    )
    return {"content": content}


class ContentCritique(BaseModel):
    approved: bool
    unsupported_claims: list[str] = Field(
        default_factory=list,
        description="Specific factual claims in the prose that are NOT in the fact sheet.",
    )


def critique_content_node(state: EnrichmentState) -> EnrichmentState:
    facts = state["facts"]
    content = state["content"]
    prose = "\n\n".join(
        f"## {k}\n{v}" for k, v in content.model_dump().items()
    )
    critique = call_structured(
        node="critique",
        feature="enrich_critique",
        system=(
            "You audit tool-directory prose for fabrication. Flag every factual "
            "claim in the prose that is not backed by the fact sheet. Marketing "
            "adjectives are fine; specific facts (numbers, dates, integrations, "
            "pricing, ownership) must appear in the sheet. Approve only if clean."
        ),
        user=f"Fact sheet:\n{_fact_sheet(facts)}\n\nProse:\n{prose}",
        schema=ContentCritique,
        max_tokens=512,
    )
    if critique.approved or not critique.unsupported_claims:
        return {"content_flags": []}
    return {
        # content_flags (overwrite) drives the retry decision; flags (append) is the audit trail.
        "content_flags": list(critique.unsupported_claims),
        "flags": [f"content: {c}" for c in critique.unsupported_claims],
        "retries": state.get("retries", 0) + 1,
    }


def persist_node(state: EnrichmentState) -> EnrichmentState:
    if state.get("dry_run"):
        return {"tool_id": None, "status": "needs_review"}
    tool_id = persist_draft(state)
    return {"tool_id": tool_id, "status": "needs_review"}
