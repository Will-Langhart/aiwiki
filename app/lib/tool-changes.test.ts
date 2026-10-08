import { describe, expect, it } from "vitest";
import { describeChange, formatChangeDate, groupChanges, type ToolChangeWithTool } from "./tool-changes";

describe("describeChange", () => {
  it("shows old → new for prices and tiers", () => {
    expect(describeChange({ field: "pricing_starts_at", old_value: 20, new_value: 25 })).toBe(
      "Starting price: $20/mo → $25/mo",
    );
    expect(describeChange({ field: "pricing_tier", old_value: "freemium", new_value: "paid" })).toBe(
      "Pricing model: freemium → paid only",
    );
  });

  it("phrases booleans as availability", () => {
    expect(describeChange({ field: "has_free_tier", old_value: true, new_value: false })).toBe("Free tier: removed");
    expect(describeChange({ field: "api_available", old_value: false, new_value: true })).toBe("API: now available");
    expect(describeChange({ field: "open_source", old_value: true, new_value: false })).toBe(
      "Open source: no longer offered",
    );
  });

  it("shows only the new value for long text fields", () => {
    expect(describeChange({ field: "pricing_detail", old_value: "Pro $20/mo", new_value: "Pro $25/mo" })).toBe(
      "Plans updated: Pro $25/mo",
    );
  });
});

describe("formatChangeDate", () => {
  it("formats in UTC so prerender and client agree", () => {
    expect(formatChangeDate("2026-10-06T23:30:00Z")).toBe("Oct 6, 2026");
  });
});

describe("groupChanges", () => {
  const tool = (slug: string) => ({ slug, name: slug, logo_url: null });
  const change = (id: string, slug: string, at: string): ToolChangeWithTool => ({
    id,
    field: "pricing_tier",
    old_value: "free",
    new_value: "paid",
    created_at: at,
    tool: tool(slug),
  });

  it("groups by tool and UTC day, keeping newest-first order", () => {
    const groups = groupChanges([
      change("1", "cursor", "2026-10-06T10:00:00Z"),
      change("2", "notion", "2026-10-06T09:00:00Z"),
      change("3", "cursor", "2026-10-06T08:00:00Z"),
      change("4", "cursor", "2026-10-01T08:00:00Z"),
    ]);
    expect(groups.map((g) => [g.tool.slug, g.date, g.changes.length])).toEqual([
      ["cursor", "2026-10-06", 2],
      ["notion", "2026-10-06", 1],
      ["cursor", "2026-10-01", 1],
    ]);
  });
});
