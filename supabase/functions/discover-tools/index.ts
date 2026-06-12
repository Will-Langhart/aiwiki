/**
 * discover-tools edge function
 *
 * Admin-only. Accepts a list of tool URLs, scrapes each, uses Claude to extract
 * full structured data + content blocks, and upserts directly into public.tools.
 *
 * POST body:
 *   { urls: string[] }          — up to 20 URLs per request
 *
 * Response:
 *   { results: Array<{ url, slug, status, error? }> }
 *
 * Cost guardrail: checks llm_usage daily total for feature "discover_tools"
 * and rejects if the estimated cost would exceed $5/day.
 */
import Anthropic from "npm:@anthropic-ai/sdk@0.39";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });

const DAILY_COST_CAP_USD = 5.0;
const MAX_URLS_PER_REQUEST = 20;

// Strip HTML → plain text, truncate for prompt
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function domainFrom(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Category slug mapping — map Claude's free-text suggestion to our DB slugs
// ---------------------------------------------------------------------------
const CATEGORY_MAP: Record<string, string> = {
  "chat-assistants": "chat-assistants",
  "chat assistants": "chat-assistants",
  "conversational ai": "chat-assistants",
  "coding": "coding",
  "coding & development": "coding",
  "code": "coding",
  "image generation": "image-generation",
  "image-generation": "image-generation",
  "images": "image-generation",
  "video": "video",
  "video generation": "video",
  "video & media": "video",
  "audio": "audio-music",
  "audio & music": "audio-music",
  "music": "audio-music",
  "search": "search-research",
  "search & research": "search-research",
  "research": "search-research",
  "writing": "writing",
  "writing & editing": "writing",
  "writing & content": "writing",
  "content": "writing",
  "presentations": "presentations-docs",
  "presentations & docs": "presentations-docs",
  "docs": "presentations-docs",
  "design": "design",
  "data": "data-analytics",
  "data & analytics": "data-analytics",
  "analytics": "data-analytics",
  "automation": "automation",
  "automation & agents": "automation",
  "agents": "automation",
  "infrastructure": "infrastructure",
  "ai infrastructure": "infrastructure",
  "voice": "voice",
  "voice & speech": "voice",
  "speech": "voice",
  "marketing": "marketing-sales",
  "marketing & sales": "marketing-sales",
  "sales": "marketing-sales",
  // New categories
  "vector-databases": "vector-databases",
  "vector databases": "vector-databases",
  "vector database": "vector-databases",
  "vector db": "vector-databases",
  "embeddings": "vector-databases",
  "mlops": "mlops-training",
  "mlops & training": "mlops-training",
  "ml training": "mlops-training",
  "machine learning": "mlops-training",
  "model training": "mlops-training",
  "experiment tracking": "mlops-training",
  "agent frameworks": "agent-frameworks",
  "agent-frameworks": "agent-frameworks",
  "ai agents": "agent-frameworks",
  "agentic ai": "agent-frameworks",
  "agent builder": "agent-frameworks",
  "ai observability": "ai-observability",
  "ai-observability": "ai-observability",
  "llm observability": "ai-observability",
  "observability": "ai-observability",
  "monitoring": "ai-observability",
  "llm monitoring": "ai-observability",
  "tracing": "ai-observability",
  "evaluation": "ai-observability",
};

function resolveCategory(raw: string): string {
  return CATEGORY_MAP[raw.toLowerCase().trim()] ?? "chat-assistants";
}

// ---------------------------------------------------------------------------
// Schema for Claude's structured output
// ---------------------------------------------------------------------------
const TOOL_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Product name, 2-60 chars" },
    tagline: { type: "string", description: "One-line pitch, 15-140 chars" },
    primary_category: {
      type: "string",
      enum: [
        "chat-assistants", "coding", "image-generation", "video", "audio-music",
        "search-research", "writing", "presentations-docs", "design",
        "data-analytics", "automation", "infrastructure", "voice", "marketing-sales",
        "vector-databases", "mlops-training", "agent-frameworks", "ai-observability",
      ],
    },
    pricing_tier: { type: "string", enum: ["free", "freemium", "paid", "enterprise"] },
    has_free_tier: { type: "boolean" },
    pricing_starts_at: { type: ["number", "null"] },
    pricing_detail: {
      type: ["string", "null"],
      description: "Short human-readable pricing summary, max 80 chars. E.g. 'Free up to 1M vectors · $70/mo Pro' or 'Free tier · $20/mo paid'.",
    },
    audience_fit: { type: "string", enum: ["technical", "non_technical", "both"] },
    model_provider: { type: ["string", "null"] },
    open_source: { type: "boolean" },
    self_hostable: { type: "boolean" },
    api_available: { type: "boolean" },
    github_stars: {
      type: ["integer", "null"],
      description: "GitHub star count if mentioned on the page or well-known (e.g. 25000). Null if unknown.",
    },
    integrations: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
      description: "Top integrations/platforms this tool connects with. E.g. ['GitHub', 'VS Code', 'Slack', 'Zapier']. Max 5, short names only.",
    },
    traffic_tier: {
      type: ["string", "null"],
      enum: ["small", "medium", "large", "xlarge", null],
      description: "Estimated traffic/popularity tier. 'small'=niche/startup (<100K users), 'medium'=growing (100K-1M), 'large'=established (1M-10M), 'xlarge'=massive (10M+). Base on user counts, customer logos, or brand recognition.",
    },
    founded_year: { type: ["number", "null"] },
    hq_country: { type: ["string", "null"] },
    hq_city: { type: ["string", "null"] },
    key_strengths: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 5,
    },
    overview_technical: {
      type: "string",
      description: "2-4 sentence technical overview: architecture, APIs, integrations. May include a short code example.",
    },
    overview_general: {
      type: "string",
      description: "2-4 sentence non-technical overview: what it does, who uses it, key benefit.",
    },
    docs_technical: {
      type: "string",
      description: "Developer-facing documentation section: API usage, setup, key parameters. Markdown.",
    },
    docs_general: {
      type: "string",
      description: "Non-technical how-to guide: step-by-step getting started. Markdown.",
    },
    use_cases_technical: {
      type: "string",
      description: "4-6 bullet points of technical use cases (developer workflows). Markdown list.",
    },
    use_cases_general: {
      type: "string",
      description: "4-6 bullet points of non-technical use cases (end-user scenarios). Markdown list.",
    },
  },
  required: [
    "name", "tagline", "primary_category", "pricing_tier", "has_free_tier",
    "pricing_starts_at", "audience_fit", "open_source", "self_hostable",
    "api_available", "key_strengths", "overview_technical", "overview_general",
    "docs_technical", "docs_general", "use_cases_technical", "use_cases_general",
    "integrations",
  ],
};

