import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { langevalConfigFromEnv, type Span, Trace, tracedEmbedding } from "../_shared/langeval.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const EMBEDDING_MODEL = "text-embedding-3-small";
const LANGEVAL = langevalConfigFromEnv("aiwiki-semantic-search");

async function embedQuery(text: string): Promise<{ embedding: number[]; tokens?: number }> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  const json = await res.json() as {
    data: Array<{ embedding: number[] }>;
    usage?: { prompt_tokens?: number };
  };
  return { embedding: json.data[0].embedding, tokens: json.usage?.prompt_tokens };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const trace = new Trace(LANGEVAL);
  let root: Span | undefined;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const { query, limit = 12 } = await req.json() as { query: string; limit?: number };
    if (!query?.trim()) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A RETRIEVER span: the query in, the ranked matches out.
    root = trace
      .start("semantic-search", {
        "openinference.span.kind": "RETRIEVER",
        "aiwiki.match_count": limit,
      })
      .content("input", query.trim());
    const embedding = await tracedEmbedding(trace, root, EMBEDDING_MODEL, query.trim(), () =>
      embedQuery(query.trim()),
    );

    // Call match_tools RPC (cosine similarity via pgvector)
    const { data: vectorResults, error } = await supabase.rpc("match_tools", {
      query_embedding: embedding,
      match_threshold: 0.3,
      match_count: limit,
    });

    if (error) {
      throw new Error(error.message);
    }

    root
      .set({ "aiwiki.result_count": (vectorResults ?? []).length })
      .content(
        "output",
        (vectorResults ?? []).map((r: { slug?: string; similarity?: number }) => ({
          slug: r.slug,
          similarity: r.similarity,
        })),
      );
    return new Response(JSON.stringify({ results: vectorResults ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    root?.fail(err);
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    root?.end();
    trace.flush();
  }
});
