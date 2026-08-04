"""PERSIST: write the verified facts + prose to Supabase as a DRAFT.

Mirrors the upsert shape of the existing discover-tools edge function, but the
tool always lands as status='draft' with an enrichment_jobs row in
'needs_review'. An admin approves it to 'published' — the service never
auto-publishes (CLAUDE.md: no unauthenticated/auto mutations to live content).
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

from .state import EnrichmentState, ExtractedFacts
from .supabase_client import get_supabase

_PRICING_TIERS = {"free", "freemium", "paid", "enterprise"}
_AUDIENCES = {"technical", "non_technical", "both"}
_TRAFFIC = {"small", "medium", "large", "xlarge"}


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower())
    return re.sub(r"^-+|-+$", "", s)[:80]


def _domain(url: str) -> str:
    try:
        return urlparse(url).hostname.replace("www.", "")  # type: ignore[union-attr]
    except Exception:
        return url


def _v(facts: ExtractedFacts, name: str):
    return getattr(getattr(facts, name), "value", None)


def _enum(value, allowed: set[str], default: str | None):
    return value if value in allowed else default


def persist_draft(state: EnrichmentState) -> str:
    sb = get_supabase()
    facts = state["facts"]
    url = state["url"]
    domain = _domain(url)

    name = _v(facts, "name") or domain
    slug = _slugify(name)

    # Resolve category slug → id
    cat_id = None
    cat_slug = state.get("category_slug")
    if cat_slug:
        cat = sb.table("categories").select("id").eq("slug", cat_slug).maybe_single().execute()
        cat_id = (cat.data or {}).get("id") if cat.data else None

    row = {
        "slug": slug,
        "name": name,
        "tagline": _v(facts, "tagline") or "",
        "website_url": url,
        "logo_url": f"https://icon.horse/icon/{domain}",
        "primary_category_id": cat_id,
        "pricing_tier": _enum(_v(facts, "pricing_tier"), _PRICING_TIERS, "freemium"),
        "has_free_tier": bool(_v(facts, "has_free_tier")),
        "pricing_starts_at": _v(facts, "pricing_starts_at"),
        "pricing_currency": "USD",
        "pricing_detail": _v(facts, "pricing_detail"),
        "audience_fit": _enum(_v(facts, "audience_fit"), _AUDIENCES, "both"),
        "model_provider": _v(facts, "model_provider"),
        "open_source": bool(_v(facts, "open_source")),
        "self_hostable": bool(_v(facts, "self_hostable")),
        "api_available": bool(_v(facts, "api_available")),
        "github_stars": _v(facts, "github_stars"),
        "integrations": _v(facts, "integrations") or [],
        "traffic_tier": _enum(_v(facts, "traffic_tier"), _TRAFFIC, None),
        "founded_year": _v(facts, "founded_year"),
        "hq_country": _v(facts, "hq_country"),
        "hq_city": _v(facts, "hq_city"),
        "key_strengths": _v(facts, "key_strengths") or [],
        "status": "draft",
    }

    upserted = sb.table("tools").upsert(row, on_conflict="slug").execute()
    tool_id = upserted.data[0]["id"]

    # Replace content blocks (6 dual-audience rows), matching discover-tools order.
    c = state["content"]
    sb.table("content_blocks").delete().eq("tool_id", tool_id).execute()
    sb.table("content_blocks").insert(
        [
            {"tool_id": tool_id, "section": "overview", "audience": "technical", "body_md": c.overview_technical, "sort_order": 0},
            {"tool_id": tool_id, "section": "overview", "audience": "non_technical", "body_md": c.overview_general, "sort_order": 1},
            {"tool_id": tool_id, "section": "docs", "audience": "technical", "body_md": c.docs_technical, "sort_order": 0},
            {"tool_id": tool_id, "section": "docs", "audience": "non_technical", "body_md": c.docs_general, "sort_order": 1},
            {"tool_id": tool_id, "section": "use_cases", "audience": "technical", "body_md": c.use_cases_technical, "sort_order": 0},
            {"tool_id": tool_id, "section": "use_cases", "audience": "non_technical", "body_md": c.use_cases_general, "sort_order": 1},
        ]
    ).execute()

    return tool_id
