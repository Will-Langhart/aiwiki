import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { langevalConfigFromEnv, type Span, Trace, tracedEmbedding } from "../_shared/langeval.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const EMBEDDING_MODEL = "text-embedding-3-small";
const LANGEVAL = langevalConfigFromEnv("aiwiki-embed-tool");

async function embedText(text: string): Promise<{ embedding: number[]; tokens?: number }> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { tool_id } = await req.json();
    if (!tool_id) {
      return new Response(JSON.stringify({ error: "tool_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tool + overview content
    const { data: tool } = await supabase
      .from("tools")
      .select("id, name, tagline, status")
      .eq("id", tool_id)
      .single();

    if (!tool || tool.status !== "published") {
      return new Response(JSON.stringify({ error: "Tool not found or not published" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: blocks } = await supabase
      .from("content_blocks")
      .select("body_md")
      .eq("tool_id", tool_id)
      .eq("section", "overview")
      .order("sort_order")
      .limit(3);

    const overviewText = (blocks ?? []).map((b: { body_md: string }) => b.body_md).join(" ").slice(0, 2000);
    const inputText = `${tool.name}\n${tool.tagline}\n${overviewText}`.trim();

    root = trace.start("embed-tool", { "openinference.span.kind": "CHAIN", "aiwiki.tool_id": tool_id });
    const embedding = await tracedEmbedding(trace, root, EMBEDDING_MODEL, inputText, () =>
      embedText(inputText),
    );

    await supabase
      .from("tools")
      .update({ embedding: JSON.stringify(embedding) })
      .eq("id", tool_id);

    return new Response(JSON.stringify({ embedded: true, tool_id }), {
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
