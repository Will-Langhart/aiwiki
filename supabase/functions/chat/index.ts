import Anthropic from "npm:@anthropic-ai/sdk@0.39";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const EMBEDDING_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "claude-sonnet-4-6";
const MAX_DAILY_SPEND_USD = Number(Deno.env.get("MAX_DAILY_SPEND_USD_CHAT") ?? "10");

// Sonnet 4.6 pricing, per million tokens.
const INPUT_COST_PER_M = 3;
const OUTPUT_COST_PER_M = 15;

// Agent loop bound — caps tool round-trips so a confused turn can't run away.
const MAX_AGENT_ITERATIONS = 3;

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

// Tool definitions exposed to the model. The model drives retrieval — it rewrites
// the user's query with conversation context and applies hard filters — instead of
// the old fixed "embed latest message → stuff top 8" prelude.
const TOOLS = [
  {
    name: "search_tools",
    description:
      "Semantic search over the AI Wiki tool directory. Rewrite the user's need into a focused query that includes context from earlier turns (e.g. on a follow-up like 'a cheaper one', search for the cheaper variant of what was already discussed). Apply filters only when the user clearly constrained on them. Returns matching tools with slug, tagline, pricing, audience, and strengths.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to search for — a focused description of the tool the user needs, incorporating earlier context.",
        },
        pricing_tier: {
          type: "string",
          enum: ["free", "freemium", "paid", "enterprise"],
          description: "Restrict to a pricing tier. Only set when the user constrained on price.",
        },
        has_free_tier: {
          type: "boolean",
          description: "Restrict to tools that have a free tier. Set true when the user wants something free to try.",
        },
        audience_fit: {
          type: "string",
          enum: ["technical", "non_technical", "both"],
          description: "Restrict by audience. Use 'non_technical' for non-developers, 'technical' for developers.",
        },
        limit: {
          type: "integer",
          description: "Max results (1-12). Default 8.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_tool_details",
    description:
      "Fetch the full overview for a single tool by slug. Call this for your 2-3 finalists when you need more than the search summary to make a confident recommendation.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "The tool's slug, e.g. 'midjourney'." },
      },
      required: ["slug"],
    },
  },
  {
    name: "compare_tools",
    description:
      "Fetch a side-by-side fact sheet for 2-4 tools by slug — pricing, audience, API, open-source, and strengths lined up for comparison. Call this when the user is weighing specific tools against each other (an 'X vs Y' question) so you can speak to the concrete trade-offs.",
    input_schema: {
      type: "object",
      properties: {
        slugs: {
          type: "array",
          items: { type: "string" },
          description: "2-4 tool slugs to compare, e.g. ['midjourney', 'dall-e'].",
        },
      },
      required: ["slugs"],
    },
  },
];

