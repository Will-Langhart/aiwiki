"""Drive the graph for one job and reconcile the enrichment_jobs row.

Job lifecycle:  queued → running → needs_review | failed
The tool row itself is written as a draft inside the graph's persist node.
"""

from __future__ import annotations

from datetime import datetime, timezone

from .graph import build_graph
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
    """Run the full pipeline for a single URL. Returns the terminal state.

    dry_run=True runs every node except the DB write (used by shadow-diff).
    """
    initial: EnrichmentState = {"url": url, "flags": [], "retries": 0, "dry_run": dry_run}
    if job_id:
        initial["job_id"] = job_id
    # recursion_limit guards against pathological retry loops.
    return _graph().invoke(initial, {"recursion_limit": 25})


def run_job(job_id: str, url: str) -> None:
    """Run one enrichment_jobs row end-to-end, updating its status."""
    sb = get_supabase()
    sb.table("enrichment_jobs").update(
        {"status": "running", "attempts": _bump_attempts(sb, job_id)}
    ).eq("id", job_id).execute()

    try:
        final = run_url(url, job_id=job_id)
        if final.get("status") == "failed":
            _finish(sb, job_id, "failed", error=final.get("error"), flags=final.get("flags"))
            return
        _finish(
            sb,
            job_id,
            "needs_review",
            tool_id=final.get("tool_id"),
            confidence=final.get("confidence"),
            flags=final.get("flags"),
        )
    except Exception as exc:  # noqa: BLE001 — record any failure on the job row
        _finish(sb, job_id, "failed", error=str(exc))
        raise


def poll_and_run(limit: int = 5) -> int:
    """Claim up to `limit` queued jobs and run them. Returns count processed."""
    sb = get_supabase()
    queued = (
        sb.table("enrichment_jobs")
        .select("id,url")
        .eq("status", "queued")
        .order("created_at")
        .limit(limit)
        .execute()
        .data
        or []
    )
    for job in queued:
        run_job(job["id"], job["url"])
    return len(queued)


def _bump_attempts(sb, job_id: str) -> int:
    row = sb.table("enrichment_jobs").select("attempts").eq("id", job_id).single().execute()
    return int((row.data or {}).get("attempts", 0)) + 1


def _finish(sb, job_id, status, *, tool_id=None, confidence=None, error=None, flags=None):
    update = {"status": status, "finished_at": _now()}
    if tool_id is not None:
        update["tool_id"] = tool_id
    if confidence is not None:
        update["confidence"] = confidence
    if error is not None:
        update["error"] = error[:2000]
    if flags is not None:
        update["flags"] = flags
    sb.table("enrichment_jobs").update(update).eq("id", job_id).execute()
