/**
 * Generate public/sitemap.xml from published tools + categories.
 * Runs automatically before `npm run build` (see package.json `prebuild`).
 *
 * Requires SUPABASE_URL + a key (service role preferred, anon fallback) in
 * .env.local. If env is missing it writes a static-routes-only sitemap so the
 * build never fails.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient } from "@supabase/supabase-js";
import { getPopularCompareSlugs } from "../app/lib/compare-paths";
import { getPublishedAnswerSlugs } from "../app/lib/answer-paths";
import type { Database } from "../app/types/database";

const SITE_URL = "https://aiwiki.io";

interface UrlEntry {
  loc: string;
  changefreq?: string;
  priority?: number;
  /** W3C date (YYYY-MM-DD). Google uses this to schedule recrawls. */
  lastmod?: string;
}

// Build timestamp, used as lastmod for routes with no per-row date of their own.
const BUILD_DATE = new Date().toISOString().slice(0, 10);

/** Coerce a DB timestamp into a W3C-format lastmod, or undefined if unparseable. */
function toLastmod(ts?: string | null): string | undefined {
  if (!ts) return undefined;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

// Static, always-present routes.
const STATIC_ROUTES: UrlEntry[] = [
  { loc: "/", changefreq: "daily", priority: 1.0, lastmod: BUILD_DATE },
  { loc: "/tools", changefreq: "daily", priority: 0.9, lastmod: BUILD_DATE },
  { loc: "/compare", changefreq: "weekly", priority: 0.6, lastmod: BUILD_DATE },
  { loc: "/answers", changefreq: "weekly", priority: 0.7, lastmod: BUILD_DATE },
  { loc: "/suggest", changefreq: "monthly", priority: 0.4, lastmod: BUILD_DATE },
];

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}

function renderSitemap(entries: UrlEntry[]): string {
  const urls = entries
    .map((e) => {
      const parts = [`    <loc>${xmlEscape(SITE_URL + e.loc)}</loc>`];
      if (e.lastmod) parts.push(`    <lastmod>${e.lastmod}</lastmod>`);
      if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
      if (e.priority != null) parts.push(`    <priority>${e.priority.toFixed(1)}</priority>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  const entries: UrlEntry[] = [...STATIC_ROUTES];

  if (!url || !key) {
    console.warn("[sitemap] Missing Supabase env — writing static routes only.");
  } else {
    const supabase = createClient<Database>(url, key);
    const [{ data: tools }, { data: categories }, compareSlugs, answerSlugs] = await Promise.all([
      supabase.from("tools").select("slug, updated_at").eq("status", "published"),
      supabase.from("categories").select("slug, created_at"),
      getPopularCompareSlugs(supabase),
      getPublishedAnswerSlugs(supabase),
    ]);

    for (const t of tools ?? []) {
      const lastmod = toLastmod(t.updated_at) ?? BUILD_DATE;
      entries.push({ loc: `/tools/${t.slug}`, changefreq: "weekly", priority: 0.8, lastmod });
      entries.push({ loc: `/tools/${t.slug}/docs`, changefreq: "weekly", priority: 0.6, lastmod });
      entries.push({
        loc: `/tools/${t.slug}/use-cases`,
        changefreq: "weekly",
        priority: 0.6,
        lastmod,
      });
    }
    for (const c of categories ?? []) {
      entries.push({
        loc: `/categories/${c.slug}`,
        changefreq: "weekly",
        priority: 0.7,
        lastmod: toLastmod(c.created_at) ?? BUILD_DATE,
      });
    }
    for (const c of compareSlugs) {
      entries.push({
        loc: `/compare/${c.slug}`,
        changefreq: "weekly",
        priority: 0.7,
        lastmod: c.lastmod ?? BUILD_DATE,
      });
    }
    for (const a of answerSlugs) {
      entries.push({
        loc: `/answers/${a.slug}`,
        changefreq: "weekly",
        priority: 0.7,
        lastmod: a.lastmod ?? BUILD_DATE,
      });
    }
    console.log(
      `[sitemap] ${tools?.length ?? 0} tools, ${categories?.length ?? 0} categories, ${compareSlugs.length} comparisons, ${answerSlugs.length} answers.`,
    );
  }

  const out = resolve("public/sitemap.xml");
  writeFileSync(out, renderSitemap(entries), "utf8");
  console.log(`[sitemap] Wrote ${entries.length} URLs → ${out}`);
}

main().catch((err) => {
  console.error("[sitemap] Failed:", err);
  process.exit(1);
});
