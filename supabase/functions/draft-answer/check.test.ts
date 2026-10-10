import { describe, expect, it } from "vitest";
import { type CandidateFacts, checkDraft, referencedSlugs } from "./check";

const tool = (slug: string, over: Partial<CandidateFacts> = {}): CandidateFacts => ({
  slug,
  name: slug[0].toUpperCase() + slug.slice(1),
  pricing_tier: "freemium",
  has_free_tier: true,
  pricing_starts_at: 20,
  pricing_detail: null,
  ...over,
});

const CANDIDATES = [
  tool("cursor"),
  tool("windsurf", { pricing_starts_at: 15, pricing_detail: "Free · Pro $15/mo · Teams $30/user/mo" }),
  tool("copilot", { pricing_starts_at: 10 }),
];
const LONG = " Detailed reasoning about which editor suits which workflow.".repeat(12);

describe("referencedSlugs", () => {
  it("returns unique slugs in first-seen order", () => {
    expect(referencedSlugs("[tool:a] then [tool:b] and [tool:a]")).toEqual(["a", "b"]);
  });
});

describe("checkDraft", () => {
  it("passes a grounded answer", () => {
    const md = `[tool:cursor] starts at $20/mo. [tool:windsurf] Pro is $15/mo, Teams $30. [tool:copilot] costs $10.${LONG}`;
    expect(checkDraft(md, ["cursor", "windsurf", "copilot"], CANDIDATES)).toEqual([]);
  });

  it("flags tools that aren't in the directory", () => {
    const md = `[tool:cursor] [tool:windsurf] [tool:copilot] [tool:grok]${LONG}`;
    const flags = checkDraft(md, ["cursor", "windsurf", "copilot"], CANDIDATES);
    expect(flags).toEqual([{ kind: "unknown_tool", detail: expect.stringContaining("grok") }]);
  });

  it("flags a price the tool on that line doesn't carry", () => {
    const md = `[tool:cursor] costs $25/mo.\n[tool:windsurf] [tool:copilot]${LONG}`;
    const flags = checkDraft(md, ["cursor", "windsurf", "copilot"], CANDIDATES);
    expect(flags.map((f) => f.kind)).toEqual(["unverified_price"]);
    expect(flags[0].detail).toContain("$25");
  });

  it("checks a price on a line without a tool against every cited tool", () => {
    const md = `[tool:cursor] [tool:windsurf] [tool:copilot]\nPlans start around $10 a month.${LONG}`;
    expect(checkDraft(md, ["cursor", "windsurf", "copilot"], CANDIDATES)).toEqual([]);
  });

  it("treats $0 as supported for tools with a free tier", () => {
    const md = `[tool:cursor] has a $0 plan. [tool:windsurf] [tool:copilot]${LONG}`;
    expect(checkDraft(md, ["cursor", "windsurf", "copilot"], CANDIDATES)).toEqual([]);
  });

  it("flags cited tools the prose never mentions, too few tools, and thin answers", () => {
    const flags = checkDraft("[tool:cursor] is great.", ["cursor", "copilot"], CANDIDATES);
    expect(flags.map((f) => f.kind)).toEqual(["listed_not_mentioned", "too_few_tools", "thin_answer"]);
  });
});
