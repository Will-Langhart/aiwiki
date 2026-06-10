/**
 * Calls the discover-tools edge function with a curated list of AI tool URLs.
 * Run via:  npx tsx scripts/discover-tools.ts
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY in .env.local
 *
 * The edge function scrapes each URL, extracts structured data with Claude,
 * and upserts tools directly into the database as published.
 *
 * Batches of 5 to stay within the $5/day cost cap and avoid timeouts.
 * Estimated cost: ~$0.02–0.05 per tool → ~$2–5 for 100 tools.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// ─── Curated list of high-quality AI tool URLs ────────────────────────────────
// These are in addition to the ~114 tools already seeded via seed.ts + seed-bulk.ts.
// Remove any URLs that are already in the database to avoid redundant scraping.
const TOOL_URLS = [
  // Chat & General AI
  "https://character.ai",
  "https://heypi.com",
  "https://claude.ai/code", // Claude Code specifically

  // Coding
  "https://cline.bot",
  "https://continue.dev",
  "https://replit.com",
  "https://githubnext.com",
  "https://phind.com",
  "https://sourcegraph.com/cody",
  "https://pieces.app",
  "https://codestral.mistral.ai",

  // Image Generation
  "https://getimg.ai",
  "https://bing.com/create",
  "https://clipdrop.co",
  "https://photoroom.com",
  "https://remove.bg",
  "https://krea.ai",
  "https://fal.ai",
  "https://tensor.art",

  // Video
  "https://invideo.io",
  "https://pictory.ai",
  "https://synthesia.io/features/ai-video-generator",
  "https://veed.io",
  "https://captions.ai",
  "https://opus.pro",
  "https://wondershare.com/filmora",

  // Audio
  "https://aiva.ai",
  "https://soundraw.io",
  "https://assemblyai.com",
  "https://adobe.com/products/podcast.html",
  "https://podcast.adobe.com",
  "https://resemble.ai",
  "https://wellsaidlabs.com",

  // Writing
  "https://wordtune.com",
  "https://hyperwriteai.com",
  "https://sudowrite.com",
  "https://koala.sh",
  "https://jenni.ai",
  "https://essay.ai",
  "https://longshot.ai",

  // Research & Search
  "https://scispace.com",
  "https://scite.ai",
  "https://semantic-scholar.org",
  "https://iris.ai",
  "https://undermind.ai",
  "https://sider.ai",
  "https://andi.ai",

  // Productivity
  "https://mem.ai",
  "https://taskade.com",
  "https://reflect.app",
  "https://audiopen.ai",
  "https://rewind.ai",
  "https://magical.so",
  "https://reclaim.ai",
  "https://motion.la",

  // Design
  "https://locofy.ai",
  "https://galileoai.io",
  "https://usegalileo.ai",
  "https://magician.design",
  "https://alpaca.art",
  "https://vizcom.ai",
  "https://diagram.com",
  "https://photoai.com",

  // Data & Analytics
  "https://akkio.com",
  "https://pecan.ai",
  "https://tellius.com",
  "https://seek.ai",
  "https://powerdrill.ai",
  "https://rows.com",
  "https://luminary.app",

  // Automation
  "https://relay.app",
  "https://retool.com",
  "https://relevanceai.com",
  "https://gumloop.com",
  "https://activepieces.com",
  "https://mindstudio.ai",
  "https://voiceflow.com",

  // Infrastructure
  "https://fireworks.ai",
  "https://anyscale.com",
  "https://modal.com",
  "https://banana.dev",
  "https://baseten.co",
  "https://llamaindex.ai",
  "https://langsmith.dev",
  "https://portkey.ai",
  "https://helicone.ai",

  // Voice
  "https://speechmatics.com",
  "https://rev.ai",
  "https://verbit.ai",
  "https://symbl.ai",
  "https://livekit.io",

  // Marketing & Sales
  "https://smartlead.ai",
  "https://apollo.io",
  "https://lemlist.com",
  "https://rocketreach.co",
  "https://amplemarket.com",
  "https://drift.com",
  "https://intercom.com",
  "https://gong.io",
  "https://chorus.ai",
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBatch(urls: string[], batchNum: number, total: number) {
  console.log(`\n📦 Batch ${batchNum}: processing ${urls.length} URLs...`);

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
  const BATCH_SIZE = 5;
  const batches: string[][] = [];
  for (let i = 0; i < TOOL_URLS.length; i += BATCH_SIZE) {
    batches.push(TOOL_URLS.slice(i, i + BATCH_SIZE));
  }

  console.log(`🤖 Discovering ${TOOL_URLS.length} AI tools in ${batches.length} batches of ${BATCH_SIZE}`);
  console.log(`💰 Estimated cost: $${(TOOL_URLS.length * 0.035).toFixed(2)}–$${(TOOL_URLS.length * 0.06).toFixed(2)}`);
  console.log(`⚠️  Make sure the discover-tools edge function is deployed first.`);
  console.log(`   supabase functions deploy discover-tools\n`);

  for (let i = 0; i < batches.length; i++) {
    await runBatch(batches[i], i + 1, batches.length);
    if (i < batches.length - 1) {
      // 3-second pause between batches to avoid overwhelming the edge function
      await sleep(3000);
    }
  }

  console.log("\n✅ Discovery complete!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
