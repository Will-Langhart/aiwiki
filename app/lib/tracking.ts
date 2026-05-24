/**
 * Fire-and-forget outbound click tracker.
 * Logs to outbound_clicks table for analytics + affiliate verification.
 * Never throws — silently swallows errors so it never blocks navigation.
 */
import { supabase } from "@/lib/supabase.client";

export async function trackOutboundClick(toolId: string): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    await supabase.from("outbound_clicks").insert({
      tool_id: toolId,
      user_id: session?.user?.id ?? null,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
    });
  } catch {
    // Intentionally swallowed — tracking must never block the user
  }
}
