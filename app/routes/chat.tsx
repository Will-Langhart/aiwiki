import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PanelLeftOpen } from "lucide-react";
import type { Route } from "./+types/chat";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { cn } from "@/lib/utils";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Ask AI Wiki — AI tool recommendations" },
    { name: "description", content: "Get personalised AI tool recommendations from our RAG-powered assistant." },
  ];
}

export default function ChatPage() {
  const qc = useQueryClient();

  // Track which session is active (null = fresh/new chat)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSessionChange = (id: string) => {
    setActiveSessionId(id);
    // Refresh the sidebar list so the new session appears immediately
    qc.invalidateQueries({ queryKey: ["chat-sessions"] });
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
  };

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
  };

  return (
    <div className="absolute inset-0 flex overflow-hidden">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <ChatSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        activeSessionId={activeSessionId}
        onSelect={handleSelectSession}
        onNewChat={handleNewChat}
      />

      {/* ── Chat area ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Sidebar toggle — shown when sidebar is closed */}
        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            title="Open chat history"
            aria-label="Open chat history"
            className={cn(
              "absolute top-3 left-3 z-10 p-1.5 rounded-lg",
              "text-text-subtle hover:text-text hover:bg-surface-2",
              "border border-border bg-surface shadow-[var(--shadow-card)]",
              "transition-colors",
            )}
          >
            <PanelLeftOpen size={15} />
          </button>
        )}

        {/*
          key={activeSessionId ?? "new"} forces a clean remount whenever the
          active session changes — avoids complex useEffect diffing inside
          ChatInterface to detect session switches.
        */}
        <ChatInterface
          key={activeSessionId ?? "new"}
          sessionId={activeSessionId}
          onSessionChange={handleSessionChange}
        />
      </div>
    </div>
  );
}
