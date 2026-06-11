/**
 * Resumes discover-tools from batch 83 — the remaining 27 URLs
 * that weren't processed before the connection reset.
 * Run: npx tsx scripts/discover-tools-resume.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const REMAINING_URLS = [
  // Voice & Speech
  "https://speechmatics.com",
  "https://livekit.io",
  "https://symbl.ai",

  // Marketing & Sales
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

  // Productivity & Notes
  "https://mem.ai",
  "https://taskade.com",
  "https://reflect.app",
  "https://audiopen.ai",
  "https://reclaim.ai",
  "https://magical.so",
  "https://otter.ai",

  // Open Source / Local LLMs
  "https://ollama.ai",
  "https://lmstudio.ai",
  "https://jan.ai",
  "https://openwebui.com",

  // Customer Service
  "https://ada.support",
  "https://tidio.com",
  "https://gorgias.com",
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBatch(urls: string[], batchNum: number, total: number, attempt = 1): Promise<void> {
  console.log(`\n📦 Batch ${batchNum}/${total}: processing ${urls.length} URLs...${attempt > 1 ? ` (attempt ${attempt})` : ""}`);

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/discover-tools`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ urls }),
    });

    if (!res.ok) {
      const err = await res.text();
      if (attempt < 3) {
        console.warn(`  ⚠ HTTP ${res.status}, retrying in 5s...`);
        await sleep(5000);
        return runBatch(urls, batchNum, total, attempt + 1);
      }
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
  } catch (err) {
    if (attempt < 3) {
      console.warn(`  ⚠ Network error (${(err as Error).message}), retrying in 8s...`);
      await sleep(8000);
      return runBatch(urls, batchNum, total, attempt + 1);
    }
    console.error(`  ✗ Batch ${batchNum} failed after 3 attempts: ${(err as Error).message}`);
  }
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const batches = REMAINING_URLS.map((url) => [url]);
  console.log(`🤖 Resuming: ${REMAINING_URLS.length} remaining tools in ${batches.length} batches`);
  console.log(`💰 Estimated cost: $${(REMAINING_URLS.length * 0.03).toFixed(2)}–$${(REMAINING_URLS.length * 0.06).toFixed(2)}\n`);

  for (let i = 0; i < batches.length; i++) {
    await runBatch(batches[i], i + 1, batches.length);
    if (i < batches.length - 1) await sleep(3000);
  }

  console.log("\n✅ Resume complete!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
