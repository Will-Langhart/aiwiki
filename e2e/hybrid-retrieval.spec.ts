import { type APIRequestContext, expect, test } from "@playwright/test";

// End-to-end coverage for the retrieval layer the chat's `search_tools` agent
// tool depends on: `match_tools_hybrid` (pgvector ANN + tsvector FTS fused via
// Reciprocal Rank Fusion). We exercise the RPC through Supabase's REST API with
// the anon key — the same function the chat Edge Function calls — and assert the
// *lexical* leg surfaces exact-name matches that the old pure-vector path
// (`match_tools_filtered`) could not guarantee.
//
// These are LLM-free: they hit Postgres directly, so there's no chat rate limit
// and no token spend. The suite skips when Supabase env vars aren't configured.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

// A 1536-dim zero vector isolates the lexical leg: with no meaningful semantic
// signal, whatever still ranks must have come from the FTS side of the fusion.
const ZERO_VECTOR = `[${Array(1536).fill(0).join(",")}]`;

type HybridRow = {
  slug: string;
  name: string;
  similarity: number | null;
  rrf_score: number;
};

test.describe("hybrid chat retrieval (match_tools_hybrid)", () => {
  test.beforeEach(() => {
    test.skip(
      !SUPABASE_URL || !ANON_KEY,
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (.env.local) to run retrieval tests.",
    );
  });

  const headers = () => ({
    apikey: ANON_KEY as string,
    Authorization: `Bearer ${ANON_KEY as string}`,
    "Content-Type": "application/json",
  });

  // Pick a real published tool at runtime instead of hardcoding a slug, so the
  // test tracks the live directory rather than breaking when seed data changes.
  async function firstPublishedTool(request: APIRequestContext) {
    const res = await request.get(
      `${SUPABASE_URL}/rest/v1/tools?select=slug,name&status=eq.published&limit=1`,
      { headers: headers() },
    );
    expect(res.ok(), `tools fetch failed: ${res.status()}`).toBeTruthy();
    const rows = (await res.json()) as Array<{ slug: string; name: string }>;
    expect(rows.length, "no published tools to test against").toBeGreaterThan(0);
    return rows[0];
  }

  async function hybrid(
    request: APIRequestContext,
    body: Record<string, unknown>,
  ): Promise<HybridRow[]> {
    const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/match_tools_hybrid`, {
      headers: headers(),
      data: body,
    });
    expect(res.ok(), `rpc failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    return (await res.json()) as HybridRow[];
  }

  test("lexical leg surfaces an exact tool-name match", async ({ request }) => {
    const tool = await firstPublishedTool(request);

    const rows = await hybrid(request, {
      query_embedding: ZERO_VECTOR,
      query_text: tool.name,
      match_count: 8,
    });

    const slugs = rows.map((r) => r.slug);
    expect(
      slugs,
      `hybrid search for "${tool.name}" should surface ${tool.slug}; got [${slugs.join(", ")}]`,
    ).toContain(tool.slug);
  });

  test("results come back RRF-ranked best-first with the expected shape", async ({ request }) => {
    const tool = await firstPublishedTool(request);

    const rows = await hybrid(request, {
      query_embedding: ZERO_VECTOR,
      query_text: tool.name,
      match_count: 8,
    });

    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(typeof r.slug).toBe("string");
      // RRF score is a sum of 1/(k+rank) terms — always a real, sortable number.
      expect(typeof r.rrf_score).toBe("number");
      expect(Number.isFinite(r.rrf_score)).toBe(true);
    }

    const scores = rows.map((r) => r.rrf_score);
    const sortedDesc = [...scores].sort((a, b) => b - a);
    expect(scores, "rows must be ordered by rrf_score desc").toEqual(sortedDesc);
  });

  test("hard filters constrain the candidate set", async ({ request }) => {
    const rows = await hybrid(request, {
      query_embedding: ZERO_VECTOR,
      query_text: "assistant",
      match_count: 12,
      filter_has_free_tier: true,
    });

    // Result count is data-dependent; skip the assertion when there's nothing
    // to verify. When there are rows, every one must honor the filter.
    test.skip(rows.length === 0, "no free-tier matches in the directory to verify");

    const slugs = rows.map((r) => r.slug);
    const res = await request.get(
      `${SUPABASE_URL}/rest/v1/tools?select=slug,has_free_tier&slug=in.(${slugs.join(",")})`,
      { headers: headers() },
    );
    expect(res.ok()).toBeTruthy();
    const detail = (await res.json()) as Array<{
      slug: string;
      has_free_tier: boolean;
    }>;
    for (const d of detail) {
      expect(d.has_free_tier, `${d.slug} leaked past has_free_tier filter`).toBe(true);
    }
  });
});
