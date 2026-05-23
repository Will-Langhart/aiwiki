import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase.client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface PrefRow {
  notification_type: string;
  in_app: boolean;
  email: boolean;
}

const NOTIFICATION_TYPES: { type: string; label: string; description: string; emailToggleable: boolean }[] = [
  {
    type: "submission_approved",
    label: "Submission approved",
    description: "When your submitted tool is approved by a moderator.",
    emailToggleable: true,
  },
  {
    type: "submission_rejected",
    label: "Submission rejected",
    description: "When your submitted tool is not approved.",
    emailToggleable: true,
  },
  {
    type: "tool_published",
    label: "Tool published",
    description: "When your submitted tool goes live on the directory.",
    emailToggleable: true,
  },
  {
    type: "rating_received",
    label: "Ratings on your tools",
    description: "When someone rates a tool you submitted.",
    emailToggleable: false,
  },
  {
    type: "comment_replied",
    label: "Comment replies",
    description: "When someone replies to your comment.",
    emailToggleable: true,
  },
];

const DEFAULT_PREFS: PrefRow[] = NOTIFICATION_TYPES.map((t) => ({
  notification_type: t.type,
  in_app: true,
  email: t.emailToggleable,
}));

async function fetchPrefs(userId: string): Promise<PrefRow[]> {
  const { data } = await supabase
    .from("notification_preferences")
    .select("notification_type, in_app, email")
    .eq("user_id", userId);
  return (data as PrefRow[]) ?? [];
}

function PrefSkeleton() {
  const keys = ["pk0", "pk1", "pk2", "pk3", "pk4"];
  return (
    <div className="space-y-4">
      {keys.map((k) => (
        <Skeleton key={k} className="h-14 rounded-xl" />
      ))}
    </div>
  );
}

export default function PreferencesPage() {
  const { user } = useCurrentUser();
  const [prefs, setPrefs] = useState<Record<string, PrefRow>>({});

  const { data: dbPrefs, isLoading } = useQuery({
    queryKey: ["notif-prefs", user?.id],
    queryFn: () => fetchPrefs(user?.id ?? ""),
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  // Merge DB prefs with defaults
  useEffect(() => {
    const merged: Record<string, PrefRow> = {};
    for (const def of DEFAULT_PREFS) {
      merged[def.notification_type] = { ...def };
    }
    for (const row of dbPrefs ?? []) {
      merged[row.notification_type] = row;
    }
    setPrefs(merged);
  }, [dbPrefs]);

  const toggle = async (type: string, channel: "in_app" | "email", value: boolean) => {
    if (!user) return;
    const current = prefs[type];
    if (!current) return;

    const updated = { ...current, [channel]: value };
    setPrefs((p) => ({ ...p, [type]: updated }));

    const { error } = await supabase.from("notification_preferences").upsert(
      { user_id: user.id, notification_type: type, in_app: updated.in_app, email: updated.email },
      { onConflict: "user_id,notification_type" }
    );
    if (error) {
      // Revert
      setPrefs((p) => ({ ...p, [type]: current }));
      toast.error("Failed to save preferences.");
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-text">Notification preferences</h2>
        <p className="text-sm text-text-muted mt-0.5">Choose how you want to be notified.</p>
      </div>

      {isLoading ? (
        <PrefSkeleton />
      ) : (
        <div className="space-y-0 rounded-xl border border-border overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_64px_64px] gap-4 px-4 py-2 bg-surface-2 border-b border-border text-xs font-semibold text-text-muted uppercase tracking-wide">
            <span>Event</span>
            <span className="text-center">In-app</span>
            <span className="text-center">Email</span>
          </div>

          {NOTIFICATION_TYPES.map((nt) => {
            const pref = prefs[nt.type] ?? DEFAULT_PREFS.find((d) => d.notification_type === nt.type);
            return (
              <div
                key={nt.type}
                className="grid grid-cols-[1fr_64px_64px] gap-4 items-center px-4 py-3.5 border-b border-border/50 last:border-0 bg-surface hover:bg-surface-2 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-text">{nt.label}</p>
                  <p className="text-xs text-text-muted mt-0.5">{nt.description}</p>
                </div>
                <div className="flex justify-center">
                  <Switch
                    checked={pref?.in_app ?? true}
                    onCheckedChange={(v) => toggle(nt.type, "in_app", v)}
                    aria-label={`${nt.label} in-app`}
                  />
                </div>
                <div className="flex justify-center">
                  <Switch
                    checked={pref?.email ?? false}
                    onCheckedChange={(v) => toggle(nt.type, "email", v)}
                    disabled={!nt.emailToggleable}
                    aria-label={`${nt.label} email`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
