/**
 * Calls the discover-tools edge function with a curated list of AI tool URLs.
 * Run via:  npx tsx scripts/discover-tools.ts
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * The edge function scrapes each URL, extracts structured data with Claude,
 * and upserts tools directly into the database as published.
 *
 * Batches of 1 to stay within the $5/day cost cap and avoid timeouts.
 * Estimated cost: ~$0.03–0.06 per tool.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// ─── Curated list of high-quality AI tool URLs ────────────────────────────────
// Batch refreshed 2026-06-15. All 75 URLs verified absent from the existing
// 259 published tools. Weighted toward thin categories (MLOps, Presentations,
// Search, Data, Audio, Marketing) while spanning all categories plus trending
// coding / agent / voice tools. The edge function upserts by slug → safe to re-run.
const TOOL_URLS = [
  // ── MLOps & Training (was empty) ──────────────────────────────────────────
  "https://determined.ai",
  "https://kubeflow.org",
  "https://zenml.io",
  "https://bentoml.com",
  "https://snorkel.ai",
  "https://argilla.io",
  "https://v7labs.com",
  "https://encord.com",

  // ── Presentations & Docs ────────────────────────────────────────────────────
  "https://canva.com",
  "https://plus.ai",
  "https://decktopus.com",
  "https://popai.pro",
  "https://chatpdf.com",
  "https://pdf.ai",

  // ── Search & Research ─────────────────────────────────────────────────────────
  "https://glean.com",
  "https://genspark.ai",
  "https://felo.ai",
  "https://hebbia.com",
  "https://researchrabbit.ai",
  "https://connectedpapers.com",

  // ── Data & Analytics ──────────────────────────────────────────────────────────
  "https://databricks.com",
  "https://hex.tech",
  "https://deepnote.com",
  "https://equals.com",
  "https://definite.app",
  "https://fabi.ai",
  "https://mode.com",

  // ── Audio & Music ─────────────────────────────────────────────────────────────
  "https://moises.ai",
  "https://lalal.ai",
  "https://beatoven.ai",
  "https://mubert.com",
  "https://landr.com",
  "https://podcastle.ai",
  "https://camb.ai",

  // ── Marketing & Sales ─────────────────────────────────────────────────────────
  "https://writer.com",
  "https://clari.com",
  "https://outreach.io",
  "https://6sense.com",
  "https://regie.ai",
  "https://adcreative.ai",

  // ── Coding & Development (trending) ───────────────────────────────────────────
  "https://augmentcode.com",
  "https://zed.dev",
  "https://qodo.ai",
  "https://warp.dev",
  "https://supermaven.com",
  "https://trae.ai",

  // ── Agent Frameworks ──────────────────────────────────────────────────────────
  "https://e2b.dev",
  "https://composio.dev",
  "https://langflow.org",
  "https://griptape.ai",
  "https://superagent.sh",

  // ── AI Infrastructure ─────────────────────────────────────────────────────────
  "https://openrouter.ai",
  "https://runpod.io",
  "https://lambdalabs.com",
  "https://cerebras.ai",
  "https://sambanova.ai",

  // ── Automation & Agents ──────────────────────────────────────────────────────
  "https://pipedream.com",
  "https://tray.io",
  "https://browse.ai",
  "https://stack-ai.com",

  // ── Image Generation (trending) ───────────────────────────────────────────────
  "https://recraft.ai",
  "https://magnific.ai",
  "https://freepik.com",
  "https://lexica.art",

  // ── Video Generation (trending) ───────────────────────────────────────────────
  "https://kapwing.com",
  "https://haiper.ai",
  "https://tavus.io",
  "https://hedra.com",

  // ── Voice & Speech (trending) ─────────────────────────────────────────────────
  "https://vapi.ai",
  "https://retellai.com",
  "https://bland.ai",
  "https://hume.ai",

  // ── Design (UI/UX) ─────────────────────────────────────────────────────────────
  "https://visily.ai",
  "https://uxpilot.ai",

  // ── Writing & Editing ─────────────────────────────────────────────────────────
  "https://lex.page",
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBatch(urls: string[], batchNum: number, total: number) {
  console.log(`\n📦 Batch ${batchNum}/${total}: processing ${urls.length} URLs...`);

  let res: Response;
  try {
    res = await fetch(
      `${SUPABASE_URL}/functions/v1/discover-tools`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ urls }),
      }
    );
  } catch (e) {
    // Network-level failure (ECONNRESET, DNS, timeout). Skip this batch instead
    // of crashing the whole run — upsert-by-slug makes a later re-run safe.
    console.error(`  ✗ Batch ${batchNum} network error: ${(e as Error).message} — skipping`);
    return;
  }

  if (!res.ok) {
    const err = await res.text();
    console.error(`  ✗ Batch ${batchNum} failed (HTTP ${res.status}): ${err}`);
    return;
  }

  const data = await res.json() as {
    results: Array<{ url: string; slug: string | null; status: string; error?: string }>;
    summary: { succeeded: number; errored: number; total: number };
  };

  for (const r of data.results) {
    const icon = r.status === "error" ? "✗" : "✓";
    const detail = r.status === "error" ? r.error : r.slug;
    console.log(`  ${icon} ${r.url.replace("https://", "").slice(0, 40).padEnd(40)} → ${detail}`);
  }

  console.log(`  Summary: ${data.summary.succeeded}/${data.summary.total} succeeded`);
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const BATCH_SIZE = 1;
  const batches: string[][] = [];
  for (let i = 0; i < TOOL_URLS.length; i += BATCH_SIZE) {
    batches.push(TOOL_URLS.slice(i, i + BATCH_SIZE));
  }

  console.log(`🤖 Discovering ${TOOL_URLS.length} AI tools in ${batches.length} batches of ${BATCH_SIZE}`);
  console.log(`💰 Estimated cost: $${(TOOL_URLS.length * 0.03).toFixed(2)}–$${(TOOL_URLS.length * 0.06).toFixed(2)}`);
  console.log();

  for (let i = 0; i < batches.length; i++) {
    await runBatch(batches[i], i + 1, batches.length);
    if (i < batches.length - 1) {
      await sleep(3000);
    }
  }

  console.log("\n✅ Discovery complete!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
