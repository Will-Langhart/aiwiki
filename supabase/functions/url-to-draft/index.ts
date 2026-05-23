import Anthropic from "npm:@anthropic-ai/sdk@0.39";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });

// Strip HTML tags and collapse whitespace
function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: 10 calls / user / day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("llm_usage")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("feature", "url_to_draft")
      .gte("created_at", today.toISOString());

    if ((count ?? 0) >= 10) {
      return new Response(
        JSON.stringify({ error: "Rate limit: 10 autofill uses per day" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the page
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent": "AIWikiBot/1.0 (+https://aiwiki.dev/bot)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10_000),
    });

    const html = await pageRes.text();
    const textContent = extractText(html).slice(0, 8000);

    // Call Claude
    const prompt = `Extract structured information about this AI tool from its website.
URL: ${url}
Content (truncated): ${textContent}

Return JSON matching this schema exactly (no markdown, just raw JSON):
{
  "name": "string (the product name, 2-60 chars)",
  "tagline": "string (one-line description, 10-140 chars)",
  "overview_md": "string (2-3 sentence overview in markdown)",
  "primary_category_suggestion": "string (one of: Writing & Content, Coding & Dev, Image Generation, Video & Media, Audio & Music, Data & Analytics, Productivity, Marketing, Customer Support, Research, Other)",
  "pricing_tier": "free | freemium | paid | enterprise",
  "has_free_tier": true|false,
  "pricing_starts_at": number|null,
  "audience_fit": "technical | non_technical | both",
  "open_source": true|false,
  "api_available": true|false,
  "key_strengths": ["string", "string", "string"]
}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;

    // Log usage
    await supabase.from("llm_usage").insert({
      user_id: user.id,
      feature: "url_to_draft",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: (inputTokens * 3 + outputTokens * 15) / 1_000_000,
    });

    // Parse response
    const rawContent = message.content[0];
    if (rawContent.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let parsed: Record<string, unknown>;
    try {
      // Strip markdown code fences if present
      const jsonStr = rawContent.text.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error("Failed to parse Claude response as JSON");
    }

    return new Response(JSON.stringify({ data: parsed }), {
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
