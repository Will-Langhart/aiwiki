/**
 * Calls the discover-tools edge function with a curated list of AI tool URLs.
 * Run via:  npx tsx scripts/discover-tools.ts
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * The edge function scrapes each URL, extracts structured data with Claude,
 * and upserts tools directly into the database as published.
 *
 * Batches of 5 to stay within the $5/day cost cap and avoid timeouts.
 * Estimated cost: ~$0.02–0.05 per tool.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// ─── Curated list of high-quality AI tool URLs ────────────────────────────────
// Updated 2026-06-10 after extensive internet research across all 14 categories.
// The edge function upserts by slug so re-running is safe.
const TOOL_URLS = [
  // ── Coding & Development (resuming from batch 19) ──────────────────────────
  // deepseek,poe,you,pi,copilot,character,heypi,kore,windsurf,lovable,bolt,
  // v0,coderabbit,aider,aws-q,continue,cline,phind,sourcegraph already done
  "https://pieces.app",
  "https://replit.com",

  // ── Image Generation ──────────────────────────────────────────────────────────
  "https://ideogram.ai",
  "https://leonardo.ai",
  "https://fal.ai",
  "https://civitai.com",
  "https://getimg.ai",
  "https://krea.ai",
  "https://clipdrop.co",
  "https://photoroom.com",
  "https://tensor.art",

  // ── Video Generation ──────────────────────────────────────────────────────────
  "https://opusclip.com",
  "https://descript.com",
  "https://loom.com",
  "https://heygen.com",
  "https://pictory.ai",
  "https://veed.io",
  "https://captions.ai",
  "https://invideo.io",
  "https://wondershare.com/filmora",

  // ── Audio & Music ─────────────────────────────────────────────────────────────
  "https://fish.audio",
  "https://cartesia.ai",
  "https://deepgram.com",
  "https://rev.ai",
  "https://assemblyai.com",
  "https://aiva.ai",
  "https://soundraw.io",
  "https://resemble.ai",
  "https://wellsaidlabs.com",
  "https://notebooklm.google.com",

  // ── Writing & Editing ─────────────────────────────────────────────────────────
  "https://writesonic.com",
  "https://hemingwayapp.com",
  "https://frase.io",
  "https://anyword.com",
  "https://wordtune.com",
  "https://sudowrite.com",
  "https://jenni.ai",
  "https://hyperwriteai.com",
  "https://longshot.ai",

  // ── Search & Research ─────────────────────────────────────────────────────────
  "https://consensus.app",
  "https://elicit.com",
  "https://exa.ai",
  "https://scispace.com",
  "https://scite.ai",
  "https://undermind.ai",
  "https://sider.ai",

  // ── Presentations & Docs ──────────────────────────────────────────────────────
  "https://beautiful.ai",
  "https://slidesai.io",
  "https://tome.app",

  // ── Design (UI/UX) ─────────────────────────────────────────────────────────────
  "https://usegalileo.ai",
  "https://relume.io",
  "https://uizard.io",
  "https://spline.design",
  "https://tldraw.com",
  "https://locofy.ai",
  "https://magician.design",
  "https://vizcom.ai",

  // ── Data & Analytics ──────────────────────────────────────────────────────────
  "https://thoughtspot.com",
  "https://querio.ai",
  "https://tellius.com",
  "https://akkio.com",
  "https://pecan.ai",
  "https://rows.com",
  "https://seek.ai",

  // ── Automation & Agents ──────────────────────────────────────────────────────
  "https://n8n.io",
  "https://workato.com",
  "https://activepieces.com",
  "https://relay.app",
  "https://relevanceai.com",
  "https://gumloop.com",
  "https://voiceflow.com",
  "https://anythingllm.com",
  "https://langchain.com",

  // ── AI Infrastructure ─────────────────────────────────────────────────────────
  "https://together.ai",
  "https://groq.com",
  "https://fireworks.ai",
  "https://modal.com",
  "https://baseten.co",
  "https://anyscale.com",
  "https://portkey.ai",
  "https://helicone.ai",
  "https://llamaindex.ai",

  // ── Voice & Speech ────────────────────────────────────────────────────────────
  "https://speechmatics.com",
  "https://livekit.io",
  "https://symbl.ai",

  // ── Marketing & Sales ─────────────────────────────────────────────────────────
  "https://semrush.com",
  "https://ahrefs.com",
  "https://klaviyo.com",
  "https://apollo.io",
  "https://smartlead.ai",
  "https://lemlist.com",
  "https://gong.io",
  "https://intercom.com",
  "https://drift.com",
  "https://surfer.seo",

  // ── Productivity & Notes ──────────────────────────────────────────────────────
  "https://mem.ai",
  "https://taskade.com",
  "https://reflect.app",
  "https://audiopen.ai",
  "https://reclaim.ai",
  "https://magical.so",
  "https://otter.ai",

  // ── Open Source / Local LLMs ─────────────────────────────────────────────────
  "https://ollama.ai",
  "https://lmstudio.ai",
  "https://jan.ai",
  "https://openwebui.com",

  // ── Customer Service ──────────────────────────────────────────────────────────
  "https://ada.support",
  "https://tidio.com",
  "https://gorgias.com",
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBatch(urls: string[], batchNum: number, total: number) {
  console.log(`\n📦 Batch ${batchNum}/${total}: processing ${urls.length} URLs...`);

  const res = await fetch(
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
