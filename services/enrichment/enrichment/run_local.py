"""Local CLI.

    # enrich a single URL directly (writes a draft + prints the flags)
    uv run enrich https://www.langchain.com

    # drain the queued jobs in enrichment_jobs
    uv run enrich --poll
"""

from __future__ import annotations

import json
import sys

from dotenv import load_dotenv

from .runner import poll_and_run, run_url


def main() -> None:
    load_dotenv()
    args = sys.argv[1:]

    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return

    if args[0] == "--poll":
        n = poll_and_run()
        print(f"Processed {n} queued job(s).")
        return

    url = args[0]
    final = run_url(url)
    print(json.dumps({
        "url": url,
        "status": final.get("status"),
        "tool_id": final.get("tool_id"),
        "confidence": final.get("confidence"),
        "flags": final.get("flags", []),
    }, indent=2))


if __name__ == "__main__":
    main()
