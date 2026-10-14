import { type APIRequestContext, expect, test } from "@playwright/test";

// End-to-end coverage for the AI stack tracker (SPEC §19, migration 0041),
// through Supabase's REST API — the same path the browser client uses.
//
//  * Anonymous: no stack rows visible, no writes, and tool_watchers() (who uses
//    what) is not callable. Runs whenever VITE_SUPABASE_* is configured.
//  * Signed in: add → read back via my_stack() → total/overlap → remove. Needs
//    an existing test account in E2E_USER_EMAIL / E2E_USER_PASSWORD; the suite
//    never creates accounts. It cleans up the rows it adds.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const USER_EMAIL = process.env.E2E_USER_EMAIL;
const USER_PASSWORD = process.env.E2E_USER_PASSWORD;

const TOOL_A = "chatgpt";
const TOOL_B = "claude"; // same primary category as TOOL_A → an overlap

type StackRow = {
  tool_id: string;
  slug: string;
  monthly_cost: number;
  status: string;
  overlap_group: string | null;
  is_listed: boolean;
};

function headers(token = ANON_KEY as string) {
  return {
    apikey: ANON_KEY as string,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function toolIds(request: APIRequestContext, slugs: string[]): Promise<Record<string, string>> {
  const res = await request.get(
    `${SUPABASE_URL}/rest/v1/tools?select=id,slug&slug=in.(${slugs.join(",")})&status=eq.published`,
    { headers: headers() },
  );
  expect(res.ok()).toBeTruthy();
  const rows = (await res.json()) as { id: string; slug: string }[];
  return Object.fromEntries(rows.map((r) => [r.slug, r.id]));
}

test.describe("AI stack tracker", () => {
  test.beforeEach(() => {
    test.skip(!SUPABASE_URL || !ANON_KEY, "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (.env.local).");
  });

  test.describe("anonymous", () => {
    test("my_stack() returns nothing", async ({ request }) => {
      const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/my_stack`, { headers: headers(), data: {} });
      expect(res.ok()).toBeTruthy();
      expect(await res.json()).toEqual([]);
    });

    test("cannot read or write stack_items", async ({ request }) => {
      const read = await request.get(`${SUPABASE_URL}/rest/v1/stack_items?select=tool_id&limit=1`, {
        headers: headers(),
      });
      expect(read.ok()).toBeTruthy();
      expect(await read.json()).toEqual([]);

      const ids = await toolIds(request, [TOOL_A]);
      const write = await request.post(`${SUPABASE_URL}/rest/v1/stack_items`, {
        headers: headers(),
        data: { user_id: "00000000-0000-0000-0000-000000000000", tool_id: ids[TOOL_A], cost_usd: 1 },
      });
      expect(write.ok()).toBeFalsy();
    });

    test("tool_watchers() is not exposed", async ({ request }) => {
      const ids = await toolIds(request, [TOOL_A]);
      const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/tool_watchers`, {
        headers: headers(),
        data: { p_tool_id: ids[TOOL_A] },
      });
      expect(res.ok()).toBeFalsy();
    });
  });

  test.describe("signed in", () => {
    test.skip(!USER_EMAIL || !USER_PASSWORD, "Set E2E_USER_EMAIL / E2E_USER_PASSWORD for an existing test account.");

    let token = "";
    let userId = "";
    let ids: Record<string, string> = {};

    test.beforeAll(async ({ request }) => {
      const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        headers: { apikey: ANON_KEY as string, "Content-Type": "application/json" },
        data: { email: USER_EMAIL, password: USER_PASSWORD },
      });
      expect(res.ok()).toBeTruthy();
      const body = (await res.json()) as { access_token: string; user: { id: string } };
      token = body.access_token;
      userId = body.user.id;
      ids = await toolIds(request, [TOOL_A, TOOL_B]);
    });

    test.afterAll(async ({ request }) => {
      if (!token) return;
      await request.delete(
        `${SUPABASE_URL}/rest/v1/stack_items?user_id=eq.${userId}&tool_id=in.(${ids[TOOL_A]},${ids[TOOL_B]})`,
        { headers: headers(token) },
      );
    });

    test("add, total, overlap, remove", async ({ request }) => {
      const upsert = (data: object) =>
        request.post(`${SUPABASE_URL}/rest/v1/stack_items?on_conflict=user_id,tool_id`, {
          headers: { ...headers(token), Prefer: "resolution=merge-duplicates" },
          data,
        });

      expect((await upsert({ user_id: userId, tool_id: ids[TOOL_A], cost_usd: 20 })).ok()).toBeTruthy();
      expect(
        (await upsert({ user_id: userId, tool_id: ids[TOOL_B], cost_usd: 216, billing_period: "year" })).ok(),
      ).toBeTruthy();

      const stack = async () => {
        const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/my_stack`, { headers: headers(token), data: {} });
        expect(res.ok()).toBeTruthy();
        return ((await res.json()) as StackRow[]).filter((r) => r.slug === TOOL_A || r.slug === TOOL_B);
      };

      let rows = await stack();
      const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r]));
      expect(Number(bySlug[TOOL_A].monthly_cost)).toBe(20);
      expect(Number(bySlug[TOOL_B].monthly_cost)).toBe(18); // 216 / 12
      expect(bySlug[TOOL_A].overlap_group).not.toBeNull();
      expect(bySlug[TOOL_A].overlap_group).toBe(bySlug[TOOL_B].overlap_group);

      // Cancelling one breaks the overlap.
      expect(
        (await upsert({ user_id: userId, tool_id: ids[TOOL_B], cost_usd: 216, status: "cancelled" })).ok(),
      ).toBeTruthy();
      rows = await stack();
      expect(rows.find((r) => r.slug === TOOL_A)?.overlap_group ?? null).toBeNull();

      // Writing another user's row is rejected by RLS.
      const foreign = await upsert({ user_id: "00000000-0000-0000-0000-000000000000", tool_id: ids[TOOL_A] });
      expect(foreign.ok()).toBeFalsy();

      const del = await request.delete(
        `${SUPABASE_URL}/rest/v1/stack_items?user_id=eq.${userId}&tool_id=eq.${ids[TOOL_A]}`,
        { headers: headers(token) },
      );
      expect(del.ok()).toBeTruthy();
      rows = await stack();
      expect(rows.map((r) => r.slug)).toEqual([TOOL_B]);
    });
  });
});
