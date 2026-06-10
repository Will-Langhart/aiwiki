import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, isToday, isYesterday, subDays, isAfter } from "date-fns";
import { PenSquare, MessageSquare, Clock, LogIn, ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabase.client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthModalStore } from "@/stores/auth-modal";
import { cn } from "@/lib/utils";

interface ChatSession {
  id: string;
  created_at: string;
  updated_at: string;
  title: string | null;
  firstMessage: string | null;
}

async function fetchSessions(userId: string): Promise<ChatSession[]> {
  const { data: sessData } = await supabase
    .from("chat_sessions")
    .select("id, created_at, updated_at, title")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(60);

  const sessions = (sessData ?? []) as Array<{
    id: string;
    created_at: string;
    updated_at: string;
    title: string | null;
  }>;

  if (sessions.length === 0) return [];

  // Fetch first user message per session in a single query
  const { data: msgs } = await supabase
    .from("chat_messages")
    .select("session_id, content, created_at")
    .in("session_id", sessions.map((s) => s.id))
    .eq("role", "user")
    .order("created_at", { ascending: true });

  // Build map: session_id → first user message content
  const firstMsgMap = new Map<string, string>();
  for (const m of (msgs ?? []) as Array<{ session_id: string; content: string }>) {
    if (!firstMsgMap.has(m.session_id)) {
      firstMsgMap.set(m.session_id, m.content);
    }
  }

  return sessions.map((s) => ({
    ...s,
    firstMessage: firstMsgMap.get(s.id) ?? null,
  }));
}

function sessionLabel(s: ChatSession): string {
  if (s.title) return s.title;
  if (s.firstMessage) {
    return s.firstMessage.length > 48
      ? `${s.firstMessage.slice(0, 48)}…`
      : s.firstMessage;
  }
  return "New conversation";
}

type Group = { label: string; sessions: ChatSession[] };

function groupSessions(sessions: ChatSession[]): Group[] {
  const now = new Date();
  const groups: Group[] = [
    { label: "Today", sessions: [] },
    { label: "Yesterday", sessions: [] },
    { label: "Previous 7 days", sessions: [] },
    { label: "Older", sessions: [] },
  ];

  for (const s of sessions) {
    const d = new Date(s.updated_at);
    if (isToday(d)) {
      groups[0].sessions.push(s);
    } else if (isYesterday(d)) {
      groups[1].sessions.push(s);
    } else if (isAfter(d, subDays(now, 7))) {
      groups[2].sessions.push(s);
    } else {
      groups[3].sessions.push(s);
    }
  }

  return groups.filter((g) => g.sessions.length > 0);
}

interface ChatSidebarProps {
  open: boolean;
  onToggle: () => void;
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}

export function ChatSidebar({
  open,
  onToggle,
  activeSessionId,
  onSelect,
  onNewChat,
}: ChatSidebarProps) {
  const { user } = useCurrentUser();
  const openAuth = useAuthModalStore((s) => s.openModal);
  const qc = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["chat-sessions", user?.id],
    queryFn: () => fetchSessions(user?.id ?? ""),
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  const grouped = groupSessions(sessions);

  return (
    <>
      {/* Sidebar panel */}
      <aside
        className={cn(
          "flex flex-col bg-surface border-r border-border transition-all duration-200 ease-in-out overflow-hidden flex-shrink-0",
          open ? "w-64" : "w-0",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-border/60 flex-shrink-0">
          <span className="text-xs font-semibold text-text-subtle uppercase tracking-widest">
            Chats
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                onNewChat();
                qc.invalidateQueries({ queryKey: ["chat-sessions"] });
              }}
              title="New chat"
              className="p-1.5 rounded-lg text-text-subtle hover:text-text hover:bg-surface-2 transition-colors"
              aria-label="New conversation"
            >
              <PenSquare size={14} />
            </button>
            <button
              type="button"
              onClick={onToggle}
              title="Collapse sidebar"
              className="p-1.5 rounded-lg text-text-subtle hover:text-text hover:bg-surface-2 transition-colors"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft size={14} />
            </button>
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto py-2 min-w-0">
          {!user ? (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center gap-3 py-8">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <MessageSquare size={16} className="text-accent" />
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                Sign in to save your chat history across sessions.
              </p>
              <button
                type="button"
                onClick={() => openAuth()}
                className="flex items-center gap-1.5 text-xs text-accent hover:underline font-medium"
              >
                <LogIn size={12} />
                Sign in
              </button>
            </div>
          ) : isLoading ? (
            <div className="px-3 space-y-1.5 pt-1">
              {([0, 1, 2, 3, 4] as const).map((i) => (
                <div
                  key={i}
                  className="h-8 rounded-lg bg-surface-2 animate-pulse"
                  style={{ opacity: 1 - i * 0.15 }}
                />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center gap-3 py-8">
              <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center">
                <Clock size={16} className="text-text-subtle" />
              </div>
              <p className="text-xs text-text-muted">No conversations yet.</p>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.label} className="mb-1">
                <p className="px-3 py-1.5 text-[10px] font-semibold text-text-subtle uppercase tracking-widest">
                  {group.label}
                </p>
                {group.sessions.map((s) => {
                  const active = s.id === activeSessionId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelect(s.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 mx-0 rounded-lg transition-colors flex flex-col gap-0.5 min-w-0",
                        active
                          ? "bg-accent/10 text-accent"
                          : "text-text-muted hover:text-text hover:bg-surface-2",
                      )}
                    >
                      <span
                        className={cn(
                          "text-xs leading-snug line-clamp-2 break-words",
                          active ? "text-accent font-medium" : "text-text",
                        )}
                      >
                        {sessionLabel(s)}
                      </span>
                      <span className="text-[10px] text-text-subtle">
                        {formatDistanceToNow(new Date(s.updated_at), { addSuffix: true })}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
