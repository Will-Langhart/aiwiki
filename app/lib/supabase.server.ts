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

/**
 * Build-time Supabase client for route `loader`s during prerendering.
 * Prefers the service role key but falls back to the anon key (public reads
 * are allowed by RLS), mirroring react-router.config.ts. This module is
 * `.server.ts`, so it is stripped from the client bundle — loaders run only
 * at build time in this `ssr: false` + prerender setup.
 */
export function createBuildClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env (SUPABASE_URL / key) for build-time loader.",
    );
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}
