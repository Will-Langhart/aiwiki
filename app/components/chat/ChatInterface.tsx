import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, RotateCcw } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabase.client";
import { MarkdownRenderer } from "@/components/tool/MarkdownRenderer";
import { ToolCitationCard } from "@/components/chat/ToolCitationCard";
import { cn } from "@/lib/utils";

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
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const SUGGESTED_PROMPTS = [
  "What's the best AI coding assistant in 2025?",
  "Compare free AI image generators",
  "What AI tools help with writing?",
  "Which AI tools have a free tier?",
];

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-accent text-accent-fg px-4 py-2.5 text-sm">
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({ content, citations, streaming }: { content: string; citations?: CitedTool[]; streaming?: boolean }) {
  // Replace [tool:slug] with tool name for display — cards render below
  const displayContent = content.replace(/\[tool:([a-z0-9-]+)\]/g, (_, slug) => {
    const tool = citations?.find((t) => t.slug === slug);
    return tool ? `**${tool.name}**` : `\`${slug}\``;
  });

  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles size={14} className="text-accent" />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        <div className={cn("text-sm text-text leading-relaxed prose prose-sm dark:prose-invert max-w-none", !content && "text-text-muted")}>
          {content ? (
            <>
              <MarkdownRenderer content={displayContent} />
              {streaming && (
                <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse rounded-sm align-middle" />
              )}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              Thinking…
            </div>
          )}
        </div>

        {/* Citation cards */}
        {citations && citations.length > 0 && !streaming && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            {citations.map((tool) => (
              <ToolCitationCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatInterface() {
  const { user } = useCurrentUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when messages update
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || sending) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text.trim() };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: "", streaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session?.access_token ? `Bearer ${session.access_token}` : "";

      const res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({ session_id: sessionId, message: text.trim() }),
      });

      if (!res.ok || !res.body) {
        const err = await res.text();
        setMessages((prev) =>
          prev.map((m) => m.id === assistantMsg.id ? { ...m, content: `Error: ${err}`, streaming: false } : m)
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
              setSessionId(event.session_id);
            } else if (event.type === "content_block_delta" && event.delta?.text) {
              setMessages((prev) =>
                prev.map((m) => m.id === assistantMsg.id
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
                prev.map((m) => m.id === assistantMsg.id
                  ? { ...m, content: `Error: ${event.error}`, streaming: false }
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
        prev.map((m) => m.id === assistantMsg.id ? { ...m, content: `Error: ${msg}`, streaming: false } : m)
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
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-6">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
              <Sparkles size={24} className="text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text mb-2">Ask AI Wiki</h2>
              <p className="text-text-muted text-sm max-w-sm">
                Find the perfect AI tool for your use case. I'll search our directory and give you personalised recommendations.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="text-left px-3 py-2.5 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm text-text-muted hover:text-text transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) =>
            msg.role === "user" ? (
              <UserBubble key={msg.id} content={msg.content} />
            ) : (
              <AssistantBubble
                key={msg.id}
                content={msg.content}
                citations={msg.citations}
                streaming={msg.streaming}
              />
            )
          )
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-bg px-4 py-3">
        {!user && (
          <p className="text-xs text-text-muted text-center mb-2">
            Sign in to save your chat history. Anonymous sessions limited to 5 messages/day.
          </p>
        )}
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="p-2 rounded-lg text-text-subtle hover:text-text hover:bg-surface-2 transition-colors flex-shrink-0"
              aria-label="New conversation"
            >
              <RotateCcw size={16} />
            </button>
          )}
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about AI tools…"
              rows={1}
              disabled={sending}
              className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-text-subtle focus:outline-none focus:border-accent transition-colors pr-12 max-h-32"
              style={{ overflowY: "auto" }}
            />
            <button
              type="button"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || sending}
              className="absolute right-2 bottom-2 p-1.5 rounded-lg bg-accent text-accent-fg disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
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
