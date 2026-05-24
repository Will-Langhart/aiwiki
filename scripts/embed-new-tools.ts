/**
 * Embed all recently-scraped tools via the embed-tool Edge Function.
 * Run via:  npx tsx scripts/embed-new-tools.ts
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_ANON_KEY in .env.local
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../app/types/database";

const supabase = createClient<Database>(
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const NEW_SLUGS = [
  "gemini", "microsoft-copilot", "grok", "meta-ai", "poe", "le-chat-mistral",
  "huggingchat", "deepseek",
  "windsurf", "tabnine", "codeium", "amazon-q-developer", "aider", "continue",
  "replit-ai",
  "dall-e-3", "adobe-firefly", "stable-diffusion", "ideogram", "leonardo-ai",
  "flux", "pika", "luma-dream-machine", "kling-ai", "hailuo-ai", "sora",
  "jasper", "copy-ai", "writesonic", "otter-ai", "fireflies-ai", "descript",
  "consensus", "elicit", "phind", "you-com", "kagi",
  "n8n", "bardeen", "agentgpt", "langchain", "zapier",
  "hugging-face", "groq", "together-ai", "langsmith", "weights-biases",
  "vercel-ai-sdk",
];

async function main() {
  console.log("🔍 Fetching tool IDs…");
  const { data: tools, error } = await supabase
    .from("tools")
    .select("id, slug, name")
    .in("slug", NEW_SLUGS);

  if (error) {
    console.error("Error fetching tools:", error.message);
    process.exit(1);
  }

  if (!tools || tools.length === 0) {
    console.log("No tools found — have you run scrape-tools.ts yet?");
    process.exit(1);
  }

  console.log(`📦 Embedding ${tools.length} tools…\n`);

  let ok = 0;
  let failed = 0;

  for (const tool of tools) {
    process.stdout.write(`  → ${tool.name}… `);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/embed-tool`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ tool_id: tool.id }),
      });
      const json = await res.json() as { embedded?: boolean; error?: string };
      if (res.ok && json.embedded) {
        console.log("✓");
        ok++;
      } else {
        console.log(`✗  ${json.error ?? res.status}`);
        failed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗  ${msg}`);
      failed++;
    }

    // Small delay to avoid hammering the API
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n✅ Done — ${ok} embedded, ${failed} failed`);
}

main();
