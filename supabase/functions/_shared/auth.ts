import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

function deny(status: 401 | 403, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * True when `token` carries service-role access. Asks Auth's admin API, which
 * only a valid service key can call — works for the legacy JWT and the newer
 * secret-key formats alike, so it doesn't depend on which one the runtime's
 * SUPABASE_SERVICE_ROLE_KEY happens to hold.
 */
async function isServiceRole(token: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) return false;
  const res = await fetch(`${url}/auth/v1/admin/users?per_page=1`, {
    headers: { apikey: token, Authorization: `Bearer ${token}` },
  });
  await res.body?.cancel();
  return res.ok;
}

/**
 * Gate for admin-only functions. Returns null when the caller may proceed,
 * otherwise the 401/403 response to send.
 *
 * Allowed: the service-role key (trusted scripts such as
 * scripts/reenrich-all-tools.ts), or a signed-in user whose profile has
 * is_admin. Everything else is refused — including the public anon key, which
 * passes the gateway's verify_jwt check but identifies no user.
 */
export async function requireAdmin(req: Request, supabaseAdmin: SupabaseClient): Promise<Response | null> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return deny(401, "Authorization required");

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && token === serviceKey) return null;

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) {
    if (await isServiceRole(token)) return null;
    return deny(401, "Sign in required");
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return deny(403, "Admin only");

  return null;
}
