import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "AI Wiki <noreply@aiwiki.dev>";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://aiwiki.dev";

// Simple HTML email templates per notification type
function renderEmail(type: string, payload: Record<string, string>, recipientName: string): { subject: string; html: string } {
  const base = (subject: string, body: string) => ({
    subject,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:system-ui,sans-serif;color:#fafafa">
  <div style="max-width:560px;margin:40px auto;padding:32px;background:#18181b;border-radius:12px;border:1px solid #27272a">
    <div style="margin-bottom:24px">
      <span style="font-size:18px;font-weight:700;color:#fafafa">✦ AI Wiki</span>
    </div>
    <p style="margin:0 0 8px;font-size:15px;color:#a1a1aa">Hi ${recipientName},</p>
    ${body}
    <hr style="border:none;border-top:1px solid #27272a;margin:24px 0">
    <p style="margin:0;font-size:12px;color:#71717a">
      You're receiving this because you have an account on <a href="${SITE_URL}" style="color:#60a5fa">AI Wiki</a>.
      Manage your <a href="${SITE_URL}/account/preferences" style="color:#60a5fa">notification preferences</a>.
    </p>
  </div>
</body>
</html>`,
  });

  switch (type) {
    case "submission_approved":
      return base(
        `🎉 Your tool "${payload.toolName ?? "submission"}" was approved!`,
        `<p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#fafafa">Your tool was approved!</p>
         <p style="margin:0 0 16px;font-size:14px;color:#a1a1aa">${payload.body ?? "Your submission has been approved and is now live on the directory."}</p>
         ${payload.link ? `<a href="${SITE_URL}${payload.link}" style="display:inline-block;padding:10px 20px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">View your tool →</a>` : ""}`,
      );
    case "submission_rejected":
      return base(
        "Re: your AI Wiki submission",
        `<p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#fafafa">Submission update</p>
         <p style="margin:0 0 16px;font-size:14px;color:#a1a1aa">${payload.body ?? "Unfortunately your submission wasn't approved at this time."}</p>
         <a href="${SITE_URL}/account/drafts" style="display:inline-block;padding:10px 20px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">View your submissions →</a>`,
      );
    case "tool_published":
      return base(
        `🚀 "${payload.toolName ?? "Your tool"}" is live on AI Wiki!`,
        `<p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#fafafa">Your tool is live!</p>
         <p style="margin:0 0 16px;font-size:14px;color:#a1a1aa">${payload.body ?? "Your tool has been published to the AI Wiki directory."}</p>
         ${payload.link ? `<a href="${SITE_URL}${payload.link}" style="display:inline-block;padding:10px 20px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">View the page →</a>` : ""}`,
      );
    case "submission_received":
      return base(
        "New tool submission received",
        `<p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#fafafa">New submission in the queue</p>
         <p style="margin:0 0 16px;font-size:14px;color:#a1a1aa">${payload.body ?? "A new tool has been submitted for review."}</p>
         <a href="${SITE_URL}/admin/submissions" style="display:inline-block;padding:10px 20px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">Review queue →</a>`,
      );
    default:
      return base(
        payload.title ?? "AI Wiki notification",
        `<p style="margin:0;font-size:14px;color:#a1a1aa">${payload.body ?? ""}</p>`,
      );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { notification_id } = await req.json();
    if (!notification_id) {
      return new Response(JSON.stringify({ error: "notification_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch notification with user profile
    const { data: notif, error: notifError } = await supabase
      .from("notifications")
      .select("id, type, payload, user_id, created_at")
      .eq("id", notification_id)
      .single();

    if (notifError || !notif) {
      return new Response(JSON.stringify({ error: "Notification not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check notification preferences
    const { data: pref } = await supabase
      .from("notification_preferences")
      .select("email")
      .eq("user_id", notif.user_id)
      .eq("notification_type", notif.type)
      .maybeSingle();

    // If preference exists and email is false, skip
    if (pref && pref.email === false) {
      return new Response(JSON.stringify({ skipped: "email disabled for this type" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user email + profile
    const { data: userData } = await supabase.auth.admin.getUserById(notif.user_id);
    const email = userData?.user?.email;
    if (!email) {
      return new Response(JSON.stringify({ error: "No email for user" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", notif.user_id)
      .single();
    const recipientName = profile?.display_name ?? profile?.username ?? "there";

    // Dedup: same user+type in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentLog } = await supabase
      .from("notification_email_log")
      .select("id")
      .eq("user_id", notif.user_id)
      .eq("type", notif.type)
      .gte("sent_at", fiveMinutesAgo)
      .limit(1)
      .maybeSingle();

    if (recentLog) {
      return new Response(JSON.stringify({ skipped: "dedup window" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (notif.payload ?? {}) as Record<string, string>;
    const { subject, html } = renderEmail(notif.type, payload, recipientName);

    // Send via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: email, subject, html }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      throw new Error(`Resend error: ${errText}`);
    }

    // Log success
    await supabase.from("notification_email_log").insert({
      notification_id: notif.id,
      user_id: notif.user_id,
      type: notif.type,
      payload_hash: btoa(JSON.stringify(payload)).slice(0, 64),
    });

    return new Response(JSON.stringify({ sent: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
