"""Single shared Supabase service-role client.

This is a trusted backend job runner, so the service role is the *correct* key
here (CLAUDE.md permits service role for scripts / non-user-facing jobs). It
must never be shipped to the browser.
"""

from __future__ import annotations

import os
from functools import lru_cache

import httpx
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    # postgrest-py builds its own client with http2=True when none is given.
    # Over a long batch an HTTP/2 connection to Supabase died silently and the
    # next request blocked for 47 minutes (fireflies-ai, 2026-10-05) despite
    # the 120s timeout. HTTP/1.1 with explicit timeouts fails fast instead;
    # these are small JSON requests, so multiplexing buys nothing here.
    http = httpx.Client(http2=False, timeout=httpx.Timeout(30.0, connect=10.0))
    return create_client(url, key, options=SyncClientOptions(httpx_client=http))
