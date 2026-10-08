import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

function deny(status: 401 | 403, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
  if (!user) return deny(401, "Sign in required");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return deny(403, "Admin only");

  return null;
}
