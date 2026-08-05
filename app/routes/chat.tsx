import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { PanelLeftOpen, LayoutGrid, GitCompare } from "lucide-react";
import type { Route } from "./+types/chat";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { parseChatSource } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Ask AI Wiki — AI tool recommendations" },
    { name: "description", content: "Get personalised AI tool recommendations from our RAG-powered assistant." },
  ];
}

// Minimal wayfinding header — /chat lives outside AppShell, so without this the
// page is a dead-end with no way back into the site except a citation card.
function ChatHeader() {
  return (
    <header className="flex items-center justify-between h-12 px-3 sm:px-4 border-b border-border bg-bg/80 backdrop-blur-md flex-shrink-0">
      <Link to="/" className="flex items-center gap-2 font-bold text-text group" aria-label="AI Wiki home">
        <img
          src="/logo.png"
          alt="AI Wiki"
          className="w-6 h-6 object-contain transition-opacity group-hover:opacity-80"
        />
        <span className="tracking-tight text-sm">AI Wiki</span>
      </Link>
      <nav className="flex items-center gap-1 text-sm">
        <Link
          to="/tools"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          <LayoutGrid size={14} /> <span className="hidden sm:inline">Browse</span>
        </Link>
        <Link
          to="/compare"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          <GitCompare size={14} /> <span className="hidden sm:inline">Compare</span>
        </Link>
      </nav>
    </header>
  );
}

export default function ChatPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();

  // A prompt deep-linked from the landing page teaser (/chat?q=…). Captured once
  // on first render so it auto-starts a single conversation, then is ignored.
  const [initialPrompt] = useState<string>(() => searchParams.get("q")?.trim() ?? "");
  // Attribution for a deep-linked prompt (e.g. home_hero, home_teaser).
  const [initialSource] = useState(() => parseChatSource(searchParams.get("src")));

  // Track which session is active (null = fresh/new chat)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // navigationKey only changes on explicit session navigation (sidebar select / new chat),
  // NOT when a new session is auto-created mid-stream. Using activeSessionId as the key
  // would remount ChatInterface when a session ID is first assigned, wiping streaming state.
  const [navigationKey, setNavigationKey] = useState<string>("new");

  const handleSessionChange = (id: string) => {
    // Session was auto-created — update the tracked ID but do NOT change navigationKey.
    // Changing navigationKey would remount ChatInterface and erase the in-progress stream.
    setActiveSessionId(id);
    qc.invalidateQueries({ queryKey: ["chat-sessions"] });
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setNavigationKey(`new-${Date.now()}`);
  };

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    setNavigationKey(id);
  };

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      {/* ── Wayfinding header ────────────────────────────────────────────── */}
      <ChatHeader />

      {/* ── Sidebar + chat area ──────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <ChatSidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
          activeSessionId={activeSessionId}
          onSelect={handleSelectSession}
          onNewChat={handleNewChat}
        />

        {/* ── Chat area ──────────────────────────────────────────────────── */}
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

          <ChatInterface
            key={navigationKey}
            sessionId={activeSessionId}
            onSessionChange={handleSessionChange}
            initialPrompt={navigationKey === "new" ? initialPrompt : undefined}
            initialSource={navigationKey === "new" ? initialSource : undefined}
          />
        </div>
      </div>
    </div>
  );
}
