/**
 * Weekly catalog-health report, printed as Markdown (the freshness workflow
 * appends it to the GitHub job summary). Report-only: it never writes to the DB.
 *
 *   npx tsx scripts/freshness-report.ts            # full report (checks every site)
 *   npx tsx scripts/freshness-report.ts --no-http  # skip the site checks
 *
 * Sections:
 *   1. Freshness — how much of the catalog was verified recently.
 *   2. Duplicate candidates — published tools sharing a site or a name.
 *   3. Site checks — dead sites (4xx/5xx/DNS) and sites that now redirect to
 *      another domain (rebrands, acquisitions, domains that changed hands).
 *   4. Refresh queue — proposals awaiting review and failed refreshes (needs
 *      the service-role key; skipped otherwise).
 *
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) and a key (service role
 * preferred, anon fallback) in the environment or .env.local.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CHECK_HTTP = !process.argv.includes("--no-http");
const HTTP_TIMEOUT_MS = 12_000;
const HTTP_CONCURRENCY = 12;
const DAY_MS = 86_400_000;

interface ToolRow {
  id: string;
  slug: string;
  name: string;
  website_url: string;
  last_verified_at: string | null;
}

async function allTools(sb: SupabaseClient): Promise<ToolRow[]> {
  const rows: ToolRow[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await sb
      .from("tools")
      .select("id, slug, name, website_url, last_verified_at")
      .eq("status", "published")
      .order("slug")
      .range(start, start + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as ToolRow[]));
    if (!data || data.length < 1000) return rows;
  }
}

function host(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url.toLowerCase();
  }
}

/** Host plus the first path segment, so github.com/features/copilot ≠ github.com. */
function siteKey(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean)[0];
    return seg ? `${host(url)}/${seg.toLowerCase()}` : host(url);
  } catch {
    return url.toLowerCase();
  }
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function groupBy(tools: ToolRow[], key: (t: ToolRow) => string): ToolRow[][] {
  const groups = new Map<string, ToolRow[]>();
  for (const t of tools) {
    const k = key(t);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

const link = (t: ToolRow) => `[${t.name}](https://aiwiki.io/tools/${t.slug})`;

type SiteResult =
  | { tool: ToolRow; kind: "dead" | "moved" | "rebranded"; detail: string }
  | { tool: ToolRow; kind: "ok" };

// Errors that say "this client couldn't read the site", not "the site is gone":
// bot walls that drop the connection, and Node's 16KB response-header limit
// (google.com, tabnine.com). Only DNS failures, bad certs and HTTP errors count.
const INCONCLUSIVE = new Set(["UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_OVERFLOW", "UND_ERR_SOCKET", "ECONNRESET"]);

/** "app.notion.so" → "notion" — the brand label, for telling TLD moves from rebrands. */
const label = (h: string) => (h.split(".").slice(-2)[0] ?? h).replace(/[^a-z0-9]/g, "");
/** stack-ai → stackai, runwayml → runway, klingai → kling: still the same brand. */
const sameBrand = (a: string, b: string) => a.includes(b) || b.includes(a);

async function checkSite(tool: ToolRow): Promise<SiteResult> {
  try {
    const res = await fetch(tool.website_url, {
      redirect: "follow",
      headers: { "User-Agent": "AIWikiBot/1.0 (+https://aiwiki.io/bot)", Accept: "text/html" },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    await res.body?.cancel();
    // 401/403/429 are bot walls (Cloudflare etc.), not evidence the product is gone.
    if (res.status >= 400 && ![401, 403, 429].includes(res.status)) {
      return { tool, kind: "dead", detail: `HTTP ${res.status}` };
    }
    const from = host(tool.website_url);
    const to = host(res.url);
    // Same registrable-ish domain (app.x.com → x.com) is not a move.
    const base = (h: string) => h.split(".").slice(-2).join(".");
    if (res.url && base(from) !== base(to)) {
      // notion.so → notion.com: same brand, update website_url.
      // codeium.com → devin.ai: rebrand or acquisition, needs a human look.
      return { tool, kind: sameBrand(label(from), label(to)) ? "moved" : "rebranded", detail: `${from} → ${to}` };
    }
    return { tool, kind: "ok" };
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    if (err instanceof Error && err.name === "TimeoutError") return { tool, kind: "ok" }; // slow ≠ dead
    if (cause && INCONCLUSIVE.has(cause)) return { tool, kind: "ok" };
    return { tool, kind: "dead", detail: cause ?? (err instanceof Error ? err.message : String(err)) };
  }
}

async function checkSites(tools: ToolRow[]): Promise<SiteResult[]> {
  const results: SiteResult[] = [];
  let next = 0;
  const worker = async () => {
    while (next < tools.length) {
      const t = tools[next++];
      results.push(await checkSite(t));
    }
  };
  await Promise.all(Array.from({ length: HTTP_CONCURRENCY }, worker));
  return results;
}

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = serviceKey ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL or a key — cannot build the report.");
    process.exit(1);
  }
  const sb = createClient(url, key);
  const tools = await allTools(sb);
  const now = Date.now();
  const age = (t: ToolRow) =>
    t.last_verified_at ? (now - new Date(t.last_verified_at).getTime()) / DAY_MS : Number.POSITIVE_INFINITY;

  const out: string[] = [];
  const p = (s = "") => out.push(s);

  p(`## Catalog health — ${new Date().toISOString().slice(0, 10)}`);
  p();
  p("### Freshness");
  p();
  p("| Published | Verified ≤30d | Verified ≤90d | Never verified |");
  p("|---:|---:|---:|---:|");
  p(
    `| ${tools.length} | ${tools.filter((t) => age(t) <= 30).length} | ${
      tools.filter((t) => age(t) <= 90).length
    } | ${tools.filter((t) => !t.last_verified_at).length} |`,
  );
  p();

  const bySite = groupBy(tools, (t) => siteKey(t.website_url));
  const byName = groupBy(tools, (t) => normName(t.name)).filter(
    (g) => !bySite.some((s) => s.includes(g[0])),
  );
  p(`### Duplicate candidates (${bySite.length + byName.length})`);
  p();
  p("Same site or same name. Some are distinct products on a shared domain — merge only true duplicates.");
  p();
  for (const g of bySite) p(`- \`${siteKey(g[0].website_url)}\`: ${g.map(link).join(", ")}`);
  for (const g of byName) p(`- name \`${g[0].name}\`: ${g.map(link).join(", ")}`);
  if (bySite.length + byName.length === 0) p("_None._");
  p();

  if (CHECK_HTTP) {
    const results = await checkSites(tools);
    const sections = [
      { kind: "dead", title: "Unreachable — possibly defunct; unpublish after a manual check" },
      { kind: "rebranded", title: "Redirects to a different brand — rebrand, acquisition or shutdown" },
      { kind: "moved", title: "Same brand, new domain — update website_url" },
    ] as const;
    p("### Site checks");
    p();
    for (const { kind, title } of sections) {
      const hits = results
        .filter((r): r is Extract<SiteResult, { detail: string }> => r.kind === kind)
        .sort((a, b) => a.tool.slug.localeCompare(b.tool.slug));
      p(`**${title} (${hits.length})**`);
      p();
      for (const r of hits) p(`- ${link(r.tool)} — ${r.detail}`);
      if (hits.length === 0) p("_None._");
      p();
    }
  }

  if (serviceKey) {
    const since = new Date(now - 30 * DAY_MS).toISOString();
    const { data: jobs } = await sb
      .from("enrichment_jobs")
      .select("id, status, error, proposal, tool_id, created_at")
      .eq("mode", "refresh")
      .in("status", ["needs_review", "failed"])
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    const bySlug = new Map(tools.map((t) => [t.id, t]));
    const rows = (jobs ?? []) as Array<{
      id: string;
      status: string;
      error: string | null;
      proposal: { reasons?: string[] } | null;
      tool_id: string | null;
    }>;
    p(`### Refresh queue — last 30 days (${rows.length})`);
    p();
    if (rows.length > 0) {
      p("Apply a reviewed proposal with `uv run enrich --apply-job <id>` (services/enrichment).");
      p();
      p("| Tool | Status | Why | Job |");
      p("|---|---|---|---|");
      for (const j of rows) {
        const t = j.tool_id ? bySlug.get(j.tool_id) : undefined;
        const why = (j.status === "failed" ? j.error : j.proposal?.reasons?.join("; ")) ?? "";
        p(`| ${t ? link(t) : "—"} | ${j.status} | ${why.replace(/\|/g, "/").slice(0, 160)} | \`${j.id}\` |`);
      }
    } else {
      p("_Nothing waiting._");
    }
    p();
  }

  console.log(out.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
