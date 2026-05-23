import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const EMBEDDING_MODEL = "text-embedding-3-small";

async function embedText(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
  const json = await res.json() as { data: Array<{ embedding: number[] }> };
  return json.data[0].embedding;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const embedding = await embedText(inputText);

    await supabase
      .from("tools")
      .update({ embedding: JSON.stringify(embedding) })
      .eq("id", tool_id);

    return new Response(JSON.stringify({ embedded: true, tool_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
