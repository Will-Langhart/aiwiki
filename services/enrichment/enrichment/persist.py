"""PERSIST: write the verified facts + prose to Supabase as a DRAFT.

Create mode only: a NEW tool lands as status='draft' with an enrichment_jobs
row in 'needs_review'. An admin approves it to 'published' — the service never
auto-publishes a new tool. Existing slugs are refused (DuplicateToolError);
re-enriching a live tool is refresh mode's job (refresh.py).
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

from .refresh import is_unit_rate, repo_matches_tool
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


class DuplicateToolError(RuntimeError):
    """Create mode found an existing tool — refusing to overwrite or unpublish it."""


def _site_key(url: str) -> tuple[str, str]:
    """(host without www, path without trailing slash) — for duplicate detection."""
    try:
        u = urlparse(url if "://" in url else f"https://{url}")
        host = (u.hostname or "").lower().removeprefix("www.")
        return host, u.path.rstrip("/").lower()
    except Exception:
        return url.lower(), ""


def find_existing_tool(url: str) -> dict | None:
    """The existing tool (any status) whose website is this URL, if any.

    Conservative: same host counts as a match when the paths are equal or either
    is the bare domain, so `https://openai.com` matches every openai.com tool but
    `openai.com/sora` does not match `openai.com/research/whisper`. A skipped
    duplicate costs nothing; a missed one would clobber a live tool.
    """
    host, path = _site_key(url)
    sb = get_supabase()
    rows, start = [], 0
    while True:
        page = sb.table("tools").select("id,slug,name,website_url,status").range(start, start + 999).execute().data or []
        rows += page
        if len(page) < 1000:
            break
        start += 1000
    for r in rows:
        h, p = _site_key(r.get("website_url") or "")
        if h == host and (p == path or not p or not path):
            return r
    return None


def _v(facts: ExtractedFacts, name: str):
    return getattr(getattr(facts, name), "value", None)


def _first_sentence(text: str, limit: int = 140) -> str:
    """Tagline fallback: the first sentence of the verified, critic-checked prose."""
    plain = re.sub(r"[#*_`>\[\]]|\(https?://[^)]*\)", "", text or "").strip()
    sentence = re.split(r"(?<=[.!?])\s", plain, maxsplit=1)[0].strip()
    return sentence if len(sentence) <= limit else sentence[: limit - 1].rsplit(" ", 1)[0] + "…"


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

    pricing_tier = _enum(_v(facts, "pricing_tier"), _PRICING_TIERS, "freemium")
    # has_free_tier is NOT NULL; an unknown value follows the tier instead of
    # silently becoming False (which contradicted "freemium" on most drafts).
    has_free_tier = _v(facts, "has_free_tier")
    if has_free_tier is None:
        has_free_tier = pricing_tier in ("free", "freemium")

    row = {
        "slug": slug,
        "name": name,
        "tagline": _v(facts, "tagline") or _first_sentence(state["content"].overview_general),
        "website_url": url,
        "logo_url": f"https://icon.horse/icon/{domain}",
        "primary_category_id": cat_id,
        "pricing_tier": pricing_tier,
        "has_free_tier": bool(has_free_tier),
        "pricing_starts_at": None if is_unit_rate(facts.pricing_starts_at.evidence) else _v(facts, "pricing_starts_at"),
        "pricing_currency": "USD",
        "pricing_detail": _v(facts, "pricing_detail"),
        "audience_fit": _enum(_v(facts, "audience_fit"), _AUDIENCES, "both"),
        "model_provider": _v(facts, "model_provider"),
        "open_source": bool(_v(facts, "open_source")) and repo_matches_tool(facts.open_source.evidence, {"name": name, "slug": slug, "website_url": url}),
        "self_hostable": bool(_v(facts, "self_hostable")),
        "api_available": bool(_v(facts, "api_available")),
        "github_stars": _v(facts, "github_stars")
        if _v(facts, "open_source")
        and repo_matches_tool(facts.github_stars.evidence, {"name": name, "slug": slug, "website_url": url})
        else None,
        "integrations": _v(facts, "integrations") or [],
        "traffic_tier": _enum(_v(facts, "traffic_tier"), _TRAFFIC, None),
        "founded_year": _v(facts, "founded_year"),
        "hq_country": _v(facts, "hq_country"),
        "hq_city": _v(facts, "hq_city"),
        "key_strengths": _v(facts, "key_strengths") or [],
        "status": "draft",
    }

    # Never upsert onto an existing slug: that would flip a published tool to
    # draft and wipe its content. Existing tools go through refresh mode.
    clash = sb.table("tools").select("id,status").eq("slug", slug).limit(1).execute().data
    if clash:
        raise DuplicateToolError(
            f"slug '{slug}' already exists ({clash[0]['status']}) — use `enrich --refresh {slug}`"
        )

    inserted = sb.table("tools").insert(row).execute()
    tool_id = inserted.data[0]["id"]

    # Content blocks (6 dual-audience rows), matching discover-tools order.
    c = state["content"]
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
