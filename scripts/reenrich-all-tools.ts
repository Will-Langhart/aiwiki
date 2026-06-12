/**
 * Re-enriches all published tools with the 4 new metadata fields:
 * github_stars, pricing_detail, integrations, traffic_tier.
 *
 * Uses the lightweight reenrich-tools edge function (Haiku model,
 * ~$0.01 per tool). Skips tools with no website_url.
 *
 * Run: npx tsx scripts/reenrich-all-tools.ts
 *
 * Can be safely re-run — updates are idempotent (upsert by tool id).
 * Saves progress to /tmp/reenrich-progress.json so you can resume.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
config({ path: ".env.local" });
config();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PROGRESS_FILE = "/tmp/reenrich-progress.json";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBatch(
  items: Array<{ tool_id: string; website_url: string }>,
  batchNum: number,
  total: number,
  attempt = 1,
): Promise<number> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/reenrich-tools`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ items }),
    });

    if (res.status === 429) {
      console.warn("\n⏸  Daily cost cap reached — save progress and stop.");
      return -1;
    }

    if (!res.ok) {
      const err = await res.text();
      if (attempt < 3) {
        console.warn(`  ⚠ HTTP ${res.status}, retrying in 5s...`);
        await sleep(5000);
        return runBatch(items, batchNum, total, attempt + 1);
      }
      console.error(`  ✗ Batch ${batchNum} failed: ${err}`);
      return 0;
    }

    const data = await res.json() as { summary: { succeeded: number; errored: number; total: number } };
    process.stdout.write(`\r  [${batchNum}/${total}] ✓ ${data.summary.succeeded}/${data.summary.total} — ${items[0].website_url.replace("https://", "").slice(0, 35)}`);
    return data.summary.succeeded;
  } catch (err) {
    if (attempt < 3) {
      await sleep(8000);
      return runBatch(items, batchNum, total, attempt + 1);
    }
    console.error(`  ✗ Network error: ${(err as Error).message}`);
    return 0;
  }
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  // Fetch all published tools with a website_url
  console.log("📋 Fetching all published tools...");
  const { data: tools, error } = await supabase
    .from("tools")
    .select("id, slug, website_url")
    .eq("status", "published")
    .not("website_url", "is", null)
    .order("name");

  if (error) {
    console.error("❌ Failed to fetch tools:", error.message);
    process.exit(1);
  }

  const allItems = (tools ?? [])
    .filter((t) => t.website_url)
    .map((t) => ({ tool_id: t.id, website_url: t.website_url as string }));

  console.log(`✅ Found ${allItems.length} tools to enrich`);
  console.log(`💰 Estimated cost: $${(allItems.length * 0.012).toFixed(2)}–$${(allItems.length * 0.018).toFixed(2)}`);

  // Load progress checkpoint
  let startIndex = 0;
  if (existsSync(PROGRESS_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(PROGRESS_FILE, "utf-8")) as { lastIndex: number };
      startIndex = saved.lastIndex;
      console.log(`⏩ Resuming from index ${startIndex} (${allItems.length - startIndex} remaining)`);
    } catch {
      // ignore corrupt checkpoint
    }
  }

  const pending = allItems.slice(startIndex);
  const BATCH_SIZE = 5;
  const batches: typeof allItems[] = [];
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    batches.push(pending.slice(i, i + BATCH_SIZE));
  }

  const totalBatches = batches.length;
  console.log(`\n🚀 Processing ${pending.length} tools in ${totalBatches} batches of ${BATCH_SIZE}\n`);

  let succeeded = 0;
  for (let i = 0; i < batches.length; i++) {
    const result = await runBatch(batches[i], startIndex / BATCH_SIZE + i + 1, Math.ceil(allItems.length / BATCH_SIZE), 1);

    if (result === -1) {
      // Cap hit — save checkpoint
      const checkpoint = startIndex + i * BATCH_SIZE;
      writeFileSync(PROGRESS_FILE, JSON.stringify({ lastIndex: checkpoint }));
      console.log(`\n💾 Progress saved at index ${checkpoint}. Re-run tomorrow to continue.`);
      process.exit(0);
    }

    succeeded += result;

    // Save checkpoint every 10 batches
    if (i % 10 === 9) {
      writeFileSync(PROGRESS_FILE, JSON.stringify({ lastIndex: startIndex + (i + 1) * BATCH_SIZE }));
    }

    if (i < batches.length - 1) await sleep(1500);
  }

  // Clear checkpoint on completion
  if (existsSync(PROGRESS_FILE)) {
    writeFileSync(PROGRESS_FILE, JSON.stringify({ lastIndex: 0 }));
  }

  console.log(`\n\n✅ Re-enrichment complete! ${succeeded}/${allItems.length} tools updated.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
