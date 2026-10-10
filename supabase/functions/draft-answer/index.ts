/**
 * draft-answer edge function
 *
 * Admin-only. Turns a real visitor question into a grounded public_answers
 * DRAFT — never published (answer-pages-spec §D.1, as amended). An admin
 * reviews it in /admin/answers/:id and publishes.
 *
 *   1. Hybrid retrieval (match_tools_hybrid) for the question → ~15 candidates.
 *   2. Claude writes the page from ONLY those tools' directory facts, returning
 *      structured output (question, slug, summary, answer_md, tool_slugs).
 *   3. checkDraft() verifies tool references and every $ amount against the
 *      directory's data; problems land in public_answers.review_flags.
 *
 * POST body: { question: string, source_message_id?: string }
 * Response:  { id, slug, flags }
 *
 * Cost: one Sonnet call (~$0.05–0.10) + one embedding. Logged to llm_usage as
 * `answer_draft`; refused once DAILY_COST_CAP_USD is reached.
 */
import Anthropic from "npm:@anthropic-ai/sdk@0.39";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { langevalConfigFromEnv, Trace, tracedAnthropic, tracedEmbedding } from "../_shared/langeval.ts";
import { type CandidateFacts, checkDraft } from "./check.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const LANGEVAL = langevalConfigFromEnv("aiwiki-draft-answer");
const MODEL = "claude-sonnet-4-6";
const EMBEDDING_MODEL = "text-embedding-3-small";
const INPUT_COST_PER_M = 3;
const OUTPUT_COST_PER_M = 15;
const DAILY_COST_CAP_USD = 2.0;
const CANDIDATES = 15;

interface ToolRow extends CandidateFacts {
  id: string;
  tagline: string;
  pricing_currency: string | null;
  audience_fit: string;
  open_source: boolean;
  self_hostable: boolean;
  api_available: boolean;
  key_strengths: string[] | null;
  last_verified_at: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function embedText(text: string): Promise<{ embedding: number[]; tokens?: number }> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
  const body = (await res.json()) as { data: Array<{ embedding: number[] }>; usage?: { prompt_tokens?: number } };
  return { embedding: body.data[0].embedding, tokens: body.usage?.prompt_tokens };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
}

/** One fact block per candidate — the ONLY knowledge the writer may use. */
function factSheet(t: ToolRow, category: string | null, overview: string): string {
  const price = [
    `tier: ${t.pricing_tier}`,
    t.has_free_tier ? "free tier: yes" : "free tier: no",
    t.pricing_starts_at !== null ? `starts at: $${t.pricing_starts_at}${t.pricing_currency && t.pricing_currency !== "USD" ? ` ${t.pricing_currency}` : ""}/mo` : null,
    t.pricing_detail ? `plans: ${t.pricing_detail}` : null,
  ].filter(Boolean).join("; ");
  return [
    `[tool:${t.slug}] ${t.name} — ${t.tagline}`,
    category ? `category: ${category}` : null,
    `pricing: ${price}`,
    `audience: ${t.audience_fit.replace("_", " ")}; API: ${t.api_available ? "yes" : "no"}; open source: ${t.open_source ? "yes" : "no"}; self-hostable: ${t.self_hostable ? "yes" : "no"}`,
    t.key_strengths?.length ? `strengths: ${t.key_strengths.join(", ")}` : null,
    overview ? `overview: ${overview}` : null,
  ].filter(Boolean).join("\n");
}

