"""Drive the graph for one job and reconcile the enrichment_jobs row.

Job lifecycle:
  create:   queued → running → needs_review (draft written) | failed
  refresh:  queued → running → applied (written live) | needs_review (proposal) | failed
The tool row itself is written inside the graph's persist node.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .graph import build_graph
from .persist import find_existing_tool
from .refresh import apply_proposal
from .state import EnrichmentState
from .supabase_client import get_supabase

_GRAPH = None


def _graph():
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_graph()
    return _GRAPH


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_url(url: str, job_id: str | None = None, dry_run: bool = False) -> EnrichmentState:
    """Run the full create pipeline for a single URL. Returns the terminal state.

    dry_run=True runs every node except the DB write (used by shadow-diff).
    A URL that matches an existing tool fails fast, before any LLM spend.
    """
    if not dry_run:
        dup = find_existing_tool(url)
        if dup:
            return {
                "status": "failed",
                "error": f"duplicate of existing tool '{dup['slug']}' ({dup['website_url']})",
                "flags": [],
            }
    initial: EnrichmentState = {"url": url, "flags": [], "retries": 0, "dry_run": dry_run, "mode": "create"}
    if job_id:
        initial["job_id"] = job_id
    # recursion_limit guards against pathological retry loops.
    return _graph().invoke(initial, {"recursion_limit": 25})


def _require_refresh_schema(sb) -> None:
    """Fail clearly if migration 0029 isn't applied.

    Without the column, PostgREST resolves `mode` to Postgres's mode() aggregate
    and returns the baffling "WITHIN GROUP is required" error instead.
    """
    try:
        sb.table("enrichment_jobs").select("mode,proposal,applied_fields").limit(1).execute()
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Refresh mode needs migration 0029_enrichment_refresh_mode.sql — "
            f"apply it to this database first ({exc})"
        ) from None


def _load_tool(ref: str) -> dict:
    """A tools row by id or slug."""
    sb = get_supabase()
    col = "id" if len(ref) == 36 and ref.count("-") == 4 else "slug"
    rows = sb.table("tools").select("*").eq(col, ref).limit(1).execute().data
    if not rows:
        raise LookupError(f"no tool with {col} '{ref}'")
    row = rows[0]
    row.pop("embedding", None)
    row.pop("search_vector", None)
    return row


def run_refresh(ref: str, dry_run: bool = False, job_id: str | None = None) -> EnrichmentState:
    """Refresh one existing tool (by id or slug) in place. Returns the terminal state.

    Records an enrichment_jobs row (mode='refresh') unless dry_run.
    """
    sb = get_supabase()
    _require_refresh_schema(sb)
    tool = _load_tool(ref)
    if not dry_run and job_id is None:
        job_id = (
            sb.table("enrichment_jobs")
            .insert({"url": tool["website_url"], "tool_id": tool["id"], "mode": "refresh", "status": "running", "attempts": 1})
            .execute()
            .data[0]["id"]
        )
    elif job_id and not dry_run:  # a queued job (poll / webhook) — claim it
        sb.table("enrichment_jobs").update(
            {"status": "running", "attempts": _bump_attempts(sb, job_id)}
        ).eq("id", job_id).execute()
    initial: EnrichmentState = {
        "url": tool["website_url"],
        "mode": "refresh",
        "tool_id": tool["id"],
        "existing": tool,
        "flags": [],
        "retries": 0,
        "dry_run": dry_run,
    }
    if job_id:
        initial["job_id"] = job_id
    try:
        final = _graph().invoke(initial, {"recursion_limit": 25})
    except Exception as exc:  # noqa: BLE001 — record any failure on the job row
        if job_id and not dry_run:
            _finish(sb, job_id, "failed", error=str(exc))
        raise
    if job_id and not dry_run:
        _finish(
            sb,
            job_id,
            final.get("status", "failed"),
            tool_id=tool["id"],
            confidence=final.get("confidence"),
            error=final.get("error"),
            flags=final.get("flags"),
            proposal=final.get("proposal"),
            applied_fields=final.get("applied_fields"),
        )
    return final


def select_refresh_batch(limit: int, skip_days: int = 30) -> list[dict]:
    """Published tools to refresh next, most in need first.

    Order: no content blocks → overview-only → everything else; oldest
    updated_at first within each band. Tools with a refresh job in the last
    `skip_days` days are skipped, so a failed or parked tool isn't retried daily.
    """
    sb = get_supabase()
    _require_refresh_schema(sb)
    tools = _all(sb, "tools", "id,slug,name,updated_at", status="published")
    blocks = _all(sb, "content_blocks", "tool_id")
    since = (datetime.now(timezone.utc) - timedelta(days=skip_days)).isoformat()
    recent = {
        r["tool_id"]
        for r in _all(sb, "enrichment_jobs", "tool_id", mode="refresh", gte=("created_at", since))
    }
    counts: dict[str, int] = {}
    for b in blocks:
        counts[b["tool_id"]] = counts.get(b["tool_id"], 0) + 1

    def band(t: dict) -> int:
        n = counts.get(t["id"], 0)
        return 0 if n == 0 else 1 if n <= 2 else 2

    todo = [t for t in tools if t["id"] not in recent]
    todo.sort(key=lambda t: (band(t), t["updated_at"]))
    return todo[:limit]


def apply_job(job_id: str) -> list[str]:
    """Apply a parked refresh proposal (admin-reviewed) to the live tool."""
    sb = get_supabase()
    job = sb.table("enrichment_jobs").select("*").eq("id", job_id).single().execute().data
    if not job or job.get("mode") != "refresh" or job.get("status") != "needs_review" or not job.get("proposal"):
        raise ValueError(f"job {job_id} is not a refresh proposal awaiting review")
    applied = apply_proposal(job["tool_id"], job["proposal"])
    _finish(sb, job_id, "applied", applied_fields=applied)
    return applied


def _all(sb, table: str, cols: str, gte: tuple[str, str] | None = None, **eq) -> list[dict]:
    """Every row of a filtered select, paging past PostgREST's 1000-row cap."""
    rows, start = [], 0
    while True:
        q = sb.table(table).select(cols)
        for k, v in eq.items():
            q = q.eq(k, v)
        if gte:
            q = q.gte(*gte)
        page = q.range(start, start + 999).execute().data or []
        rows += page
        if len(page) < 1000:
            return rows
        start += 1000


