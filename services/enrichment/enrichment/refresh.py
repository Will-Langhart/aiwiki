"""REFRESH: re-enrich an already-published tool in place.

Create mode (persist.py) writes a brand-new tool as a draft for admin approval.
Refresh mode runs the same graph against an existing tool's website and then
either **auto-applies** the result to the live row or **parks it as a proposal**
on the enrichment_jobs row. It never changes status, published_at, slug, name,
category, website or logo — the tool stays exactly where it is on the site.

Auto-apply ("verified") requires ALL of:
  * the tool is not `edited_by_admin` (human edits are never overwritten),
  * the critic approved the final prose (no unsupported claims left after retries),
  * the verifier's overall confidence >= ENRICH_REFRESH_MIN_CONFIDENCE (0.7),
  * the name found on the site still matches the tool (guards against a domain
    that changed hands or now redirects somewhere else).
Otherwise the job lands in `needs_review` with the full proposal; an admin can
apply it later with `uv run enrich --apply-job <job_id>`.

Field merge rules, applied identically on auto-apply and manual apply:
  * only facts that survived the evidence gate are candidates;
  * a null/empty fact never overwrites an existing value — "not found on the
    homepage" is not evidence that a fact stopped being true;
  * fields the advisory critic doubted are withheld (listed in the proposal);
  * enum values outside the allowed set are dropped.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from difflib import SequenceMatcher

from .state import EnrichmentState, ExtractedFacts, GeneratedContent
from .supabase_client import get_supabase

# Columns refresh is allowed to write. Everything else on `tools` is untouched.
REFRESHABLE_FIELDS = [
    "tagline",
    "pricing_tier",
    "has_free_tier",
    "pricing_starts_at",
    "pricing_detail",
    "audience_fit",
    "model_provider",
    "open_source",
    "self_hostable",
    "api_available",
    "github_stars",
    "integrations",
    "traffic_tier",
    "founded_year",
    "hq_country",
    "hq_city",
    "key_strengths",
]

_ENUMS = {
    "pricing_tier": {"free", "freemium", "paid", "enterprise"},
    "audience_fit": {"technical", "non_technical", "both"},
    "traffic_tier": {"small", "medium", "large", "xlarge"},
}

# Only filled when the existing value is empty. A homepage slogan ("The AI Native
# Cloud") is a worse directory tagline than the descriptive one already curated.
# Same for founded_year (GitHub repo-creation year isn't the founding year —
# Semgrep 2020→2019) and hq_country (only churned "USA" → "United States").
FILL_ONLY_FIELDS = {"tagline", "founded_year", "hq_country"}

# The six blocks the graph writes. Blocks in any other section are left alone.
CONTENT_SECTIONS = ("overview", "docs", "use_cases")


def _min_confidence() -> float:
    return float(os.environ.get("ENRICH_REFRESH_MIN_CONFIDENCE", "0.7"))


def _empty(value) -> bool:
    return value is None or value == "" or value == []


def _norm_name(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def names_match(found: str | None, existing: str) -> bool:
    """True when the site's name plausibly is the tool we already list.

    No name found on the site is treated as a match — absence isn't evidence
    of a different product, and the confidence bar still applies.
    """
    a, b = _norm_name(found or ""), _norm_name(existing)
    if not a or not b:
        return True
    if a in b or b in a:
        return True
    return SequenceMatcher(None, a, b).ratio() >= 0.6


def _critic_doubted(state: EnrichmentState) -> set[str]:
    """Fields the advisory verify critic flagged (see nodes.verify_facts_node)."""
    out = set()
    for flag in state.get("flags", []):
        if flag.endswith("flagged by critic for review (advisory, not dropped)"):
            out.add(flag.split(":", 1)[0])
    return out


def diff_fields(state: EnrichmentState) -> tuple[dict, list[str]]:
    """Verified changes vs the existing row → ({col: {old,new,evidence}}, withheld)."""
    facts: ExtractedFacts = state["facts"]
    existing = state["existing"]
    doubted = _critic_doubted(state)
    changes: dict[str, dict] = {}
    withheld: list[str] = []

    for col in REFRESHABLE_FIELDS:
        fact = getattr(facts, col)
        new = fact.value
        if _empty(new):
            continue
        if col in _ENUMS and new not in _ENUMS[col]:
            continue
        if col in ("integrations", "key_strengths"):
            new = [str(x).strip() for x in new if str(x).strip()]
            if not new:
                continue
        old = existing.get(col)
        if _same(old, new):
            continue
        if col in FILL_ONLY_FIELDS and not _empty(old):
            continue
        if col == "github_stars" and not (facts.open_source.value or existing.get("open_source")):
            continue  # an org's side repo, not the product (e.g. you.com's agent-skills)
        if col in ("github_stars", "open_source") and not repo_matches_tool(fact.evidence, existing):
            continue  # the company's repo, not the product (Anyscale ← ray-project/ray)
        if col == "pricing_starts_at" and is_unit_rate(fact.evidence):
            continue
        if col in doubted:
            withheld.append(col)
            continue
        changes[col] = {"old": old, "new": new, "evidence": fact.evidence}

    return changes, withheld


_UNIT_RATE = re.compile(
    r"/\s*(1k|1m|1,000|1,000,000|k|m|mtok|token|call|request|page|min|minute|hour|image|second)s?\b"
    r"|\bper\s+(1k|1m|thousand|million|token|call|request|page|minute|hour|image|second)",
    re.IGNORECASE,
)


def is_unit_rate(evidence: str | None) -> bool:
    """True when a price quote is a usage rate ($1 / 1k pages), not a plan price."""
    return bool(evidence and _UNIT_RATE.search(evidence))


_GH_REPO = re.compile(r"GitHub API \(authoritative\) for ([\w.-]+)/([\w.-]+)")


def repo_matches_tool(evidence: str | None, tool: dict) -> bool:
    """True unless the evidence is a GitHub repo that isn't this tool's own.

    Evidence quoted from the tool's own site ("we're open source") passes; a
    GitHub-API quote passes only when the repo NAME equals the tool's name, slug
    or domain stem. The owner doesn't count: every company's side repos share it
    (stackhawk/agent-skills, SocketDev/socket-cli, aquasecurity/trivy).
    """
    m = _GH_REPO.search(evidence or "")
    if not m:
        return True
    repo = _norm_name(m.group(2))
    domain = re.sub(r"^https?://(www\.)?", "", (tool.get("website_url") or "").lower()).split("/")[0]
    tool_keys = {_norm_name(tool.get("name", "")), _norm_name(tool.get("slug", "")), _norm_name(domain.split(".")[0])}
    tool_keys |= {k.removesuffix("ai") for k in tool_keys if len(k) > 4}
    tool_keys.discard("")
    return repo in tool_keys


def _same(old, new) -> bool:
    if isinstance(old, (int, float)) and isinstance(new, (int, float)) and not isinstance(old, bool):
        return float(old) == float(new)
    if isinstance(old, list) and isinstance(new, list):
        return [str(x).lower() for x in old] == [str(x).lower() for x in new]
    return old == new


def blocking_reasons(state: EnrichmentState) -> list[str]:
    """Why this refresh may NOT be auto-applied. Empty list ⇒ verified."""
    existing = state["existing"]
    reasons: list[str] = []
    if existing.get("edited_by_admin"):
        reasons.append("tool was edited by an admin — human edits are never auto-overwritten")
    if state.get("content_flags"):
        reasons.append(
            f"prose still has {len(state['content_flags'])} unsupported claim(s) after retries"
        )
    conf = state.get("confidence") or 0.0
    if conf < _min_confidence():
        reasons.append(f"confidence {conf:.2f} < {_min_confidence():.2f}")
    found = state["facts"].name.value
    if not names_match(found, existing.get("name", "")):
        reasons.append(
            f"site name {found!r} doesn't match {existing.get('name')!r} — URL may have changed hands"
        )
    return reasons


def build_proposal(state: EnrichmentState) -> dict:
    changes, withheld = diff_fields(state)
    content: GeneratedContent = state["content"]
    return {
        "fields": changes,
        "withheld": withheld,
        "content": content.model_dump(),
        "reasons": blocking_reasons(state),
    }


def apply_proposal(tool_id: str, proposal: dict) -> list[str]:
    """Write a proposal to the live tool. Returns the columns written.

    Content is replaced insert-then-delete, so a failure part-way leaves the old
    blocks (plus possibly the new ones) rather than a tool with no content.
    """
    sb = get_supabase()
    update = {col: change["new"] for col, change in proposal.get("fields", {}).items()}
    applied = sorted(update)
    # Always bump updated_at so batch selection ("oldest first") moves on.
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    sb.table("tools").update(update).eq("id", tool_id).execute()

    c = proposal.get("content")
    if c:
        rows = [
            {"tool_id": tool_id, "section": "overview", "audience": "technical", "body_md": c["overview_technical"], "sort_order": 0},
            {"tool_id": tool_id, "section": "overview", "audience": "non_technical", "body_md": c["overview_general"], "sort_order": 1},
            {"tool_id": tool_id, "section": "docs", "audience": "technical", "body_md": c["docs_technical"], "sort_order": 0},
            {"tool_id": tool_id, "section": "docs", "audience": "non_technical", "body_md": c["docs_general"], "sort_order": 1},
            {"tool_id": tool_id, "section": "use_cases", "audience": "technical", "body_md": c["use_cases_technical"], "sort_order": 0},
            {"tool_id": tool_id, "section": "use_cases", "audience": "non_technical", "body_md": c["use_cases_general"], "sort_order": 1},
        ]
        inserted = sb.table("content_blocks").insert(rows).execute().data or []
        new_ids = [r["id"] for r in inserted]
        if len(new_ids) == len(rows):
            (
                sb.table("content_blocks")
                .delete()
                .eq("tool_id", tool_id)
                .in_("section", list(CONTENT_SECTIONS))
                .not_.in_("id", new_ids)
                .execute()
            )
        applied.append("content_blocks")
    notify_watchers(tool_id, proposal.get("fields", {}))
    return applied


# Changes worth an alert to people watching (bookmarking) a tool. Prose,
# integrations and strengths churn on most refreshes and would be noise.
NOTABLE_FIELDS = {
    "pricing_tier": "Pricing",
    "has_free_tier": "Free tier",
    "pricing_starts_at": "Starting price",
    "pricing_detail": "Plans",
    "api_available": "API",
    "open_source": "Open source",
    "self_hostable": "Self-hosting",
}


def _describe(col: str, change: dict) -> str:
    label, old, new = NOTABLE_FIELDS[col], change.get("old"), change.get("new")
    if isinstance(new, bool):
        return f"{label}: {'now available' if new else 'no longer offered'}"
    if col == "pricing_starts_at":
        return f"{label}: {'$' + format(old, 'g') if old is not None else 'unlisted'} → ${new:g}"
    if col == "pricing_detail":
        return f"{label} updated"
    return f"{label}: {old or 'unlisted'} → {new}"


def notify_watchers(tool_id: str, fields: dict) -> int:
    """One 'tool_updated' notification per bookmarker when a notable field changed.

    The on_notification_created trigger emails each one (unless they opted out
    in notification_preferences). Returns how many notifications were created.
    """
    notable = [col for col in NOTABLE_FIELDS if col in fields]
    if not notable:
        return 0
    sb = get_supabase()
    watchers = sb.table("bookmarks").select("user_id").eq("tool_id", tool_id).execute().data or []
    if not watchers:
        return 0
    tool = sb.table("tools").select("name,slug").eq("id", tool_id).single().execute().data or {}
    summary = "; ".join(_describe(col, fields[col]) for col in notable)
    payload = {
        "title": f"{tool.get('name', 'A tool you watch')} was updated",
        "body": summary,
        "toolName": tool.get("name"),
        "toolSlug": tool.get("slug"),
        "link": f"/tools/{tool.get('slug')}",
        "fields": notable,
    }
    rows = [{"user_id": w["user_id"], "type": "tool_updated", "payload": payload} for w in watchers]
    sb.table("notifications").insert(rows).execute()
    return len(rows)


def persist_refresh(state: EnrichmentState) -> EnrichmentState:
    """Terminal node for refresh mode: auto-apply if verified, else propose."""
    proposal = build_proposal(state)
    verified = not proposal["reasons"]
    if state.get("dry_run"):
        return {
            "proposal": proposal,
            "applied_fields": [],
            "status": "applied" if verified else "needs_review",
        }
    if not verified:
        return {"proposal": proposal, "applied_fields": [], "status": "needs_review"}
    applied = apply_proposal(state["tool_id"], proposal)
    return {"proposal": proposal, "applied_fields": applied, "status": "applied"}
