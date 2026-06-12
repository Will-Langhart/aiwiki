/**
 * reenrich-tools edge function
 *
 * Lightweight enrichment pass — updates only the 4 new metadata fields
 * (github_stars, pricing_detail, integrations, traffic_tier) for existing
 * tools without regenerating content blocks.
 *
 * POST body:
 *   { urls: Array<{ tool_id: string; website_url: string }> }  — up to 20
 *
 * Cost: ~$0.01–0.015 per tool (vs ~$0.04 for full discover).
 * Daily cap: $15 for feature "reenrich_tools".
 */
import Anthropic from "npm:@anthropic-ai/sdk@0.39";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });

const DAILY_COST_CAP_USD = 15.0;
const MAX_PER_REQUEST = 20;

function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const ENRICH_SCHEMA = {
  type: "object",
  properties: {
    github_stars: {
      type: ["integer", "null"],
      description: "GitHub star count if mentioned or well-known. Null if unknown.",
    },
    pricing_detail: {
      type: ["string", "null"],
      description: "Short pricing summary ≤80 chars. E.g. 'Free up to 1M vectors · $70/mo Pro'. Null if unclear.",
    },
    integrations: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
      description: "Top integrations this tool connects with. Short names only. E.g. ['GitHub', 'Slack', 'VS Code'].",
    },
    traffic_tier: {
      type: ["string", "null"],
      enum: ["small", "medium", "large", "xlarge", null],
      description: "'small'=niche (<100K users), 'medium'=growing (100K–1M), 'large'=established (1M–10M), 'xlarge'=massive (10M+). Base on page context.",
    },
  },
  required: ["integrations"],
};

async function enrichOne(
  toolId: string,
  url: string,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<{ tool_id: string; status: "ok" | "error"; error?: string }> {
  try {
    const pageRes = await fetch(url, {
      headers: { "User-Agent": "AIWikiBot/1.0 (+https://aiwiki.dev/bot)", Accept: "text/html" },
      signal: AbortSignal.timeout(12_000),
    });
    const html = await pageRes.text();
    const text = extractText(html).slice(0, 6_000);

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: "You are an AI tool directory curator. Extract concise, factual metadata from website content. Never fabricate.",
      messages: [{
        role: "user",
        content: `Extract metadata for this AI tool.\nURL: ${url}\nContent:\n---\n${text}\n---\nReturn only what's clearly stated or strongly implied.`,
      }],
      tools: [{
        name: "extract_metadata",
        description: "Extract lightweight metadata fields",
        input_schema: ENRICH_SCHEMA as Parameters<typeof anthropic.messages.create>[0]["tools"][0]["input_schema"],
      }],
      tool_choice: { type: "tool", name: "extract_metadata" },
    });

    await supabaseAdmin.from("llm_usage").insert({
      feature: "reenrich_tools",
      input_tokens: msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
      cost_usd: (msg.usage.input_tokens * 0.8 + msg.usage.output_tokens * 4) / 1_000_000,
    });

    const toolUse = msg.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") throw new Error("No tool_use block");

    const d = toolUse.input as Record<string, unknown>;

    await supabaseAdmin
      .from("tools")
      .update({
        github_stars: (d.github_stars as number | null) ?? null,
        pricing_detail: (d.pricing_detail as string | null) ?? null,
        integrations: (d.integrations as string[]) ?? [],
        traffic_tier: (d.traffic_tier as string | null) ?? null,
      })
      .eq("id", toolId);

    return { tool_id: toolId, status: "ok" };
  } catch (err) {
    return { tool_id: toolId, status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // Daily cost cap
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: usageRows } = await supabaseAdmin
      .from("llm_usage").select("cost_usd")
      .eq("feature", "reenrich_tools")
      .gte("created_at", today.toISOString());
    const todayCost = (usageRows ?? []).reduce((s, r) => s + (r.cost_usd ?? 0), 0);
    if (todayCost >= DAILY_COST_CAP_USD) {
      return new Response(
        JSON.stringify({ error: `Daily cap ($${DAILY_COST_CAP_USD}) reached for reenrich_tools` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const items: Array<{ tool_id: string; website_url: string }> = (body.items ?? []).slice(0, MAX_PER_REQUEST);

    if (items.length === 0) {
      return new Response(
        JSON.stringify({ error: "items array required: [{ tool_id, website_url }]" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];
    for (const item of items) {
      const r = await enrichOne(item.tool_id, item.website_url, supabaseAdmin);
      results.push(r);
      console.log(`[reenrich-tools] ${r.status.toUpperCase()} ${item.website_url} (${item.tool_id})`);
    }

    const succeeded = results.filter((r) => r.status === "ok").length;
    return new Response(
      JSON.stringify({ results, summary: { succeeded, errored: results.length - succeeded, total: results.length } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
