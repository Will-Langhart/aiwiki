import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { formatDistanceToNow } from "date-fns";
import { Bell } from "lucide-react";
import { supabase } from "@/lib/supabase.client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface NotificationRow {
  id: string;
  type: string;
  payload: { title?: string; body?: string; link?: string };
  read_at: string | null;
  created_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  submission_approved: "✅",
  submission_rejected: "❌",
  submission_received: "📬",
  tool_published: "🚀",
  rating_received: "⭐",
  comment_replied: "💬",
};

async function fetchNotifications(userId: string): Promise<NotificationRow[]> {
  const { data } = await supabase
    .from("notifications")
    .select("id, type, payload, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data as NotificationRow[]) ?? [];
}

function NotifSkeleton() {
  const keys = ["nk0", "nk1", "nk2", "nk3", "nk4"];
  return (
    <div className="space-y-2">
      {keys.map((k) => (
        <Skeleton key={k} className="h-16 rounded-xl" />
      ))}
    </div>
  );
}

export default function NotificationsPage() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [markingAll, setMarkingAll] = useState(false);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: () => fetchNotifications(user?.id ?? ""),
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    if (!user) return;
    setMarkingAll(true);
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    await queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
    setMarkingAll(false);
  };

  const markRead = async (notif: NotificationRow) => {
    if (notif.read_at) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notif.id);
    await queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
    if (notif.payload.link) navigate(notif.payload.link);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-text">Notifications</h2>
          <p className="text-sm text-text-muted mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={markAllRead}
            disabled={markingAll}
          >
            {markingAll ? "Marking…" : "Mark all read"}
          </Button>
        )}
      </div>

      {isLoading ? (
        <NotifSkeleton />
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
            <Bell size={24} className="text-text-subtle" />
          </div>
          <p className="text-text font-medium mb-1">No notifications yet</p>
          <p className="text-text-muted text-sm">
            You'll be notified when your submissions are reviewed.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {notifications.map((n) => (
            <button
              type="button"
              key={n.id}
              onClick={() => markRead(n)}
              className={cn(
                "w-full text-left p-3.5 rounded-xl border border-border hover:bg-surface-2 transition-colors flex items-start gap-3",
                !n.read_at ? "bg-accent/5 border-accent/20" : "bg-surface"
              )}
            >
              <span className="text-xl mt-0.5 flex-shrink-0" aria-hidden="true">
                {TYPE_ICONS[n.type] ?? "🔔"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={cn("text-sm", !n.read_at ? "text-text font-medium" : "text-text-muted")}>
                    {n.payload.title ?? n.type.replace(/_/g, " ")}
                  </p>
                  {!n.read_at && (
                    <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0 mt-1.5" />
                  )}
                </div>
                {n.payload.body && (
                  <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{n.payload.body}</p>
                )}
                <p className="text-xs text-text-subtle mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
