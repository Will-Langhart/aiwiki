"""Single shared Supabase service-role client.

This is a trusted backend job runner, so the service role is the *correct* key
here (CLAUDE.md permits service role for scripts / non-user-facing jobs). It
must never be shipped to the browser.
"""

from __future__ import annotations

import os
from functools import lru_cache

from supabase import Client, create_client


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)
