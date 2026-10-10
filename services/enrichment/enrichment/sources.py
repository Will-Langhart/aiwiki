"""INGEST: gather grounding material from multiple sources.

The single-shot extractor only ever saw the homepage (10K chars), which forced
it to *guess* at github_stars, founded_year, pricing, etc. Here we pull real
ground truth wherever we can — a homepage, a /pricing page, and the GitHub API —
so later nodes have facts to cite instead of gaps to invent.
"""

from __future__ import annotations

import os
import re
from urllib.parse import urljoin, urlparse

import httpx

from .state import Source

# A browser-like UA + Accept header — many marketing sites 403 an obvious bot.
_UA = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
_TAG_RE = re.compile(r"<[^>]+>")
_SCRIPT_RE = re.compile(r"<(script|style)[\s\S]*?</\1>", re.IGNORECASE)


def _to_text(html: str) -> str:
    html = _SCRIPT_RE.sub(" ", html)
    text = _TAG_RE.sub(" ", html)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
    )
    return re.sub(r"\s+", " ", text).strip()


def _domain(url: str) -> str:
    try:
        return urlparse(url).hostname.replace("www.", "")  # type: ignore[union-attr]
    except Exception:
        return url


# Statuses a bot wall (Cloudflare's JS challenge, etc.) answers with. A browser
# UA doesn't get past these — chatgpt.com, perplexity.ai, midjourney.com and
# make.com all 403 every plain HTTP client — so they go to the reader fallback.
_BLOCKED = {401, 403, 429, 503}
_CHALLENGE_RE = re.compile(r"just a moment|verify you are human|cf-chl|challenge-platform", re.IGNORECASE)
# Below this, reader output is a JS shell or a challenge page, not content.
_READER_MIN_CHARS = 1_500
# A 200 whose visible text is shorter than this is a client-rendered JS shell
# (perplexity.ai serves 18KB of HTML with ~10 characters of text).
_JS_SHELL_MAX_CHARS = 200
_PRICE_RE = re.compile(r"[$€£]\s?\d")
_MD_LINK_RE = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")


def _reader_enabled() -> bool:
    return os.environ.get("ENRICH_READER_FALLBACK", "1") not in ("0", "false", "")


def _fetch_via_reader(client: httpx.Client, url: str) -> tuple[str | None, str]:
    """Fetch a bot-walled page through a reader service that renders it in a
    real browser (default r.jina.ai, free tier, no key). Only public tool URLs
    are ever sent. Returns plain text (markdown links flattened), or None."""
    base = os.environ.get("ENRICH_READER_URL", "https://r.jina.ai/")
    try:
        r = client.get(f"{base}{url}", headers={"Accept": "text/plain"}, timeout=45)
    except Exception as exc:  # noqa: BLE001
        return None, f"reader error: {type(exc).__name__}"
    if r.status_code != 200:
        return None, f"reader HTTP {r.status_code}"
    text = r.text.split("Markdown Content:", 1)[-1]
    # Flatten links to their text, except GitHub ones — _github_target needs the URL.
    text = _MD_LINK_RE.sub(lambda m: m.group(0) if "github.com/" in m.group(0) else m.group(1), text)
    if len(text) < _READER_MIN_CHARS or _CHALLENGE_RE.search(text[:3_000]):
        return None, "reader got no content (still blocked)"
    return text, ""


def _fetch(client: httpx.Client, url: str) -> tuple[str | None, str]:
    """Return (html_or_none, reason). reason is '' on success, else diagnostic.

    A bot-walled page (403/429/503 or a challenge body) is retried once through
    the reader service; its plain-text output passes through _to_text unchanged.
    So is a 200 that is only a JS shell — but there the original page is kept
    if the reader can't do better.
    """
    try:
        r = client.get(url, headers=_UA, follow_redirects=True, timeout=20)
    except Exception as exc:  # noqa: BLE001
        return None, f"request error: {type(exc).__name__}"
    if r.status_code in _BLOCKED and _reader_enabled():
        text, err = _fetch_via_reader(client, url)
        if text:
            return text, ""
        return None, f"HTTP {r.status_code}; {err}"
    if not (200 <= r.status_code < 300):
        return None, f"HTTP {r.status_code}"
    # A 200 that's a challenge page or an empty JS shell: try the reader, but keep
    # the original if the reader can't do better.
    is_html = "html" in r.headers.get("content-type", "")
    if _reader_enabled() and is_html and (
        _CHALLENGE_RE.search(r.text[:5_000]) or len(_to_text(r.text)) < _JS_SHELL_MAX_CHARS
    ):
        text, _ = _fetch_via_reader(client, url)
        if text:
            return text, ""
    ctype = r.headers.get("content-type", "")
    if ctype and not any(t in ctype for t in ("html", "xml", "text/plain")):
        return None, f"non-HTML content-type: {ctype}"
    return r.text, ""


