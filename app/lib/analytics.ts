/**
 * First-party product analytics — the single typed entry point for custom
 * events (prelaunch-plan.md §Measurement).
 *
 * Rules baked in here:
 *  - Wraps Vercel Web Analytics `track()`; no second analytics vendor.
 *  - Properties are LOW-CARDINALITY only: enums, counts, booleans. Never send
 *    email, name, free-form search/chat text, or raw referrer URLs.
 *  - Every event name and its property shape is declared in `EventMap`, so
 *    call sites are type-checked and the vocabulary stays centralized.
 *  - Fire-and-forget: analytics must never throw into the UX.
 */
import { track } from "@vercel/analytics";

// ── Controlled vocabularies ─────────────────────────────────────────────────

/** Acquisition channel, resolved from the referrer host — never the full URL. */
export type Channel = "organic" | "direct" | "referral" | "social" | "unknown";

/** Where a chat conversation was initiated from. */
export type ChatSource =
  | "empty_state" // clicked a suggested prompt on the empty chat screen
  | "suggested_prompt"
  | "deep_link" // arrived via /chat?q=… with no more specific source
  | "home_hero" // the conversational hero box on the landing page
  | "home_teaser" // the "Ask AI Wiki" teaser section on the landing page
  | "composer" // typed into the input
  | "unknown";

/** Coerce an untrusted ?src= query value into a known ChatSource. */
const CHAT_SOURCES = new Set<ChatSource>([
  "empty_state", "suggested_prompt", "deep_link", "home_hero", "home_teaser", "composer", "unknown",
]);
export function parseChatSource(value: string | null | undefined): ChatSource {
  return value && CHAT_SOURCES.has(value as ChatSource) ? (value as ChatSource) : "deep_link";
}

// ── Channel resolution (privacy-preserving) ─────────────────────────────────

const SOCIAL_HOSTS = [
  "t.co", "x.com", "twitter.com", "facebook.com", "linkedin.com",
  "reddit.com", "news.ycombinator.com", "youtube.com", "instagram.com", "t.me",
];
const SEARCH_HOSTS = ["google.", "bing.", "duckduckgo.", "yahoo.", "ecosia.", "brave.", "search."];

/**
 * Map document.referrer to a coarse channel enum. Returns "direct" for no
 * referrer or same-origin navigation. Only the enum is ever sent onward.
 */
export function resolveChannel(): Channel {
  if (typeof document === "undefined") return "unknown";
  const ref = document.referrer;
  if (!ref) return "direct";
  let host: string;
  try {
    host = new URL(ref).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
  const self = typeof location !== "undefined" ? location.hostname.replace(/^www\./, "") : "";
  if (host === self) return "direct";
  if (SOCIAL_HOSTS.some((s) => host === s || host.endsWith(`.${s}`))) return "social";
  if (SEARCH_HOSTS.some((s) => host.includes(s))) return "organic";
  return "referral";
}

// ── Event contracts ─────────────────────────────────────────────────────────

type EventMap = {
  /** Landing (home) page became viewable. */
  landing_view: { channel: Channel; signed_in: boolean };
  /** First user message of a conversation. */
  chat_start: { channel: Channel; signed_in: boolean; source: ChatSource };
  /** Any user message send. `message_index` is 0-based within the session. */
  chat_message_sent: { signed_in: boolean; message_index: number };
  /** Assistant answer surfaced citation cards. */
  recommendation_shown: { signed_in: boolean; tool_count: number };
  /** User clicked through from a chat answer to a tool page (chat → tool). */
  citation_click: { signed_in: boolean; source: "card" | "inline" };
};

// Vercel's track() accepts these primitive property values.
type AllowedValue = string | number | boolean | null;

/**
 * Emit a typed product event. No-ops outside the browser and swallows any
 * error so instrumentation can never break the user flow. (Vercel's own
 * `track` already no-ops when the Analytics script isn't live, e.g. locally.)
 */
export function trackEvent<E extends keyof EventMap>(event: E, props: EventMap[E]): void {
  if (typeof window === "undefined") return;
  try {
    track(event, props as Record<string, AllowedValue>);
  } catch {
    // never surface analytics failures to the user
  }
}
