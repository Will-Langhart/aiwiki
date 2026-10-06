"""Per-tool wall-clock deadline for CLI batches.

Library timeouts don't cover every hang: an HTTP/2 connection to Supabase died
silently and a request blocked for 47 minutes despite its 120s timeout. This is
the backstop — one tool can take at most ENRICH_TOOL_DEADLINE_S (default 600s;
a normal run is ~60s), then it fails and the batch moves on.

`ToolDeadlineExceeded` is a BaseException on purpose: the Anthropic and httpx
clients catch `Exception` around requests to retry or re-wrap, which would
swallow it and keep waiting. Runner code that records job failures catches it
explicitly.

Uses SIGALRM, so it only arms in the main thread of a Unix process (the CLI).
Elsewhere — e.g. the Vercel function — it is a no-op and the platform's own
timeout is the backstop.
"""

from __future__ import annotations

import os
import signal
import threading
from collections.abc import Iterator
from contextlib import contextmanager


class ToolDeadlineExceeded(BaseException):
    """One tool's run exceeded ENRICH_TOOL_DEADLINE_S."""


def tool_deadline_s() -> float:
    return float(os.environ.get("ENRICH_TOOL_DEADLINE_S", "600"))


@contextmanager
def tool_deadline(seconds: float) -> Iterator[None]:
    if seconds <= 0 or not hasattr(signal, "SIGALRM") or threading.current_thread() is not threading.main_thread():
        yield
        return

    def _expire(_signum, _frame):
        raise ToolDeadlineExceeded(f"exceeded the {seconds:.0f}s per-tool deadline")

    previous = signal.signal(signal.SIGALRM, _expire)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)
