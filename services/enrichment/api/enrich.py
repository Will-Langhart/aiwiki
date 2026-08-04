"""Vercel Python function (Fluid Compute) — triggered by a Supabase DB webhook.

Wire a Supabase Database Webhook on INSERT into public.enrichment_jobs to POST
here. The webhook payload's `record` carries the new row; we run that one job.
Fluid Compute's 300s default timeout comfortably covers a single-tool run.

For a manual/batch trigger, POST { "url": "https://..." } or { "poll": true }.
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler

from enrichment.runner import poll_and_run, run_job, run_url


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        length = int(self.headers.get("content-length", 0))
        body = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(body or b"{}")
        except json.JSONDecodeError:
            return self._send(400, {"error": "invalid JSON"})

        try:
            # Supabase DB webhook shape: { type, table, record: {...} }
            record = payload.get("record")
            if record and record.get("id") and record.get("url"):
                run_job(record["id"], record["url"])
                return self._send(200, {"ran_job": record["id"]})

            if payload.get("poll"):
                n = poll_and_run()
                return self._send(200, {"processed": n})

            if payload.get("url"):
                final = run_url(payload["url"])
                return self._send(200, {
                    "status": final.get("status"),
                    "tool_id": final.get("tool_id"),
                    "flags": final.get("flags", []),
                })

            return self._send(400, {"error": "expected a webhook record, {url}, or {poll:true}"})
        except Exception as exc:  # noqa: BLE001
            return self._send(500, {"error": str(exc)})

    def _send(self, code: int, obj: dict) -> None:
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(data)