def run_new(url: str) -> EnrichmentState:
    """Create-mode run for one URL with an enrichment_jobs row as its review record.

    Duplicates are rejected before the job row is created, so they leave no trace.
    """
    dup = find_existing_tool(url)
    if dup:
        return {"status": "failed", "error": f"duplicate of existing tool '{dup['slug']}' ({dup['website_url']})"}
    sb = get_supabase()
    job_id = sb.table("enrichment_jobs").insert({"url": url, "mode": "create", "status": "queued"}).execute().data[0]["id"]
    return run_job(job_id, url)


def run_job(job_id: str, url: str) -> EnrichmentState:
    """Run one enrichment_jobs row end-to-end, updating its status."""
    sb = get_supabase()
    sb.table("enrichment_jobs").update(
        {"status": "running", "attempts": _bump_attempts(sb, job_id)}
    ).eq("id", job_id).execute()

    try:
        final = run_url(url, job_id=job_id)
        if final.get("status") == "failed":
            _finish(sb, job_id, "failed", error=final.get("error"), flags=final.get("flags"))
            return final
        _finish(
            sb,
            job_id,
            "needs_review",
            tool_id=final.get("tool_id"),
            confidence=final.get("confidence"),
            flags=final.get("flags"),
        )
        return final
    except Exception as exc:  # noqa: BLE001 — record any failure on the job row
        _finish(sb, job_id, "failed", error=str(exc))
        raise


def poll_and_run(limit: int = 5) -> int:
    """Claim up to `limit` queued jobs and run them. Returns count processed."""
    sb = get_supabase()
    queued = (
        sb.table("enrichment_jobs")
        .select("id,url,mode,tool_id")
        .eq("status", "queued")
        .order("created_at")
        .limit(limit)
        .execute()
        .data
        or []
    )
    for job in queued:
        if job.get("mode") == "refresh" and job.get("tool_id"):
            run_refresh(job["tool_id"], job_id=job["id"])
        else:
            run_job(job["id"], job["url"])
    return len(queued)


def _bump_attempts(sb, job_id: str) -> int:
    row = sb.table("enrichment_jobs").select("attempts").eq("id", job_id).single().execute()
    return int((row.data or {}).get("attempts", 0)) + 1


def _finish(
    sb, job_id, status, *, tool_id=None, confidence=None, error=None, flags=None, proposal=None, applied_fields=None
):
    update = {"status": status, "finished_at": _now()}
    if tool_id is not None:
        update["tool_id"] = tool_id
    if confidence is not None:
        update["confidence"] = confidence
    if error is not None:
        update["error"] = error[:2000]
    if flags is not None:
        update["flags"] = flags
    if proposal is not None:
        update["proposal"] = proposal
    if applied_fields is not None:
        update["applied_fields"] = applied_fields
    sb.table("enrichment_jobs").update(update).eq("id", job_id).execute()
