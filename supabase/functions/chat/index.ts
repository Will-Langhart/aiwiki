import Anthropic from "npm:@anthropic-ai/sdk@0.39";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_DAILY_SPEND_USD = Number(Deno.env.get("MAX_DAILY_SPEND_USD_CHAT") ?? "10");

// Rate limits
const AUTHED_LIMIT = 50;
const ANON_LIMIT = 5;

async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  const json = await res.json() as { data: Array<{ embedding: number[] }> };
  return json.data[0].embedding;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");

    // Use service role for admin DB ops; anon key for user-scoped checks
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const supabaseUser = authHeader
      ? createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
          global: { headers: { Authorization: authHeader } },
        })
      : null;

    let userId: string | null = null;
    if (supabaseUser) {
      const { data: { user } } = await supabaseUser.auth.getUser();
      userId = user?.id ?? null;
    }

    const { session_id, message } = await req.json() as { session_id?: string; message: string };
    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit check
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (userId) {
      const { count } = await supabaseAdmin
        .from("chat_messages")
        .select("*", { count: "exact", head: true })
        .eq("role", "user")
        .gte("created_at", today.toISOString())
        .in("session_id", (await supabaseAdmin
          .from("chat_sessions")
          .select("id")
          .eq("user_id", userId)
          .gte("created_at", today.toISOString())
        ).data?.map((s: { id: string }) => s.id) ?? []);
      if ((count ?? 0) >= AUTHED_LIMIT) {
        return new Response(JSON.stringify({ error: `Daily limit of ${AUTHED_LIMIT} messages reached.` }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Daily cost cap
    const { data: costToday } = await supabaseAdmin
      .from("llm_usage")
      .select("cost_usd")
      .eq("feature", "chat")
      .gte("created_at", today.toISOString());
    const spent = (costToday ?? []).reduce((s: number, r: { cost_usd: number | null }) => s + (r.cost_usd ?? 0), 0);
    if (spent >= MAX_DAILY_SPEND_USD) {
      return new Response(JSON.stringify({ error: "Daily AI chat limit reached. Try again tomorrow." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get or create session
    let sessionId = session_id;
    if (!sessionId) {
      const { data: sess } = await supabaseAdmin
        .from("chat_sessions")
        .insert({ user_id: userId })
        .select("id")
        .single();
      sessionId = sess?.id;
    }

    // Persist user message
    await supabaseAdmin.from("chat_messages").insert({
      session_id: sessionId,
      role: "user",
      content: message,
    });

    // Fetch recent conversation history (last 10 messages)
    const { data: history } = await supabaseAdmin
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(10);

    const conversationHistory = (history ?? []).reverse() as Array<{ role: string; content: string }>;

    // RAG: embed query + ANN search
    let toolContext = "";
    let citedToolIds: string[] = [];
    try {
      const embedding = await embedQuery(message);
      const { data: matchedTools } = await supabaseAdmin.rpc("match_tools", {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: 8,
      });

      if (matchedTools && matchedTools.length > 0) {
        const toolIds = matchedTools.map((t: { id: string }) => t.id);
        citedToolIds = toolIds.slice(0, 5);

        const { data: toolDetails } = await supabaseAdmin
          .from("tools")
          .select("id, slug, name, tagline, pricing_tier, has_free_tier, audience_fit, key_strengths")
          .in("id", toolIds);

        const { data: overviewBlocks } = await supabaseAdmin
          .from("content_blocks")
          .select("tool_id, body_md")
          .in("tool_id", toolIds)
          .eq("section", "overview")
          .order("sort_order");

        const blockMap = new Map<string, string>();
        for (const b of (overviewBlocks ?? [])) {
          blockMap.set(b.tool_id, `${blockMap.get(b.tool_id) ?? ""} ${b.body_md}`);
        }

        toolContext = (toolDetails ?? []).map((t: {
          id: string; slug: string; name: string; tagline: string;
          pricing_tier: string; has_free_tier: boolean; audience_fit: string; key_strengths: string[];
        }) => {
          const overview = (blockMap.get(t.id) ?? "").trim().slice(0, 500);
          return `[tool:${t.slug}] **${t.name}**: ${t.tagline}. Pricing: ${t.pricing_tier}${t.has_free_tier ? " (free tier)" : ""}. Audience: ${t.audience_fit.replace("_", " ")}. Strengths: ${t.key_strengths.join(", ")}.${overview ? ` ${overview}` : ""}`;
        }).join("\n\n");
      }
    } catch {
      // RAG failure is non-fatal — answer without context
    }

    const systemPrompt = `You are AI Wiki, a friendly assistant that helps people discover and understand AI tools.
Use only the provided tool context when making recommendations.
When you reference a tool, include its slug inline like [tool:claude] so the UI can render a preview card.
If you don't know something or the context doesn't have relevant tools, say so honestly.
Keep answers concise and practical.

${toolContext ? `Available tool context:\n${toolContext}` : "No matching tools found in the context — answer from general knowledge if helpful."}`;

    const messages = conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Stream from Claude
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const streamResponse = new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Session-Id": sessionId ?? "",
      },
    });

    // Fire-and-forget streaming IIFE — must start BEFORE return so that
    // return streamResponse runs first and establishes the reader on the
    // readable side. Without a reader, TransformStream's default
    // highWaterMark:0 causes any writer.write() to deadlock.
    (async () => {
      let fullText = "";
      try {
        // Send session_id first so the client can correlate multi-turn requests
        await writer.write(new TextEncoder().encode(
          `data: ${JSON.stringify({ type: "session", session_id: sessionId })}\n\n`
        ));

        const stream = anthropic.messages.stream({
          model: "claude-opus-4-8",
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text;
            await writer.write(
              new TextEncoder().encode(`data: ${JSON.stringify({ type: "content_block_delta", delta: event.delta })}\n\n`)
            );
          }
        }

        const usage = (await stream.finalMessage()).usage;

        // Extract [tool:slug] citation references from response
        const citationMatches = [...fullText.matchAll(/\[tool:([a-z0-9-]+)\]/g)];
        const citedSlugs = [...new Set(citationMatches.map((m) => m[1]))];

        let finalCitedIds = citedToolIds;
        if (citedSlugs.length > 0) {
          const { data: citedTools } = await supabaseAdmin
            .from("tools")
            .select("id, slug, name, tagline, logo_url, pricing_tier")
            .in("slug", citedSlugs)
            .eq("status", "published");
          finalCitedIds = (citedTools ?? []).map((t: { id: string }) => t.id);

          // Send citation data to client
          await writer.write(new TextEncoder().encode(
            `data: ${JSON.stringify({ type: "citations", tools: citedTools ?? [] })}\n\n`
          ));
        }

        // Persist assistant message
        await supabaseAdmin.from("chat_messages").insert({
          session_id: sessionId,
          role: "assistant",
          content: fullText,
          tool_citations: finalCitedIds,
        });

        // Log usage
        await supabaseAdmin.from("llm_usage").insert({
          user_id: userId,
          feature: "chat",
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cost_usd: (usage.input_tokens * 15 + usage.output_tokens * 75) / 1_000_000,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Streaming error";
        await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`));
      } finally {
        await writer.write(new TextEncoder().encode("data: [DONE]\n\n"));
        await writer.close();
      }
    })();

    return streamResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
