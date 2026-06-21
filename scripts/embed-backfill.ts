/**
 * Backfill embeddings for every published tool that has none.
 * Routes through the embed-tool Edge Function (OpenAI key stays server-side).
 *
 * Run via:  npx tsx scripts/embed-backfill.ts
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  const { data: tools, error } = await supabase
    .from("tools")
    .select("id, name")
    .eq("status", "published")
    .is("embedding", null);

  if (error) {
    console.error("Error fetching tools:", error.message);
    process.exit(1);
  }
  if (!tools || tools.length === 0) {
    console.log("Nothing to backfill — all published tools are embedded.");
    return;
  }

  console.log(`📦 Backfilling embeddings for ${tools.length} tools…\n`);
  let ok = 0, failed = 0;
  const failures: string[] = [];

  for (const tool of tools) {
    process.stdout.write(`  → ${tool.name}… `);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/embed-tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ tool_id: tool.id }),
      });
      const json = (await res.json()) as { embedded?: boolean; error?: string };
      if (res.ok && json.embedded) {
        console.log("✓");
        ok++;
      } else {
        console.log(`✗  ${json.error ?? res.status}`);
        failures.push(`${tool.name}: ${json.error ?? res.status}`);
        failed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗  ${msg}`);
      failures.push(`${tool.name}: ${msg}`);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 200)); // gentle pacing
  }

  console.log(`\n✅ Done — ${ok} embedded, ${failed} failed`);
  if (failures.length) console.log("Failures:\n" + failures.map((f) => "  - " + f).join("\n"));
}

main();
