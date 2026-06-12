/**
 * Discovers ~37 AI tools across 4 new categories:
 *   - Vector databases
 *   - MLOps & training
 *   - Agent frameworks
 *   - AI observability
 *
 * Run: npx tsx scripts/discover-new-categories.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const TOOL_URLS = [
  // ── Vector Databases ──────────────────────────────────────────────────────
  "https://www.pinecone.io",
  "https://weaviate.io",
  "https://qdrant.tech",
  "https://www.trychroma.com",
  "https://milvus.io",
  "https://zilliz.com",
  "https://vespa.ai",
  "https://marqo.ai",
  "https://turbopuffer.com",
  "https://www.mongodb.com/products/platform/atlas-vector-search",

  // ── MLOps & Training ──────────────────────────────────────────────────────
  "https://wandb.ai",
  "https://mlflow.org",
  "https://dvc.org",
  "https://neptune.ai",
  "https://www.comet.com",
  "https://clear.ml",
  "https://scale.com",
  "https://labelbox.com",
  "https://lightning.ai",
  "https://dagshub.com",

  // ── Agent Frameworks ──────────────────────────────────────────────────────
  "https://www.crewai.com",
  "https://microsoft.github.io/autogen",
  "https://haystack.deepset.ai",
  "https://www.agno.com",
  "https://ai.pydantic.dev",
  "https://agentops.ai",
  "https://letta.com",
  "https://flowiseai.com",
  "https://dify.ai",

  // ── AI Observability ──────────────────────────────────────────────────────
  "https://smith.langchain.com",
  "https://braintrust.dev",
  "https://phoenix.arize.com",
  "https://promptlayer.com",
  "https://langfuse.com",
  "https://traceloop.com",
  "https://evidently.ai",
  "https://www.opik.com",
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBatch(urls: string[], batchNum: number, total: number, attempt = 1): Promise<void> {
  console.log(`\n📦 Batch ${batchNum}/${total}: ${urls[0].replace("https://", "")}${attempt > 1 ? ` (attempt ${attempt})` : ""}`);

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
      console.error(`  ✗ Failed (HTTP ${res.status}): ${err}`);
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
    console.error(`  ✗ Failed after 3 attempts: ${(err as Error).message}`);
  }
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const batches = TOOL_URLS.map((url) => [url]);
  console.log(`🤖 Discovering ${TOOL_URLS.length} tools across 4 new categories`);
  console.log(`💰 Estimated cost: $${(TOOL_URLS.length * 0.03).toFixed(2)}–$${(TOOL_URLS.length * 0.06).toFixed(2)}\n`);

  for (let i = 0; i < batches.length; i++) {
    await runBatch(batches[i], i + 1, batches.length);
    if (i < batches.length - 1) await sleep(3000);
  }

  console.log("\n✅ Discovery complete!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
