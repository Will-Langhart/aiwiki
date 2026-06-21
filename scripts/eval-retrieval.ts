/**
 * Retrieval eval harness — compares vector-only vs hybrid (RRF) retrieval
 * for the chat RAG pipeline against a hand-labelled golden set.
 *
 * Run via:  npx tsx scripts/eval-retrieval.ts
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + OPENAI_API_KEY in .env.local
 *
 * Metrics (averaged over the golden set):
 *   recall@k = |retrieved_topk ∩ expected| / |expected|
 *   MRR      = mean reciprocal rank of the first relevant hit within top-k
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const EMBEDDING_MODEL = "text-embedding-3-small";

if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

type Golden = { query: string; expected: string[] };

// Hand-labelled queries → tools that are genuinely relevant and published.
// Mix of exact-name/jargon (FTS-favouring) and paraphrase (vector-favouring).
const GOLDEN: Golden[] = [
  { query: "n8n self-hosted workflow automation", expected: ["n8n"] },
  { query: "run llama models locally on my laptop", expected: ["ollama", "lm-studio", "jan"] },
  { query: "pinecone alternative vector database", expected: ["pinecone", "weaviate", "qdrant", "chroma", "zilliz"] },
  { query: "speech to text transcription api", expected: ["whisper", "deepgram", "assemblyai", "rev-ai", "speechmatics"] },
  { query: "fast llm inference provider", expected: ["groq", "fireworks-ai", "together-ai"] },
  { query: "framework for building rag applications", expected: ["langchain", "llamaindex", "haystack"] },
  { query: "multi agent orchestration framework", expected: ["crewai", "autogen", "agno", "langchain"] },
  { query: "turn a script into a talking avatar video", expected: ["heygen", "synthesia"] },
  { query: "remove the background from an image", expected: ["remove-bg", "photoroom", "clipdrop"] },
  { query: "write marketing copy and blog posts", expected: ["copy-ai", "jasper", "writesonic", "rytr"] },
  { query: "automatically take notes in my meetings", expected: ["otter-ai", "fireflies-ai"] },
  { query: "generate a song from a text prompt", expected: ["suno", "udio"] },
  { query: "ai autocomplete inside my code editor", expected: ["github-copilot", "cursor", "codeium", "tabnine", "continue"] },
  { query: "chat with a pdf document", expected: ["chatpdf", "pdf-ai", "notebooklm"] },
  { query: "build a web app from a text description", expected: ["v0-by-vercel", "bolt", "lovable"] },
  { query: "research assistant that cites its sources", expected: ["perplexity", "consensus", "elicit", "undermind", "scite"] },
  { query: "self-hostable llm observability and tracing", expected: ["langfuse", "phoenix", "opik", "traceloop"] },
  { query: "realtime voice ai agents", expected: ["livekit", "cartesia", "elevenlabs"] },
  { query: "text to image generator", expected: ["midjourney", "dall-e", "stable-diffusion", "leonardo-ai", "ideogram", "flux"] },
  { query: "convert a long video into short clips", expected: ["opusclip", "pictory"] },
  { query: "grammar checker and writing assistant", expected: ["grammarly", "wordtune", "quillbot"] },
  { query: "deploy machine learning models as apis", expected: ["replicate", "modal", "baseten", "banana", "fal-ai"] },
  { query: "evaluate and test llm prompts", expected: ["braintrust", "promptlayer", "langsmith"] },
  { query: "presentation slide deck generator", expected: ["gamma", "tome", "beautiful-ai", "decktopus-ai", "slidesai"] },
];

const K = 8; // chat's default match_count

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data[0].embedding;
}

async function vectorSlugs(embedding: number[]): Promise<string[]> {
  const { data, error } = await supabase.rpc("match_tools_filtered", {
    query_embedding: embedding,
    match_threshold: 0.3,
    match_count: K,
  });
  if (error) throw new Error(`match_tools_filtered: ${error.message}`);
  return (data ?? []).map((t: { slug: string }) => t.slug);
}

async function hybridSlugs(embedding: number[], query: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("match_tools_hybrid", {
    query_embedding: embedding,
    query_text: query,
    match_count: K,
  });
  if (error) throw new Error(`match_tools_hybrid: ${error.message}`);
  return (data ?? []).map((t: { slug: string }) => t.slug);
}

function recall(retrieved: string[], expected: string[]): number {
  const top = new Set(retrieved.slice(0, K));
  const hits = expected.filter((e) => top.has(e)).length;
  return hits / expected.length;
}

function reciprocalRank(retrieved: string[], expected: string[]): number {
  const exp = new Set(expected);
  for (let i = 0; i < Math.min(retrieved.length, K); i++) {
    if (exp.has(retrieved[i])) return 1 / (i + 1);
  }
  return 0;
}

async function main() {
  let vRecall = 0, vMrr = 0, hRecall = 0, hMrr = 0;
  const rows: string[] = [];

  for (const { query, expected } of GOLDEN) {
    const e = await embed(query);
    const [v, h] = await Promise.all([vectorSlugs(e), hybridSlugs(e, query)]);
    const vr = recall(v, expected), vm = reciprocalRank(v, expected);
    const hr = recall(h, expected), hm = reciprocalRank(h, expected);
    vRecall += vr; vMrr += vm; hRecall += hr; hMrr += hm;
    const flag = hr > vr ? " ↑" : hr < vr ? " ↓" : "";
    rows.push(
      `${query.slice(0, 46).padEnd(48)} vec r=${vr.toFixed(2)} mrr=${vm.toFixed(2)}  |  hyb r=${hr.toFixed(2)} mrr=${hm.toFixed(2)}${flag}`,
    );
  }

  const n = GOLDEN.length;
  console.log(`\nPer-query (recall@${K} / MRR@${K}):\n`);
  console.log(rows.join("\n"));
  console.log(`\n${"=".repeat(72)}`);
  console.log(`Vector-only :  recall@${K} ${(vRecall / n).toFixed(3)}   MRR@${K} ${(vMrr / n).toFixed(3)}`);
  console.log(`Hybrid (RRF):  recall@${K} ${(hRecall / n).toFixed(3)}   MRR@${K} ${(hMrr / n).toFixed(3)}`);
  console.log(
    `Delta       :  recall ${(((hRecall - vRecall) / n) * 100).toFixed(1).padStart(5)}pp   MRR ${(((hMrr - vMrr) / n) * 100).toFixed(1).padStart(5)}pp`,
  );
  console.log(`${"=".repeat(72)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
