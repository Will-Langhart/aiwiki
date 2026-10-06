import { useState } from "react";
import { Bell, BellRing, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase.client";

interface WatchToolCardProps {
  toolId: string;
  toolName: string;
  userId: string | undefined;
  /** Watching a tool is a bookmark — the enrichment pipeline notifies bookmarkers. */
  isWatching: boolean;
  queryKey: unknown[];
  onAuthRequired: () => void;
}

/**
 * "Get alerts when X changes" — the sign-up hook on tool pages. Logged-out
 * visitors get the auth modal (and land back here with ?watch=1, which the
 * tool layout turns into a watch); logged-in users toggle a bookmark, which is
 * what `notify_watchers` in the enrichment pipeline alerts on.
 */
export function WatchToolCard({
  toolId,
  toolName,
  userId,
  isWatching,
  queryKey,
  onAuthRequired,
}: WatchToolCardProps) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();
  const active = optimistic ?? isWatching;

  async function toggle() {
    if (!userId) {
      onAuthRequired();
      return;
    }
    if (pending) return;
    setPending(true);
    setOptimistic(!active);
    try {
      const { error } = active
        ? await supabase.from("bookmarks").delete().eq("tool_id", toolId).eq("user_id", userId)
        : await supabase.from("bookmarks").insert({ tool_id: toolId, user_id: userId });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey });
    } catch {
      setOptimistic(active);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border p-4 sm:p-5 transition-colors ${
        active ? "border-accent/30 bg-accent/5" : "border-border bg-surface"
      }`}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 border border-accent/20">
          {active ? (
            <BellRing size={17} className="text-accent" />
          ) : (
            <Bell size={17} className="text-accent" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">
            {active ? `You're watching ${toolName}` : `Get alerts when ${toolName} changes`}
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            {active
              ? "We'll email you when its pricing, free tier, API or open-source status changes."
              : "Free. We'll email you when pricing, the free tier, API access or open-source status changes."}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={active}
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors flex-shrink-0 ${
          active
            ? "border border-border text-text-muted hover:text-text hover:border-text-subtle"
            : "bg-accent text-accent-fg hover:opacity-90"
        }`}
      >
        {active ? (
          <>
            <Check size={15} /> Watching
          </>
        ) : (
          <>
            <Bell size={15} /> Watch {toolName}
          </>
        )}
      </button>
    </div>
  );
}
