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


def _fetch(client: httpx.Client, url: str) -> tuple[str | None, str]:
    """Return (html_or_none, reason). reason is '' on success, else diagnostic."""
    try:
        r = client.get(url, headers=_UA, follow_redirects=True, timeout=20)
    except Exception as exc:  # noqa: BLE001
        return None, f"request error: {type(exc).__name__}"
    if not (200 <= r.status_code < 300):
        return None, f"HTTP {r.status_code}"
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

        # Pricing page — try the conventional path.
        pricing_url = urljoin(url, "/pricing")
        pricing_html, _ = _fetch(client, pricing_url)
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