// ---------------------------------------------------------------------------
// Process a single URL
// ---------------------------------------------------------------------------
async function processUrl(
  url: string,
  catMap: Record<string, string>,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<{ url: string; slug: string | null; status: "inserted" | "updated" | "error"; error?: string }> {
  try {
    // 1. Fetch page content
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent": "AIWikiBot/1.0 (+https://aiwiki.dev/bot)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(15_000),
    });

    const html = await pageRes.text();
    const textContent = extractText(html).slice(0, 10_000);
    const domain = domainFrom(url);

    // 2. Extract via Claude structured output
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: `You are an AI tool directory curator. Extract accurate, factual information about AI tools from their website content. Be concise and precise. Never fabricate features or pricing.`,
      messages: [
        {
          role: "user",
          content: `Extract comprehensive information about this AI tool.

URL: ${url}
Domain: ${domain}
Page content (truncated to 10K chars):
---
${textContent}
---

Return the JSON schema I specified. For content sections (overview_technical, overview_general, docs_technical, docs_general, use_cases_technical, use_cases_general), write substantive content — 2-4 paragraphs or 4-6 bullet points each. Use markdown formatting.`,
        },
      ],
      tools: [
        {
          name: "extract_tool_data",
          description: "Extract structured AI tool data from website content",
          input_schema: TOOL_EXTRACTION_SCHEMA as Parameters<typeof anthropic.messages.create>[0]["tools"][0]["input_schema"],
        },
      ],
      tool_choice: { type: "tool", name: "extract_tool_data" },
    });

    // Log usage
    await supabaseAdmin.from("llm_usage").insert({
      feature: "discover_tools",
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
      cost_usd: (message.usage.input_tokens * 3 + message.usage.output_tokens * 15) / 1_000_000,
    });

    // Parse tool use response
    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("Claude did not return a tool_use block");
    }

    const d = toolUse.input as Record<string, unknown>;
    const slug = slugify(d.name as string);
    const categorySlug = resolveCategory(d.primary_category as string);
    const categoryId = catMap[categorySlug] ?? null;

    // 3. Upsert tool
    const { data: tool, error: toolErr } = await supabaseAdmin
      .from("tools")
      .upsert(
        {
          slug,
          name: d.name as string,
          tagline: d.tagline as string,
          website_url: url,
          logo_url: `https://icon.horse/icon/${domain}`,
          primary_category_id: categoryId,
          pricing_tier: d.pricing_tier as "free" | "freemium" | "paid" | "enterprise",
          has_free_tier: d.has_free_tier as boolean,
          pricing_starts_at: d.pricing_starts_at as number | null,
          pricing_currency: "USD",
          pricing_detail: (d.pricing_detail as string | null) ?? null,
          audience_fit: d.audience_fit as "technical" | "non_technical" | "both",
          model_provider: (d.model_provider as string | null) ?? null,
          open_source: d.open_source as boolean,
          self_hostable: d.self_hostable as boolean,
          api_available: d.api_available as boolean,
          github_stars: (d.github_stars as number | null) ?? null,
          integrations: (d.integrations as string[]) ?? [],
          traffic_tier: (d.traffic_tier as string | null) ?? null,
          founded_year: (d.founded_year as number | null) ?? null,
          hq_country: (d.hq_country as string | null) ?? null,
          hq_city: (d.hq_city as string | null) ?? null,
          key_strengths: d.key_strengths as string[],
          status: "published",
          published_at: new Date().toISOString(),
        },
        { onConflict: "slug", ignoreDuplicates: false }
      )
      .select("id")
      .single();

    if (toolErr || !tool) {
      throw new Error(toolErr?.message ?? "Failed to upsert tool");
    }

    // 4. Category junction
    if (categoryId) {
      await supabaseAdmin.from("tool_categories").upsert(
        { tool_id: tool.id, category_id: categoryId },
        { onConflict: "tool_id,category_id", ignoreDuplicates: true }
      );
    }

    // 5. Replace content blocks
    await supabaseAdmin.from("content_blocks").delete().eq("tool_id", tool.id);

    const blocks = [
      { section: "overview", audience: "technical", body_md: d.overview_technical as string, sort_order: 0 },
      { section: "overview", audience: "non_technical", body_md: d.overview_general as string, sort_order: 1 },
      { section: "docs", audience: "technical", body_md: d.docs_technical as string, sort_order: 0 },
      { section: "docs", audience: "non_technical", body_md: d.docs_general as string, sort_order: 1 },
      { section: "use_cases", audience: "technical", body_md: d.use_cases_technical as string, sort_order: 0 },
      { section: "use_cases", audience: "non_technical", body_md: d.use_cases_general as string, sort_order: 1 },
    ];

    await supabaseAdmin.from("content_blocks").insert(
      blocks.map((b) => ({ tool_id: tool.id, ...b, heading: null }))
    );

    return { url, slug, status: "inserted" };
  } catch (err) {
    return {
      url,
      slug: null,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // Admin-only: verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("is_admin")
          .eq("id", user.id)
          .single();
        if (!profile?.is_admin) {
          return new Response(JSON.stringify({ error: "Admin only" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Daily cost cap
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: usageRows } = await supabaseAdmin
      .from("llm_usage")
      .select("cost_usd")
      .eq("feature", "discover_tools")
      .gte("created_at", today.toISOString());

    const todayCost = (usageRows ?? []).reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
    if (todayCost >= DAILY_COST_CAP_USD) {
      return new Response(
        JSON.stringify({ error: `Daily cost cap ($${DAILY_COST_CAP_USD}) reached for discover_tools` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const urls: string[] = (body.urls ?? []).slice(0, MAX_URLS_PER_REQUEST);

    if (urls.length === 0) {
      return new Response(JSON.stringify({ error: "urls array required (max 20)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all category IDs
    const { data: categories } = await supabaseAdmin.from("categories").select("id, slug");
    const catMap = Object.fromEntries((categories ?? []).map((c) => [c.slug, c.id]));

    // Process URLs sequentially to avoid rate limits
    const results = [];
    for (const url of urls) {
      const result = await processUrl(url, catMap, supabaseAdmin);
      results.push(result);
      console.log(`[discover-tools] ${result.status.toUpperCase()} ${url} → ${result.slug ?? result.error}`);
    }

    const succeeded = results.filter((r) => r.status !== "error").length;
    const errored = results.filter((r) => r.status === "error").length;

    return new Response(
      JSON.stringify({ results, summary: { succeeded, errored, total: urls.length } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
