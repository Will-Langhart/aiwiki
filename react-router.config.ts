import type { Config } from "@react-router/dev/config";

// Phase 0: no prerendering yet — add in Phase 1 once the DB is seeded.
// Full prerender config (tools × 3 routes + categories + popular compares)
// lives in SPEC.md §5 and will be wired in Phase 1.
export default {
  ssr: false,
} satisfies Config;
