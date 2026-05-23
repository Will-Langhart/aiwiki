import Anthropic from "npm:@anthropic-ai/sdk@0.39";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });
const MAX_DAILY_SPEND_USD = Number(Deno.env.get("MAX_DAILY_SPEND_USD_COMPARE") ?? "3");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const { tool_slugs } = await req.json() as { tool_slugs: string[] };
    if (!tool_slugs || tool_slugs.length < 2) {
      return new Response(JSON.stringify({ error: "At least 2 tool_slugs required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cacheSlug = [...tool_slugs].sort().join("-vs-");

    // Check cache — if fresh (< 24h), stream cached text as single event
    const { data: cached } = await supabase
      .from("comparisons")
      .select("ai_summary, last_generated_at")
      .eq("slug", cacheSlug)
      .maybeSingle();

    if (cached?.ai_summary && cached.last_generated_at) {
      const age = Date.now() - new Date(cached.last_generated_at).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        // Serve from cache as SSE
        const stream = new ReadableStream({
          start(controller) {
            // Stream cached text word-by-word for consistent UX
            const words = (cached.ai_summary ?? "").split(" ");
            let i = 0;
            const interval = setInterval(() => {
              if (i >= words.length) {
                clearInterval(interval);
                controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                controller.close();
                return;
              }
              const chunk = (i === 0 ? "" : " ") + words[i];
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
              i++;
            }, 15);
          },
        });
        return new Response(stream, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      }
    }

    // Daily cost cap check (global — not per-user for compare summaries)
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { data: usageToday } = await supabase
      .from("llm_usage")
      .select("cost_usd")
      .eq("feature", "compare_summary")
      .gte("created_at", today.toISOString());
    const spentToday = (usageToday ?? []).reduce((s: number, r: { cost_usd: number | null }) => s + (r.cost_usd ?? 0), 0);
    if (spentToday >= MAX_DAILY_SPEND_USD) {
      return new Response(JSON.stringify({ error: "Daily compare summary limit reached. Try again tomorrow." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tool data
    const { data: tools } = await supabase
      .from("tools")
      .select("name, tagline, pricing_tier, has_free_tier, audience_fit, open_source, api_available, key_strengths")
      .in("slug", tool_slugs)
      .eq("status", "published");

    if (!tools || tools.length < 2) {
      return new Response(JSON.stringify({ error: "Could not fetch tool data" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toolSummaries = tools.map((t: {
      name: string; tagline: string; pricing_tier: string; has_free_tier: boolean;
      audience_fit: string; open_source: boolean; api_available: boolean; key_strengths: string[];
    }) =>
      `**${t.name}**: ${t.tagline}. Pricing: ${t.pricing_tier}${t.has_free_tier ? " (free tier available)" : ""}. Audience: ${t.audience_fit.replace("_", " ")}. Open source: ${t.open_source}. API: ${t.api_available}. Key strengths: ${t.key_strengths.join(", ")}.`
    ).join("\n");

    const prompt = `You are an AI tool comparison assistant. Generate a concise 3-4 sentence TL;DR comparing these tools, focused on the most meaningful differences. Don't repeat facts that are obvious from the names. Be direct and useful to someone making a choice.\n\nTools:\n${toolSummaries}`;

    // Stream from Claude
    let fullText = "";
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const streamResponse = new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });

    // Run streaming in background
    (async () => {
      try {
        const stream = anthropic.messages.stream({
          model: "claude-sonnet-4-5",
          max_tokens: 512,
          messages: [{ role: "user", content: prompt }],
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text;
            await writer.write(
              new TextEncoder().encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            );
          }
        }

        const usage = (await stream.finalMessage()).usage;

        // Cache result
        await supabase.from("comparisons").upsert({
          slug: cacheSlug,
          tool_ids: (tools as { name: string }[]).map((_, i) => tool_slugs[i]),
          ai_summary: fullText,
          last_generated_at: new Date().toISOString(),
        });

        // Log usage
        await supabase.from("llm_usage").insert({
          feature: "compare_summary",
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cost_usd: (usage.input_tokens * 3 + usage.output_tokens * 15) / 1_000_000,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Streaming error";
        await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
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
