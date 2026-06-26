import { useState } from "react";
import { supabase } from "@/lib/supabase.client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Loader2, Globe } from "lucide-react";

interface DiscoverResult {
  url: string;
  slug: string | null;
  status: "inserted" | "updated" | "error";
  error?: string;
}

interface BatchResult {
  results: DiscoverResult[];
  summary: { succeeded: number; errored: number; total: number };
}

const STATUS_ICON = {
  inserted: <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />,
  updated: <CheckCircle2 size={14} className="text-blue-500 shrink-0" />,
  error: <XCircle size={14} className="text-danger shrink-0" />,
};

const STATUS_LABEL = {
  inserted: "inserted",
  updated: "updated",
  error: "error",
};

const PLACEHOLDER = [
  "https://cursor.so",
  "https://midjourney.com",
  "https://elevenlabs.io",
  "— one URL per line, up to 20 per batch —",
].join("\n");

export default function AdminDiscover() {
  const [raw, setRaw] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<DiscoverResult[]>([]);
  const [summary, setSummary] = useState<BatchResult["summary"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urls = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("http"));

  async function handleImport() {
    if (urls.length === 0) return;
    setRunning(true);
    setResults([]);
    setSummary(null);
    setError(null);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

    // Process in chunks of 20
    const chunks: string[][] = [];
    for (let i = 0; i < urls.length; i += 20) {
      chunks.push(urls.slice(i, i + 20));
    }

    const allResults: DiscoverResult[] = [];
    let totalSucceeded = 0;
    let totalErrored = 0;

    for (const chunk of chunks) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/discover-tools`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ urls: chunk }),
        });
        const json = await res.json() as BatchResult & { error?: string };
        if (!res.ok) {
          setError(json.error ?? `HTTP ${res.status}`);
          break;
        }
        allResults.push(...json.results);
        totalSucceeded += json.summary.succeeded;
        totalErrored += json.summary.errored;
        setResults([...allResults]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
        break;
      }
    }

    setSummary({ succeeded: totalSucceeded, errored: totalErrored, total: allResults.length });
    setRunning(false);
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl h-[calc(100vh-6rem)] overflow-y-auto pr-1">
      <div>
        <h1 className="text-xl font-bold text-text">Discover tools</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Paste tool URLs — one per line. Each is scraped and indexed via Claude. Up to 20 per batch.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {summary && (
        <div className="flex items-center gap-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
          <span className="text-text-muted">Total: <strong className="text-text">{summary.total}</strong></span>
          <span className="text-emerald-600">Succeeded: <strong>{summary.succeeded}</strong></span>
          {summary.errored > 0 && (
            <span className="text-danger">Errored: <strong>{summary.errored}</strong></span>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Results</h2>
            <span className="text-xs text-text-subtle">{results.length} processed</span>
          </div>
          <div className="divide-y divide-border/50 max-h-[40vh] overflow-y-auto">
            {[...results].reverse().map((r) => (
              <div key={r.url} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <span className="mt-0.5">{STATUS_ICON[r.status]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-text truncate">{r.url}</p>
                  {r.slug && (
                    <a
                      href={`/tools/${r.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-accent hover:underline"
                    >
                      /tools/{r.slug}
                    </a>
                  )}
                  {r.error && <p className="text-xs text-danger mt-0.5">{r.error}</p>}
                </div>
                <span className={`text-xs shrink-0 ${r.status === "error" ? "text-danger" : "text-text-subtle"}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={8}
          className="font-mono text-sm resize-y"
          disabled={running}
        />
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-text-subtle">
            {urls.length === 0
              ? "No valid URLs detected"
              : `${urls.length} URL${urls.length === 1 ? "" : "s"} detected${urls.length > 20 ? ` — will run in ${Math.ceil(urls.length / 20)} batches` : ""}`}
          </p>
          <Button
            onClick={handleImport}
            disabled={urls.length === 0 || running}
            className="gap-2 shrink-0"
          >
            {running ? (
              <><Loader2 size={14} className="animate-spin" /> Importing…</>
            ) : (
              <><Globe size={14} /> Import {urls.length > 0 ? urls.length : ""} tool{urls.length !== 1 ? "s" : ""}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