const SYSTEM = `You write public answer pages for AI Wiki, a directory of AI tools. Each page answers one real question visitors ask, and must be genuinely useful — the kind of page a person would bookmark, not SEO filler.

Hard rules:
- Use ONLY the tools in the fact sheets, and ONLY the facts stated there. Never add a feature, price, plan name, limit or model that isn't in a tool's sheet. If the sheets don't support a claim, leave it out.
- Refer to a tool ONLY as its marker, exactly as given: [tool:slug]. The page turns markers into links with the tool's name, so never write the name next to the marker.
- Quote prices exactly as the sheet states them ("$20/mo"). Don't round, convert or estimate. Omit a price you don't have.
- Pick the 3–8 tools that genuinely fit the question; skip candidates that don't. If the question asks for free or open-source tools, only pick tools whose sheet says so.
- Don't mention AI Wiki, "our directory", dates, or that facts may change.

Page shape (markdown, no H1 — the question is the page title):
1. A 2–3 sentence direct answer naming the top pick(s) and who each is for.
2. "## Top picks": one "### [tool:slug] — best for <job>" section per tool, 2–4 sentences grounded in its sheet (what it does, who it suits, pricing).
3. A comparison table: Tool | Best for | Free tier | Starting price — tools as [tool:slug] markers, "—" where a fact is missing.
4. "## How to choose": 3–5 concrete bullets mapping situations to tools.
Aim for 400–900 words.`;

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string", description: "The page title: the visitor's question, cleaned up as a natural, specific search query ending in '?'. E.g. 'What are the best free AI image generators?'" },
    slug: { type: "string", description: "kebab-case URL slug, ≤60 chars, keyword-first. E.g. 'best-free-ai-image-generators'" },
    summary: { type: "string", description: "Meta description, ≤155 chars, plain text (no markers): the direct answer in one sentence." },
    answer_md: { type: "string", description: "The page body in markdown, following the page shape." },
    tool_slugs: { type: "array", items: { type: "string" }, description: "Slugs of the tools the page recommends, best first (3–8)." },
    category_slug: { type: ["string", "null"], description: "The single category slug that best fits the question, from the list given, or null." },
  },
  required: ["question", "slug", "summary", "answer_md", "tool_slugs", "category_slug"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const denied = await requireAdmin(req, supabaseAdmin);
  if (denied) return denied;

  const trace = new Trace(LANGEVAL);
  const root = trace.start("draft-answer", { "openinference.span.kind": "CHAIN" });

  try {
    const { question, source_message_id } = (await req.json()) as { question?: string; source_message_id?: string };
    const q = (question ?? "").trim();
    if (q.length < 5 || q.length > 300) return json({ error: "question must be 5–300 characters" }, 400);
    root.content("input", q);

    // Daily cost cap (CLAUDE.md: every LLM function checks before calling).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: usageRows } = await supabaseAdmin
      .from("llm_usage")
      .select("cost_usd")
      .eq("feature", "answer_draft")
      .gte("created_at", today.toISOString());
    const spent = (usageRows ?? []).reduce((s, r) => s + (r.cost_usd ?? 0), 0);
    if (spent >= DAILY_COST_CAP_USD) return json({ error: `Daily cap ($${DAILY_COST_CAP_USD}) reached for answer drafts` }, 429);

    // 1. Retrieval — same hybrid RPC the chat uses.
    const embedding = await tracedEmbedding(trace, root, EMBEDDING_MODEL, q, () => embedText(q));
    const { data: matched, error: matchErr } = await supabaseAdmin.rpc("match_tools_hybrid", {
      query_embedding: embedding,
      query_text: q,
      match_count: CANDIDATES,
    });
    if (matchErr) throw new Error(`retrieval failed: ${matchErr.message}`);
    const ids = ((matched ?? []) as Array<{ id: string }>).map((m) => m.id);
    if (ids.length < 3) return json({ error: "Not enough matching tools in the directory to answer this" }, 422);

    const [{ data: toolRows }, { data: blocks }, { data: categories }] = await Promise.all([
      supabaseAdmin
        .from("tools")
        .select("id, slug, name, tagline, pricing_tier, has_free_tier, pricing_starts_at, pricing_currency, pricing_detail, audience_fit, open_source, self_hostable, api_available, key_strengths, last_verified_at, primary_category_id")
        .in("id", ids)
        .eq("status", "published"),
      supabaseAdmin
        .from("content_blocks")
        .select("tool_id, body_md")
        .in("tool_id", ids)
        .eq("section", "overview")
        .eq("audience", "non_technical"),
      supabaseAdmin.from("categories").select("id, slug, name"),
    ]);
    const catById = new Map((categories ?? []).map((c) => [c.id, c]));
    const overviewById = new Map((blocks ?? []).map((b) => [b.tool_id, String(b.body_md).replace(/\s+/g, " ").slice(0, 500)]));
    const tools = ids
      .map((id) => (toolRows ?? []).find((t) => t.id === id))
      .filter((t): t is ToolRow & { primary_category_id: string | null } => !!t);

    const sheets = tools
      .map((t) => factSheet(t, t.primary_category_id ? catById.get(t.primary_category_id)?.name ?? null : null, overviewById.get(t.id) ?? ""))
      .join("\n\n");

    // 2. Draft.
    const request: Anthropic.MessageCreateParamsNonStreaming = {
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `Visitor question: ${q}\n\nCategories (slug — name): ${(categories ?? []).map((c) => `${c.slug} — ${c.name}`).join("; ")}\n\nFact sheets (ranked by relevance):\n\n${sheets}`,
      }],
      tools: [{ name: "write_answer_page", description: "Return the answer page.", input_schema: DRAFT_SCHEMA as Anthropic.Tool["input_schema"] }],
      tool_choice: { type: "tool", name: "write_answer_page" },
    };
    const msg = await tracedAnthropic(trace, root, request, () => anthropic.messages.create(request));
    await supabaseAdmin.from("llm_usage").insert({
      feature: "answer_draft",
      input_tokens: msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
      cost_usd: (msg.usage.input_tokens * INPUT_COST_PER_M + msg.usage.output_tokens * OUTPUT_COST_PER_M) / 1_000_000,
    });
    const out = msg.content.find((b) => b.type === "tool_use");
    if (!out || out.type !== "tool_use") throw new Error("model returned no draft");
    const d = out.input as {
      question: string; slug: string; summary: string; answer_md: string; tool_slugs: string[]; category_slug: string | null;
    };

    // 3. Verify, keep only real tools in tool_ids, store the flags for review.
    const bySlug = new Map(tools.map((t) => [t.slug, t]));
    const toolSlugs = (d.tool_slugs ?? []).filter((s) => bySlug.has(s));
    const flags = checkDraft(d.answer_md ?? "", d.tool_slugs ?? [], tools);

    // Unique slug: suffix -2, -3… if taken (any status).
    const base = slugify(d.slug || d.question) || "answer";
    const { data: taken } = await supabaseAdmin.from("public_answers").select("slug").like("slug", `${base}%`);
    const takenSet = new Set((taken ?? []).map((r) => r.slug));
    let slug = base;
    for (let n = 2; takenSet.has(slug); n++) slug = `${base}-${n}`;

    const row = {
      slug,
      question: d.question.trim(),
      answer_md: d.answer_md.trim(),
      summary: d.summary.trim().slice(0, 160),
      tool_ids: toolSlugs.map((s) => bySlug.get(s)?.id),
      category_id: (categories ?? []).find((c) => c.slug === d.category_slug)?.id ?? null,
      source_message_id: source_message_id ?? null,
      status: "draft",
      review_flags: flags,
    };
    let { data: inserted, error: insErr } = await supabaseAdmin.from("public_answers").insert(row).select("id").single();
    if (insErr && row.source_message_id) {
      // Bad provenance id (deleted / not a message) shouldn't lose the draft.
      ({ data: inserted, error: insErr } = await supabaseAdmin
        .from("public_answers").insert({ ...row, source_message_id: null }).select("id").single());
    }
    if (insErr || !inserted) throw new Error(insErr?.message ?? "insert failed");

    root.content("output", { id: inserted.id, slug, flags }).end();
    trace.flush();
    return json({ id: inserted.id, slug, flags });
  } catch (err) {
    root.fail(err);
    root.end();
    trace.flush();
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
