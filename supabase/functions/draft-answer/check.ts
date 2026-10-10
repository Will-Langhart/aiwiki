/**
 * Deterministic consistency check for an AI-drafted answer (answer-pages-spec
 * §D.4). No LLM: every claim it can verify mechanically is verified against the
 * directory's own data, and anything it can't back up becomes a review flag the
 * editor shows before an admin publishes. Pure — no imports — so it is unit
 * tested from vitest (check.test.ts) and runs unchanged in the Edge Function.
 */

export interface CandidateFacts {
  slug: string;
  name: string;
  pricing_tier: string | null;
  has_free_tier: boolean | null;
  pricing_starts_at: number | null;
  pricing_detail: string | null;
}

export type ReviewFlagKind =
  | "unknown_tool" // [tool:x] that isn't a published tool we retrieved
  | "unverified_price" // a $ amount no cited tool's pricing data contains
  | "listed_not_mentioned" // in tool_slugs but never referenced in the prose
  | "too_few_tools"
  | "thin_answer";

export interface ReviewFlag {
  kind: ReviewFlagKind;
  detail: string;
}

const TOOL_REF = /\[tool:([a-z0-9-]+)\]/g;
const PRICE = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/g;

export const MIN_TOOLS = 3;
export const MIN_CHARS = 600;

/** Every [tool:slug] referenced in the markdown, in order of first appearance. */
export function referencedSlugs(md: string): string[] {
  const seen: string[] = [];
  for (const m of md.matchAll(TOOL_REF)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

/** Dollar amounts a tool's own data supports: starting price + any in pricing_detail. */
function knownPrices(tool: CandidateFacts): Set<number> {
  const out = new Set<number>();
  if (tool.pricing_starts_at !== null) out.add(Number(tool.pricing_starts_at));
  if (tool.has_free_tier || tool.pricing_tier === "free") out.add(0);
  for (const m of (tool.pricing_detail ?? "").matchAll(PRICE)) out.add(Number(m[1].replace(/,/g, "")));
  return out;
}

/** The sentence-ish snippet around a match, for a readable flag. */
function around(md: string, index: number, len: number): string {
  const start = Math.max(0, md.lastIndexOf("\n", index) + 1, index - 80);
  const nl = md.indexOf("\n", index + len);
  const end = Math.min(nl === -1 ? md.length : nl, index + len + 80);
  return md.slice(start, end).trim();
}

export function checkDraft(answerMd: string, toolSlugs: string[], candidates: CandidateFacts[]): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const bySlug = new Map(candidates.map((c) => [c.slug, c]));
  const refs = referencedSlugs(answerMd);

  for (const slug of refs) {
    if (!bySlug.has(slug)) flags.push({ kind: "unknown_tool", detail: `[tool:${slug}] isn't a published tool in the directory` });
  }
  for (const slug of toolSlugs) {
    if (bySlug.has(slug) && !refs.includes(slug)) {
      flags.push({ kind: "listed_not_mentioned", detail: `${bySlug.get(slug)?.name ?? slug} is a cited tool but the answer never mentions it` });
    }
  }

  // A price is supported if ANY tool referenced on the same line carries it —
  // or, for a line with no tool reference, any cited tool does.
  const cited = toolSlugs.map((s) => bySlug.get(s)).filter((t): t is CandidateFacts => !!t);
  for (const m of answerMd.matchAll(PRICE)) {
    const amount = Number(m[1].replace(/,/g, ""));
    const line = around(answerMd, m.index ?? 0, m[0].length);
    const lineTools = referencedSlugs(line).map((s) => bySlug.get(s)).filter((t): t is CandidateFacts => !!t);
    const pool = lineTools.length > 0 ? lineTools : cited;
    if (!pool.some((t) => knownPrices(t).has(amount))) {
      flags.push({ kind: "unverified_price", detail: `$${m[1]} isn't in the directory's pricing data: “${line}”` });
    }
  }

  const known = refs.filter((s) => bySlug.has(s));
  if (known.length < MIN_TOOLS) {
    flags.push({ kind: "too_few_tools", detail: `only ${known.length} tool(s) referenced; aim for at least ${MIN_TOOLS}` });
  }
  if (answerMd.trim().length < MIN_CHARS) {
    flags.push({ kind: "thin_answer", detail: `${answerMd.trim().length} characters; thin pages don't rank — aim for ${MIN_CHARS}+` });
  }
  return flags;
}
