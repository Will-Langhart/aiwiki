"""Local CLI.

    # enrich a single URL directly (writes a draft + prints the flags)
    uv run enrich https://www.langchain.com

    # enrich a list of new-tool URLs (one per line, # comments ok); existing
    # tools are skipped before any LLM spend
    uv run enrich --file urls.txt

    # refresh existing published tools in place (auto-applies if verified)
    uv run enrich --refresh cursor perplexity
    uv run enrich --refresh-batch 25          # most-in-need first

    # apply a refresh proposal an admin has reviewed
    uv run enrich --apply-job <job_id>

    # drain the queued jobs in enrichment_jobs
    uv run enrich --poll

Add --dry-run to --refresh / --refresh-batch to run the graph and print what
would change without writing anything (LLM calls still cost money).
Batches stop cleanly when the daily cost cap is reached, and any one tool that
runs past ENRICH_TOOL_DEADLINE_S (600s) is failed so the batch moves on.
"""

from __future__ import annotations

import json
import sys

from dotenv import load_dotenv

from .deadline import ToolDeadlineExceeded, tool_deadline, tool_deadline_s
from .llm import DailyCapExceeded
from .runner import apply_job, poll_and_run, run_new, run_refresh, run_url, select_refresh_batch


def _print(obj: dict) -> None:
    print(json.dumps(obj, indent=2, default=str))


def _refresh_summary(ref: str, final: dict, dry_run: bool) -> dict:
    proposal = final.get("proposal") or {}
    status = final.get("status")
    if dry_run and status == "applied":
        status = "would_apply"
    return {
        "tool": ref,
        "status": status,
        "confidence": final.get("confidence"),
        "changed_fields": sorted((proposal.get("fields") or {}).keys()),
        "withheld": proposal.get("withheld", []),
        "reasons": proposal.get("reasons", []),
        "applied": final.get("applied_fields", []),
        "error": final.get("error"),
    }


def _refresh_many(refs: list[str], dry_run: bool) -> None:
    tally: dict[str, int] = {}
    for i, ref in enumerate(refs, 1):
        print(f"[{i}/{len(refs)}] {ref}", file=sys.stderr)
        try:
            with tool_deadline(tool_deadline_s()):
                summary = _refresh_summary(ref, run_refresh(ref, dry_run=dry_run), dry_run)
        except DailyCapExceeded as exc:
            print(f"Stopping: {exc}", file=sys.stderr)
            break
        except (Exception, ToolDeadlineExceeded) as exc:  # keep the batch going, report it
            summary = {"tool": ref, "status": "failed", "error": str(exc)}
        _print(summary)
        tally[summary["status"]] = tally.get(summary["status"], 0) + 1
    print(f"Done: {tally}", file=sys.stderr)


def _create_many(path: str) -> None:
    with open(path) as f:
        urls = [ln.strip() for ln in f if ln.strip() and not ln.lstrip().startswith("#")]
    tally: dict[str, int] = {}
    for i, url in enumerate(urls, 1):
        print(f"[{i}/{len(urls)}] {url}", file=sys.stderr)
        try:
            with tool_deadline(tool_deadline_s()):
                final = run_new(url)
        except DailyCapExceeded as exc:
            print(f"Stopping: {exc}", file=sys.stderr)
            break
        except (Exception, ToolDeadlineExceeded) as exc:
            final = {"status": "failed", "error": str(exc)}
        status = final.get("status") or "failed"
        if status == "failed" and ("duplicate" in (final.get("error") or "") or "already exists" in (final.get("error") or "")):
            status = "duplicate"
        _print({"url": url, "status": status, "tool_id": final.get("tool_id"),
                "confidence": final.get("confidence"), "error": final.get("error")})
        tally[status] = tally.get(status, 0) + 1
    print(f"Done: {tally}", file=sys.stderr)


def main() -> None:
    load_dotenv()
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    args = [a for a in args if a != "--dry-run"]

    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return

    if args[0] == "--poll":
        n = poll_and_run()
        print(f"Processed {n} queued job(s).")
        return

    if args[0] == "--file":
        _create_many(args[1])
        return

    if args[0] == "--refresh":
        _refresh_many(args[1:], dry_run)
        return

    if args[0] == "--refresh-batch":
        limit = int(args[1]) if len(args) > 1 else 10
        batch = select_refresh_batch(limit)
        _refresh_many([t["slug"] for t in batch], dry_run)
        return

    if args[0] == "--apply-job":
        _print({"job": args[1], "applied": apply_job(args[1])})
        return

    url = args[0]
    final = run_url(url)
    _print({
        "url": url,
        "status": final.get("status"),
        "tool_id": final.get("tool_id"),
        "confidence": final.get("confidence"),
        "error": final.get("error"),
        "flags": final.get("flags", []),
    })


if __name__ == "__main__":
    main()
