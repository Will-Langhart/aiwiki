import { describe, expect, it } from "vitest";
import { groupQuestions, normalizeQuestion } from "./answer-demand";

describe("normalizeQuestion", () => {
  it("collapses phrasings of the same question", () => {
    const key = normalizeQuestion("What's the best AI coding assistant?");
    expect(normalizeQuestion("Best AI coding assistant?")).toBe(key);
    expect(normalizeQuestion("What are the best AI coding assistants?")).toBe(key);
    expect(key).toBe("best coding assistant");
  });

  it("drops one-word prompts", () => {
    expect(normalizeQuestion("rocket")).toBe("");
    expect(normalizeQuestion("hi!")).toBe("");
  });

  it("singularizes -ies plurals", () => {
    expect(normalizeQuestion("Free tools for small agencies")).toBe("free small agency");
    expect(normalizeQuestion("AI copywriting for agencies")).toBe("copywriting agency");
  });
});

describe("groupQuestions", () => {
  const q = (id: string, content: string, at: string) => ({ id, content, created_at: at });

  it("counts, keeps the latest phrasing, and sorts by demand", () => {
    const groups = groupQuestions([
      q("1", "Best AI coding assistant?", "2026-09-01T00:00:00Z"),
      q("2", "Free image generators", "2026-09-02T00:00:00Z"),
      q("3", "What's the best AI coding assistant?", "2026-10-06T00:00:00Z"),
      q("4", "rocket", "2026-10-05T00:00:00Z"),
    ]);
    expect(groups.map((g) => [g.question, g.count, g.sourceMessageId])).toEqual([
      ["What's the best AI coding assistant?", 2, "3"],
      ["Free image generators", 1, "2"],
    ]);
  });

  it("marks questions an existing answer page already covers", () => {
    const [g] = groupQuestions(
      [q("1", "best ai coding assistants", "2026-10-01T00:00:00Z")],
      [{ slug: "best-ai-coding-assistants", question: "What are the best AI coding assistants?" }],
    );
    expect(g.answeredBy).toBe("best-ai-coding-assistants");
  });
});