const SYSTEM_PROMPT = `You are AI Wiki — an expert friend who lives and breathes AI tools. You've tried most of them, you're opinionated, and you help people find the right tool fast. No fluff, no corporate speak.

## How you work
You have three tools: \`search_tools\` (semantic search over the directory, with optional pricing/audience filters), \`get_tool_details\` (full overview for one tool), and \`compare_tools\` (side-by-side fact sheet for 2-4 tools). Use them to ground every recommendation in what's actually in the directory.

- When a recommendation depends on directory tools, call \`search_tools\` first. Rewrite the user's need into a focused query that folds in earlier context — on a follow-up like "something cheaper" or "a non-technical option", search for that variant of what you were already discussing, don't search the literal two words.
- Apply filters (\`pricing_tier\`, \`has_free_tier\`, \`audience_fit\`) only when the user clearly constrained on them.
- Call \`get_tool_details\` on your finalists when the search summary isn't enough to pick confidently.
- When the user is weighing specific tools against each other ("X vs Y"), call \`compare_tools\` to line up the trade-offs.
- **Call tools silently — do not write any text before a tool call.** Only write text when you're giving the final answer.

## Your workflow for tool recommendations
1. If they haven't given enough context, ask ONE short clarifying question — budget, use case, or technical level. One question only, keep it casual. Skip this if they already gave enough to go on. (No tool calls needed for a clarifying question.)
2. Recommend 2-3 tools max. For each one:
   - Reference it as [tool:slug] so an interactive card renders in the UI
   - One punchy sentence on why it fits their situation specifically
   - The key trade-off vs the alternatives
3. Finish with a clear tiebreaker: "If I had to pick one for you, I'd go with [tool:slug] because…"

## When a tool isn't in the directory
If search comes up empty or the best fit isn't indexed, answer from your general knowledge and flag it naturally: "That one isn't in our directory yet, but here's what I know…" Then still try to point to a comparable tool that is in the directory.

## Tone
Casual, direct, and opinionated. Short sentences. Cut to what actually matters. Give a real recommendation — don't hide behind "it depends."

## Hard rules
- Never list more than 3 tools in a single recommendation
- Never ask more than 1 clarifying question at a time
- Never repeat the user's question back to them
- Always use [tool:slug] format when naming a specific tool that's in the directory`;

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

    // Daily cost cap — sum the whole turn's spend (one row per LLM round-trip)
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

    // --- Agentic retrieval tools (executed server-side) ---

    // Card data for every tool the model touches this turn. Citations are sourced
    // from here (intent comes from the [tool:slug] markers the model writes), so the
    // common case needs no extra DB round-trip at the end.
    type ToolCard = {
      id: string; slug: string; name: string; tagline: string;
      logo_url: string | null; pricing_tier: string;
    };
    const toolCards = new Map<string, ToolCard>();
    const cacheCard = (t: ToolCard) => toolCards.set(t.slug, {
      id: t.id, slug: t.slug, name: t.name, tagline: t.tagline,
      logo_url: t.logo_url, pricing_tier: t.pricing_tier,
    });

    async function runSearchTools(input: {
      query: string;
      pricing_tier?: string;
      has_free_tier?: boolean;
      audience_fit?: string;
      limit?: number;
    }): Promise<string> {
      const embedding = await embedQuery(input.query);
      const { data: matched, error } = await supabaseAdmin.rpc("match_tools_filtered", {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: Math.min(Math.max(input.limit ?? 8, 1), 12),
        filter_pricing_tier: input.pricing_tier ?? null,
        filter_has_free_tier: input.has_free_tier ?? null,
        filter_audience_fit: input.audience_fit ?? null,
      });
      if (error) return `Search failed: ${error.message}`;
      if (!matched || matched.length === 0) {
        return "No matching tools in the directory for that query and filters.";
      }

      // match_tools_filtered returns full card fields — cache them for citations.
      for (const m of matched as ToolCard[]) cacheCard(m);

      const ids = matched.map((t: { id: string }) => t.id);
      const { data: details } = await supabaseAdmin
        .from("tools")
        .select("id, slug, name, tagline, pricing_tier, has_free_tier, audience_fit, key_strengths")
        .in("id", ids);
      const byId = new Map((details ?? []).map((d: { id: string }) => [d.id, d]));

      const lines = matched.map((m: { id: string }) => {
        const t = byId.get(m.id) as {
          slug: string; name: string; tagline: string; pricing_tier: string;
          has_free_tier: boolean; audience_fit: string; key_strengths: string[];
        } | undefined;
        if (!t) return null;
        return `[tool:${t.slug}] ${t.name} — ${t.tagline}. Pricing: ${t.pricing_tier}${t.has_free_tier ? " (free tier)" : ""}. Audience: ${t.audience_fit.replace("_", " ")}. Strengths: ${(t.key_strengths ?? []).join(", ")}.`;
      }).filter(Boolean);

      return lines.join("\n");
    }

    async function runGetToolDetails(input: { slug: string }): Promise<string> {
      const { data: tool } = await supabaseAdmin
        .from("tools")
        .select("id, slug, name, tagline, logo_url, pricing_tier, has_free_tier, audience_fit, key_strengths, api_available, open_source")
        .eq("slug", input.slug)
        .eq("status", "published")
        .maybeSingle();
      if (!tool) return `No published tool found with slug '${input.slug}'.`;
      cacheCard(tool as ToolCard);

      const { data: blocks } = await supabaseAdmin
        .from("content_blocks")
        .select("body_md")
        .eq("tool_id", tool.id)
        .eq("section", "overview")
        .order("sort_order");
      const overview = (blocks ?? []).map((b: { body_md: string }) => b.body_md).join("\n").trim().slice(0, 1500);

      return `[tool:${tool.slug}] ${tool.name} — ${tool.tagline}\n` +
        `Pricing: ${tool.pricing_tier}${tool.has_free_tier ? " (free tier)" : ""}. ` +
        `Audience: ${String(tool.audience_fit).replace("_", " ")}. ` +
        `API: ${tool.api_available ? "yes" : "no"}. Open source: ${tool.open_source ? "yes" : "no"}.\n` +
        `Strengths: ${(tool.key_strengths ?? []).join(", ")}.` +
        (overview ? `\n\nOverview: ${overview}` : "");
    }

    async function runCompareTools(input: { slugs: string[] }): Promise<string> {
      const slugs = (input.slugs ?? []).slice(0, 4);
      if (slugs.length < 2) return "compare_tools needs at least 2 slugs.";

      const { data: tools } = await supabaseAdmin
        .from("tools")
        .select("id, slug, name, tagline, logo_url, pricing_tier, has_free_tier, audience_fit, api_available, open_source, key_strengths")
        .in("slug", slugs)
        .eq("status", "published");
      if (!tools || tools.length < 2) {
        return "Couldn't find at least 2 published tools for those slugs.";
      }

      for (const t of tools as ToolCard[]) cacheCard(t);

      return (tools as Array<{
        slug: string; name: string; tagline: string; pricing_tier: string;
        has_free_tier: boolean; audience_fit: string; api_available: boolean;
        open_source: boolean; key_strengths: string[];
      }>).map((t) =>
        `[tool:${t.slug}] ${t.name} — ${t.tagline}\n` +
        `  Pricing: ${t.pricing_tier}${t.has_free_tier ? " (free tier)" : ""} | ` +
        `Audience: ${t.audience_fit.replace("_", " ")} | ` +
        `API: ${t.api_available ? "yes" : "no"} | ` +
        `Open source: ${t.open_source ? "yes" : "no"}\n` +
        `  Strengths: ${(t.key_strengths ?? []).join(", ")}.`
      ).join("\n\n");
    }

    async function runTool(name: string, input: unknown): Promise<string> {
      try {
        if (name === "search_tools") return await runSearchTools(input as Parameters<typeof runSearchTools>[0]);
        if (name === "get_tool_details") return await runGetToolDetails(input as { slug: string });
        if (name === "compare_tools") return await runCompareTools(input as { slugs: string[] });
        return `Unknown tool: ${name}`;
      } catch (err) {
        return `Tool error: ${err instanceof Error ? err.message : "unknown"}`;
      }
    }

    // Conversation seed for the model.
    // deno-lint-ignore no-explicit-any
    const messages: any[] = conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    async function logUsage(usage: { input_tokens: number; output_tokens: number }) {
      await supabaseAdmin.from("llm_usage").insert({
        user_id: userId,
        feature: "chat",
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cost_usd: (usage.input_tokens * INPUT_COST_PER_M + usage.output_tokens * OUTPUT_COST_PER_M) / 1_000_000,
      });
    }

    // Stream from the agent loop
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const send = (obj: unknown) => writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

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
        await send({ type: "session", session_id: sessionId });

        // Agent loop: the model calls search_tools / get_tool_details as needed,
        // then writes the final answer. We stream text deltas live; only the final
        // (non-tool) turn produces the user-facing answer.
        for (let iter = 0; iter < MAX_AGENT_ITERATIONS; iter++) {
          const isLastAllowed = iter === MAX_AGENT_ITERATIONS - 1;

          const stream = anthropic.messages.stream({
            model: CHAT_MODEL,
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages,
            // On the final allowed iteration, drop tools so the model must answer
            // from what it has rather than requesting another round-trip it can't take.
            ...(isLastAllowed ? {} : { tools: TOOLS }),
          });

          let turnText = "";
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              turnText += event.delta.text;
              await send({ type: "content_block_delta", delta: event.delta });
            }
          }

          const final = await stream.finalMessage();
          await logUsage(final.usage);

          const toolUses = (final.content as Array<{ type: string; id: string; name: string; input: unknown }>)
            .filter((b) => b.type === "tool_use");

          if (final.stop_reason !== "tool_use" || toolUses.length === 0) {
            fullText = turnText;
            break;
          }

          // The model wants tools — run them, feed results back, loop.
          await send({ type: "status", status: "searching" });
          messages.push({ role: "assistant", content: final.content });
          const results = [];
          for (const tu of toolUses) {
            const result = await runTool(tu.name, tu.input);
            results.push({ type: "tool_result", tool_use_id: tu.id, content: result });
          }
          messages.push({ role: "user", content: results });
        }

        // The [tool:slug] markers in the answer are the model's citation intent.
        // Source the card data structurally from tools it touched this turn; only
        // hit the DB for any cited slug the loop never fetched (e.g. recalled from
        // general knowledge but present in the directory).
        const citationMatches = [...fullText.matchAll(/\[tool:([a-z0-9-]+)\]/g)];
        const citedSlugs = [...new Set(citationMatches.map((m) => m[1]))];

        let finalCitedIds: string[] = [];
        if (citedSlugs.length > 0) {
          const citedTools: ToolCard[] = [];
          const uncached: string[] = [];
          for (const slug of citedSlugs) {
            const card = toolCards.get(slug);
            if (card) citedTools.push(card);
            else uncached.push(slug);
          }
          if (uncached.length > 0) {
            const { data: extra } = await supabaseAdmin
              .from("tools")
              .select("id, slug, name, tagline, logo_url, pricing_tier")
              .in("slug", uncached)
              .eq("status", "published");
            for (const t of (extra ?? []) as ToolCard[]) citedTools.push(t);
          }
          finalCitedIds = citedTools.map((t) => t.id);
          await send({ type: "citations", tools: citedTools });
        }

        // Persist assistant message
        await supabaseAdmin.from("chat_messages").insert({
          session_id: sessionId,
          role: "assistant",
          content: fullText,
          tool_citations: finalCitedIds,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Streaming error";
        await send({ type: "error", error: msg });
      } finally {
        await writer.write(encoder.encode("data: [DONE]\n\n"));
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
