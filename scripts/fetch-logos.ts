/**
 * Sets all tool logos to high-quality favicons via Google's favicon API.
 * Validates each one isn't blank (Google returns a tiny ~170 byte image for missing favicons).
 * Falls back to icon.horse for any that fail.
 *
 * Usage: npx tsx scripts/fetch-logos.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

const BLANK_FAVICON_MAX_BYTES = 400; // Google's "no favicon" image is ~170 bytes

function domainFrom(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function googleFaviconUrl(domain: string, size = 128): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}

async function validateFavicon(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    return buf.byteLength > BLANK_FAVICON_MAX_BYTES;
  } catch {
    return false;
  }
}

async function main() {
  const { data: tools, error } = await supabase
    .from("tools")
    .select("id, name, website_url, logo_url")
    .eq("status", "published")
    .order("name");

  if (error || !tools) {
    console.error("Failed to fetch tools:", error?.message);
    process.exit(1);
  }

  console.log(`\n🖼  Setting favicons for ${tools.length} tools...\n`);

  let upgraded = 0;
  let fallback = 0;
  let failed = 0;

  for (const tool of tools) {
    const domain = domainFrom(tool.website_url ?? "");
    if (!domain) { failed++; continue; }

    process.stdout.write(`  ${tool.name} (${domain})… `);

    const googleUrl = googleFaviconUrl(domain);
    const isValid = await validateFavicon(googleUrl);
    const newLogo = isValid ? googleUrl : `https://icon.horse/icon/${domain}`;

    const { error: updateErr } = await supabase
      .from("tools")
      .update({ logo_url: newLogo })
      .eq("id", tool.id);

    if (updateErr) {
      console.log(`✗ ${updateErr.message}`);
      failed++;
    } else if (isValid) {
      console.log(`✓ google`);
      upgraded++;
    } else {
      console.log(`→ icon.horse`);
      fallback++;
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\n✅ Done — ${upgraded} google favicon, ${fallback} icon.horse fallback, ${failed} failed\n`);
}

main();
