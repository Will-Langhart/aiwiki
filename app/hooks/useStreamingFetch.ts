import { useCallback, useRef, useState } from "react";
import { supabase } from "@/lib/supabase.client";

interface StreamOptions {
  url: string;
  body: Record<string, unknown>;
}

interface StreamState {
  text: string;
  done: boolean;
  error: string | null;
  streaming: boolean;
}

/**
 * Hook for consuming Anthropic-style SSE streams from Supabase Edge Functions.
 * Parses `data: {...}` lines; extracts `delta.text` from content_block_delta events.
 */
export function useStreamingFetch() {
  const [state, setState] = useState<StreamState>({ text: "", done: false, error: null, streaming: false });
  const abortRef = useRef<AbortController | null>(null);

  const stream = useCallback(async ({ url, body }: StreamOptions) => {
    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ text: "", done: false, error: null, streaming: true });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session?.access_token ? `Bearer ${session.access_token}` : "";

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text();
        setState((s) => ({ ...s, error: errText || `HTTP ${res.status}`, streaming: false }));
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
              delta?: { type?: string; text?: string };
              text?: string; // simple text delta from our compare-summary function
            };

            if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
              setState((s) => ({ ...s, text: s.text + (event.delta?.text ?? "") }));
            } else if (event.text) {
              // Simple text events from compare-summary
              setState((s) => ({ ...s, text: s.text + event.text }));
            }
          } catch {
            // Ignore malformed JSON lines
          }
        }
      }

      setState((s) => ({ ...s, done: true, streaming: false }));
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Streaming error";
      setState((s) => ({ ...s, error: msg, streaming: false }));
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ text: "", done: false, error: null, streaming: false });
  }, []);

  return { ...state, stream, reset };
}
