// Build-time only — never import from client components.
// Used by react-router.config.ts prerender (Phase 1+) and seed scripts.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createServiceClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.",
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });
}