# GitHub path segments that are never a user/org or repo name.
_GH_NON_REPO = {
    "features", "about", "pricing", "login", "join", "sponsors", "orgs",
    "topics", "collections", "marketplace", "explore", "settings",
    "notifications", "search", "apps", "site", "readme", "contact",
}


def _github_target(html: str, domain: str) -> tuple[str, str] | None:
    """Discover a GitHub target from links.

    Returns ('repo', 'owner/repo') when a specific repo is linked, or
    ('org', 'orgname') when only an org/user is linked (common on marketing
    sites). Returns None if nothing GitHub-ish is found.
    """
    if "github.com" in domain:
        parts = [p for p in urlparse("https://" + domain).path.strip("/").split("/") if p]
        if len(parts) >= 2:
            return ("repo", f"{parts[0]}/{parts[1]}")
        if len(parts) == 1:
            return ("org", parts[0])

    org: str | None = None
    for m in re.finditer(r"github\.com/([\w.-]+)(?:/([\w.-]+))?", html):
        owner, name = m.group(1), m.group(2)
        if owner.lower() in _GH_NON_REPO:
            continue
        if name and name.lower() not in _GH_NON_REPO and not name.lower().endswith(
            (".png", ".svg", ".jpg", ".gif", ".css", ".js")
        ):
            return ("repo", f"{owner}/{name}")
        if org is None:
            org = owner
    return ("org", org) if org else None


def _github_top_repo_for_org(client: httpx.Client, org: str) -> str | None:
    """The org/user's most-starred public repo — authoritative stand-in when a
    site only links to its GitHub org, not a specific repo."""
    r = _gh_api(
        client,
        f"https://api.github.com/search/repositories?q=org:{org}&sort=stars&order=desc&per_page=1",
    )
    if r is None:
        # `org:` only matches organizations; retry as a user account.
        r = _gh_api(
            client,
            f"https://api.github.com/search/repositories?q=user:{org}&sort=stars&order=desc&per_page=1",
        )
    if r and r.get("items"):
        return r["items"][0]["full_name"]
    return None


def ingest(url: str) -> list[Source]:
    sources: list[Source] = []
    domain = _domain(url)

    with httpx.Client() as client:
        home_html, home_err = _fetch(client, url)
        if home_html:
            sources.append(
                {"origin_url": url, "kind": "homepage", "text": _to_text(home_html)[:12_000]}
            )

        # Pricing page — try the conventional path. Many render their plans with
        # JS (chatgpt.com/pricing: 24K chars of static text, not one price), so
        # a pricing page without a single amount gets one try via the reader.
        pricing_url = urljoin(url, "/pricing")
        pricing_html, _ = _fetch(client, pricing_url)
        if pricing_html and _reader_enabled() and not _PRICE_RE.search(_to_text(pricing_html)):
            rendered, _ = _fetch_via_reader(client, pricing_url)
            if rendered and _PRICE_RE.search(rendered):
                pricing_html = rendered
        if pricing_html:
            sources.append(
                {"origin_url": pricing_url, "kind": "pricing", "text": _to_text(pricing_html)[:6_000]}
            )

        # GitHub API — real stars / license / creation date, zero guessing.
        target = _github_target(home_html or "", domain)
        repo = None
        if target:
            kind, val = target
            repo = val if kind == "repo" else _github_top_repo_for_org(client, val)
        if repo:
            gh = _github_meta(client, repo)
            if gh:
                sources.append({"origin_url": f"https://github.com/{repo}", "kind": "github", "text": gh})

    reason = "" if sources else (home_err or "no content")
    return sources, reason


def _gh_api(client: httpx.Client, url: str) -> dict | None:
    token = os.environ.get("GITHUB_TOKEN")
    # _UA carries a browser Accept; the GitHub Accept must win, so override after.
    headers = {**_UA, "Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        r = client.get(url, headers=headers, timeout=20)
        return r.json() if r.status_code == 200 else None
    except Exception:
        return None


def _github_meta(client: httpx.Client, repo: str) -> str | None:
    d = _gh_api(client, f"https://api.github.com/repos/{repo}")
    if not d:
        return None

    created_year = (d.get("created_at") or "")[:4]
    license_name = (d.get("license") or {}).get("name") if d.get("license") else None
    # Rendered as authoritative source text the extractor can quote verbatim.
    return (
        f"GitHub API (authoritative) for {repo}: "
        f"stargazers_count={d.get('stargazers_count')}; "
        f"open_source=true (public repo); "
        f"license={license_name or 'none'}; "
        f"created_year={created_year or 'unknown'}; "
        f"description={d.get('description') or ''}"
    )
