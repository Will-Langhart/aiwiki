import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, RotateCcw, ArrowDown } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabase.client";
import { MarkdownRenderer } from "@/components/tool/MarkdownRenderer";
import { ToolCitationCard } from "@/components/chat/ToolCitationCard";
import { cn } from "@/lib/utils";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface CitedTool {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logo_url: string | null;
  pricing_tier: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: CitedTool[];
  streaming?: boolean;
  error?: boolean;
}

const SUGGESTED_PROMPTS = [
  "What's the best AI coding assistant?",
  "Compare free AI image generators",
  "Best AI tools for writing and editing",
  "Which AI tools have a generous free tier?",
];

// ── Sub-components ────────────────────────────────────────────────────────────

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[78%] rounded-2xl rounded-tr-sm bg-accent text-accent-fg px-4 py-2.5 text-sm leading-relaxed">
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  citations,
  streaming,
  error,
}: {
  content: string;
  citations?: CitedTool[];
  streaming?: boolean;
  error?: boolean;
}) {
  const displayContent = content.replace(/\[tool:([a-z0-9-]+)\]/g, (_, slug) => {
    const tool = citations?.find((t) => t.slug === slug);
    return tool ? `**${tool.name}**` : `\`${slug}\``;
  });

  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles size={13} className="text-accent" />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        {!content && streaming ? (
          <div className="flex items-center gap-2 text-sm text-text-muted py-1">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-text-subtle animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-text-subtle animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-text-subtle animate-bounce [animation-delay:300ms]" />
            </span>
          </div>
        ) : (
          <div
            className={cn(
              "text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none",
              error && "text-danger",
            )}
          >
            <MarkdownRenderer content={displayContent} />
            {streaming && (
              <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse rounded-sm align-middle" />
            )}
          </div>
        )}

        {citations && citations.length > 0 && !streaming && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {citations.map((tool) => (
              <ToolCitationCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Loading skeleton while fetching a historical session ──────────────────────

function HistorySkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 animate-pulse">
      <div className="flex justify-end">
        <div className="h-10 w-48 bg-accent/20 rounded-2xl rounded-tr-sm" />
      </div>
      <div className="flex gap-3 items-start">
        <div className="w-7 h-7 rounded-full bg-surface-2 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-surface-2 rounded w-full" />
          <div className="h-4 bg-surface-2 rounded w-4/5" />
          <div className="h-4 bg-surface-2 rounded w-2/3" />
        </div>
      </div>
      <div className="flex justify-end">
        <div className="h-10 w-64 bg-accent/20 rounded-2xl rounded-tr-sm" />
      </div>
      <div className="flex gap-3 items-start">
        <div className="w-7 h-7 rounded-full bg-surface-2 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-surface-2 rounded w-full" />
          <div className="h-4 bg-surface-2 rounded w-3/5" />
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ChatInterfaceProps {
  /** Session to load on mount. Null = fresh conversation. */
  sessionId: string | null;
  /** Called when a new session is created via the first message send. */
  onSessionChange?: (id: string) => void;
}

export function ChatInterface({ sessionId: initialSessionId, onSessionChange }: ChatInterfaceProps) {
  const { user } = useCurrentUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [sending, setSending] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Load historical session on mount ───────────────────────────────────────
  useEffect(() => {
    if (!initialSessionId) return;

    let cancelled = false;
    setLoadingHistory(true);

    (async () => {
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("id, role, content, tool_citations, created_at")
        .eq("session_id", initialSessionId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      // Collect all tool IDs cited across messages
      const allToolIds = new Set<string>();
      for (const m of msgs ?? []) {
        for (const tid of (m.tool_citations ?? []) as string[]) {
          allToolIds.add(tid);
        }
      }

      // Batch-fetch tool details
      const toolMap = new Map<string, CitedTool>();
      if (allToolIds.size > 0) {
        const { data: tools } = await supabase
          .from("tools")
          .select("id, slug, name, tagline, logo_url, pricing_tier")
          .in("id", [...allToolIds]);
        for (const t of (tools ?? []) as CitedTool[]) {
          toolMap.set(t.id, t);
        }
      }

      const loaded: Message[] = (msgs ?? []).map((m) => ({
        id: m.id as string,
        role: m.role as "user" | "assistant",
        content: m.content as string,
        citations: ((m.tool_citations ?? []) as string[])
          .map((tid) => toolMap.get(tid))
          .filter((t): t is CitedTool => !!t),
      }));

      if (!cancelled) {
        setMessages(loaded);
        setLoadingHistory(false);
        setSessionId(initialSessionId);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "instant" }), 0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialSessionId]);

  // ── Auto-resize textarea ────────────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: resize on input change
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  // ── Auto-scroll to bottom on new messages ──────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Show scroll-to-bottom button ────────────────────────────────────────────
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const onScroll = () => {
      setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = async (text: string) => {
    if (!text.trim() || sending) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text.trim() };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: "", streaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session?.access_token
        ? `Bearer ${session.access_token}`
        : `Bearer ${ANON_KEY}`;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ session_id: sessionId, message: text.trim() }),
      });

      if (!res.ok || !res.body) {
        const errJson = await res.text();
        let errMsg = `HTTP ${res.status}`;
        try { errMsg = JSON.parse(errJson).message ?? errMsg; } catch { /* use status */ }
        setMessages((prev) =>
          prev.map((m) => m.id === assistantMsg.id ? { ...m, content: errMsg, streaming: false, error: true } : m)
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;

          try {
            const event = JSON.parse(payload) as {
              type?: string;
              delta?: { text?: string };
              session_id?: string;
              tools?: CitedTool[];
              error?: string;
            };

            if (event.type === "session" && event.session_id) {
              const newId = event.session_id;
              setSessionId(newId);
              onSessionChange?.(newId);
            } else if (event.type === "content_block_delta" && event.delta?.text) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: m.content + (event.delta?.text ?? "") }
                    : m
                )
              );
            } else if (event.type === "citations" && event.tools) {
              setMessages((prev) =>
                prev.map((m) => m.id === assistantMsg.id ? { ...m, citations: event.tools } : m)
              );
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: event.error ?? "Unknown error", streaming: false, error: true }
                    : m
                )
              );
            }
          } catch {
            // Ignore malformed lines
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) => m.id === assistantMsg.id ? { ...m, streaming: false } : m)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, content: msg, streaming: false, error: true } : m
        )
      );
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const reset = () => {
    setMessages([]);
    setSessionId(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full relative">
      {/* Conversation area */}
      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto">
        {loadingHistory ? (
          <HistorySkeleton />
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-5 px-4 py-12">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
              <Sparkles size={22} className="text-accent" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold text-text">Ask AI Wiki</h2>
              <p className="text-text-muted text-sm max-w-xs">
                Find the right AI tool for your use case. I'll search our directory and give you honest recommendations.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md mt-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="text-left px-3.5 py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-2 hover:border-accent/30 text-sm text-text-muted hover:text-text transition-all"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg) =>
              msg.role === "user" ? (
                <UserBubble key={msg.id} content={msg.content} />
              ) : (
                <AssistantBubble
                  key={msg.id}
                  content={msg.content}
                  citations={msg.citations}
                  streaming={msg.streaming}
                  error={msg.error}
                />
              )
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-24 right-6 p-2 rounded-full bg-surface border border-border shadow-md text-text-muted hover:text-text transition-colors"
          aria-label="Scroll to bottom"
        >
          <ArrowDown size={16} />
        </button>
      )}

      {/* Input area */}
      <div className="px-4 pb-5 pt-2">
        {!user && (
          <p className="text-xs text-text-subtle text-center mb-2">
            Sign in to save history · Anonymous sessions limited to 5 messages/day
          </p>
        )}
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface shadow-[var(--shadow-card-hover)] px-3 py-2 focus-within:border-accent/50 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_12%,transparent)] transition-all">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={reset}
                title="New conversation"
                className="p-1.5 rounded-lg text-text-subtle hover:text-text hover:bg-surface-2 transition-colors flex-shrink-0 mb-0.5"
                aria-label="New conversation"
              >
                <RotateCcw size={15} />
              </button>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about AI tools… (Shift+Enter for new line)"
              rows={1}
              disabled={sending || loadingHistory}
              className="flex-1 resize-none bg-transparent py-1.5 text-sm text-text placeholder:text-text-subtle focus:outline-none overflow-y-auto min-w-0"
            />
            <button
              type="button"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || sending || loadingHistory}
              className="p-1.5 rounded-lg bg-accent text-accent-fg disabled:opacity-25 disabled:cursor-not-allowed hover:opacity-90 transition-all flex-shrink-0 mb-0.5"
              aria-label="Send message"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
