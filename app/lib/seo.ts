import type { MetaDescriptor } from "react-router";

/**
 * Canonical production origin. Used to build absolute URLs for canonical tags,
 * OpenGraph, Twitter cards, sitemap, and JSON-LD. No trailing slash.
 */
export const SITE_URL = "https://aiwiki.io";
export const SITE_NAME = "AI Wiki";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/logo.png`;

/** Join a path onto SITE_URL, guaranteeing exactly one slash. */
export function absoluteUrl(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${p}`;
}

interface BaseMetaArgs {
  title: string;
  description: string;
  /** Path beginning with "/", e.g. "/tools/claude-code". */
  path: string;
  /** Absolute image URL. Defaults to the site logo. */
  image?: string;
  /** OpenGraph type. "website" | "article" | "profile" etc. */
  type?: string;
  /** When true, emit a noindex robots tag (thin / placeholder pages). */
  noindex?: boolean;
}

/**
 * Build the standard set of head tags for a page: title, description,
 * canonical, OpenGraph, and Twitter card. Each route's `meta()` spreads
 * this and may append JSON-LD descriptors.
 */
export function baseMeta({
  title,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
  type = "website",
  noindex = false,
}: BaseMetaArgs): MetaDescriptor[] {
  const url = absoluteUrl(path);
  const tags: MetaDescriptor[] = [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },

    // OpenGraph
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:type", content: type },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },

    // Twitter
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "google-site-verification", content: "bwhz9Ebr4n0qYXizVjGpSdCUKvqfk5minsQFjQ1p7kQ" },
  ];

  if (noindex) {
    tags.push({ name: "robots", content: "noindex, follow" });
  }

  return tags;
}

/** Wrap a JSON-LD object as a React Router meta descriptor. */
export function jsonLd(data: Record<string, unknown>): MetaDescriptor {
  return { "script:ld+json": data };
}

/**
 * Strip markdown to a plain-text excerpt suitable for a meta description.
 * Removes headings, links, emphasis, code fences, and collapses whitespace.
 */
export function plainExcerpt(md: string, max = 155): string {
  const text = md
    .replace(/```[\s\S]*?```/g, " ") // code fences
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → text
    .replace(/^#{1,6}\s+/gm, "") // heading markers
    .replace(/[*_>#-]/g, " ") // residual md punctuation
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

// ── JSON-LD builders ──────────────────────────────────────────────────────────

export function organizationLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: DEFAULT_OG_IMAGE,
    description:
      "Community-curated directory and reference for AI tools — structured data, honest comparisons, and ratings from real practitioners.",
  };
}

export function websiteLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** breadcrumb trail → BreadcrumbList JSON-LD. */
export function breadcrumbLd(
  items: Array<{ name: string; path: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

interface ToolLdInput {
  name: string;
  slug: string;
  tagline: string;
  description?: string;
  logo_url?: string | null;
  category?: string | null;
  pricing_tier?: string;
  has_free_tier?: boolean;
  pricing_starts_at?: number | null;
  pricing_currency?: string;
  operating_system?: string;
  avg_stars?: number | null;
  rating_count?: number;
}

/**
 * SoftwareApplication JSON-LD for a tool detail page. Includes offers and
 * aggregateRating when data is available so AI/search engines can surface
 * price and rating directly.
 */
export function softwareApplicationLd(tool: ToolLdInput): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: tool.name,
    url: absoluteUrl(`/tools/${tool.slug}`),
    description: tool.description || tool.tagline,
    applicationCategory: tool.category
      ? `${tool.category} (AI tool)`
      : "AI tool",
    operatingSystem: tool.operating_system ?? "Web",
  };

  if (tool.logo_url) data.image = tool.logo_url;

  // Offers — free tier or starting price.
  if (tool.has_free_tier || tool.pricing_tier === "free") {
    data.offers = {
      "@type": "Offer",
      price: "0",
      priceCurrency: tool.pricing_currency ?? "USD",
    };
  } else if (tool.pricing_starts_at) {
    data.offers = {
      "@type": "Offer",
      price: String(tool.pricing_starts_at),
      priceCurrency: tool.pricing_currency ?? "USD",
    };
  }

  // Aggregate rating — only when at least one rating exists.
  if (tool.avg_stars && tool.rating_count && tool.rating_count > 0) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(tool.avg_stars.toFixed(1)),
      ratingCount: tool.rating_count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return data;
}
