// Minimal OTLP/JSON tracer for langeval. No dependencies on purpose: Edge
// Functions cold-start on every import, and the OTel JS SDK is a lot of
// machinery for "collect a handful of spans, POST them once at the end".
//
// Contract:
// - A no-op unless both an endpoint and an API key are configured, so local
//   dev and preview branches don't need langeval running.
// - Never throws and never blocks the response. Tracing that can break chat
//   is worse than no tracing.
// - One Trace per request. Spans are buffered in memory and sent in a single
//   batch by flush(), which hands itself to EdgeRuntime.waitUntil so the
//   isolate stays alive long enough to deliver it.
//
// Attribute names are the ones langeval's normalizer reads: OpenInference
// span kinds, gen_ai.* semconv, input.value/output.value, and
// langeval.thread_id / langeval.user_id for grouping.

type AttrValue = string | number | boolean | null | undefined;
type Attrs = Record<string, AttrValue>;

export type LangevalConfig = {
  /** Base URL; `/v1/traces` is appended. Empty disables tracing. */
  endpoint?: string;
  /** Project API key with the `ingest` scope. Empty disables tracing. */
  apiKey?: string;
  serviceName: string;
  environment?: string;
  /** false = record shape, tokens and timings but no prompt/response text. */
  captureContent?: boolean;
};

/** Read config from the standard env vars. */
export function langevalConfigFromEnv(serviceName: string): LangevalConfig {
  return {
    endpoint: Deno.env.get("LANGEVAL_OTLP_ENDPOINT") ?? "",
    apiKey: Deno.env.get("LANGEVAL_API_KEY") ?? "",
    serviceName,
    environment: Deno.env.get("LANGEVAL_ENVIRONMENT") ?? undefined,
    captureContent: Deno.env.get("LANGEVAL_CAPTURE_CONTENT") !== "false",
  };
}

// A trace is for reading, and one oversized tool result shouldn't blow the
// ingest body limit.
const CLIP = 8000;
const FLUSH_TIMEOUT_MS = 3000;

function clip(text: string): string {
  return text.length <= CLIP ? text : `${text.slice(0, CLIP)}…`;
}

function hex(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function nanos(ms: number): string {
  // OTLP timestamps overflow a JSON number, so they travel as strings.
  return (BigInt(Math.round(ms * 1000)) * 1000n).toString();
}

function otlpValue(value: AttrValue) {
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: String(value) };
}

function otlpAttrs(attrs: Attrs) {
  return Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([key, value]) => ({ key, value: otlpValue(value) }));
}

/** Stringify anything for input.value/output.value. */
export function asText(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export class Span {
  readonly spanId = hex(8);
  private readonly started = performance.timeOrigin + performance.now();
  private ended: number | null = null;
  private error: string | null = null;
  readonly attrs: Attrs;

  constructor(
    readonly name: string,
    attrs: Attrs,
    readonly parentId: string | undefined,
    private readonly capture: boolean,
  ) {
    this.attrs = { ...attrs };
  }

  set(attrs: Attrs): this {
    Object.assign(this.attrs, attrs);
    return this;
  }

  /** input.value / output.value — dropped when content capture is off. */
  content(key: "input" | "output", value: unknown): this {
    if (this.capture && value !== undefined) this.attrs[`${key}.value`] = clip(asText(value));
    return this;
  }

  fail(err: unknown): this {
    this.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return this;
  }

  end(): void {
    if (this.ended === null) this.ended = performance.timeOrigin + performance.now();
  }

  toOtlp(traceId: string) {
    const span: Record<string, unknown> = {
      traceId,
      spanId: this.spanId,
      name: this.name,
      // Kind 1 = INTERNAL. Everything here is in-process work.
      kind: 1,
      startTimeUnixNano: nanos(this.started),
      endTimeUnixNano: nanos(this.ended ?? performance.timeOrigin + performance.now()),
      attributes: otlpAttrs(this.attrs),
    };
    if (this.parentId) span.parentSpanId = this.parentId;
    // 2 = ERROR, so a failed turn stands out in the trace list.
    if (this.error) span.status = { code: 2, message: clip(this.error) };
    return span;
  }
}

export class Trace {
  readonly traceId = hex(16);
  readonly enabled: boolean;
  private readonly spans: Span[] = [];
  private flushed = false;

  constructor(private readonly config: LangevalConfig) {
    this.enabled = Boolean(config.endpoint && config.apiKey);
  }

  /** Open a span. Returns a live span even when disabled, so callers never branch. */
  start(name: string, attrs: Attrs = {}, parent?: Span): Span {
    const span = new Span(name, attrs, parent?.spanId, this.config.captureContent !== false);
    if (this.enabled) this.spans.push(span);
    return span;
  }

  /**
   * Run fn inside a span: a throw marks the span failed and is rethrown, and
   * the span always ends. For code that returns errors instead of throwing,
   * call span.fail() inside fn.
   */
  async run<T>(
    name: string,
    attrs: Attrs,
    parent: Span | undefined,
    fn: (span: Span) => Promise<T>,
  ): Promise<T> {
    const span = this.start(name, attrs, parent);
    try {
      return await fn(span);
    } catch (err) {
      span.fail(err);
      throw err;
    } finally {
      span.end();
    }
  }

  /** Send the batch in the background. Safe to call more than once; only the first sends. */
  flush(): void {
    if (!this.enabled || this.flushed || this.spans.length === 0) return;
    this.flushed = true;
    const sending = this.send();
    // Supabase keeps the isolate alive for promises handed to waitUntil. Outside
    // the edge runtime (tests, plain Deno) there's nothing to hand it to, and the
    // promise simply runs.
    const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
      .EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(sending);
  }

  /** The same send, awaitable — for scripts and tests. */
  async flushNow(): Promise<boolean> {
    if (!this.enabled || this.flushed || this.spans.length === 0) return false;
    this.flushed = true;
    return await this.send();
  }

  private async send(): Promise<boolean> {
    try {
      for (const span of this.spans) span.end();
      const resource = otlpAttrs({
        "service.name": this.config.serviceName,
        "deployment.environment.name": this.config.environment,
      });
      const body = {
        resourceSpans: [
          {
            resource: { attributes: resource },
            scopeSpans: [
              {
                scope: { name: "aiwiki.langeval" },
                spans: this.spans.map((s) => s.toOtlp(this.traceId)),
              },
            ],
          },
        ],
      };
      const base = (this.config.endpoint ?? "").replace(/\/+$/, "");
      const res = await fetch(`${base}/v1/traces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(FLUSH_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn(`langeval: ingest returned ${res.status}`);
        await res.body?.cancel();
        return false;
      }
      await res.body?.cancel();
      return true;
    } catch (err) {
      console.warn(`langeval: flush failed: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }
}

/**
 * Anthropic Messages usage → gen_ai.* token attributes.
 *
 * Anthropic's input_tokens EXCLUDES cached tokens; OTel semconv's
 * gen_ai.usage.input_tokens INCLUDES them, with the cache counts as a
 * breakdown. Summing here keeps langeval's cost engine from pricing cache
 * reads as plain input or subtracting them twice.
 */
export function anthropicUsageAttrs(usage: {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): Attrs {
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  return {
    "gen_ai.usage.input_tokens": (usage.input_tokens ?? 0) + read + write,
    "gen_ai.usage.output_tokens": usage.output_tokens,
    "gen_ai.usage.cache_read.input_tokens": read || undefined,
    "gen_ai.usage.cache_write.input_tokens": write || undefined,
  };
}

/** The shape of an Anthropic Messages response that tracing reads. */
type AnthropicMessage = {
  id: string;
  model: string;
  stop_reason: string | null;
  content: unknown;
  usage: Parameters<typeof anthropicUsageAttrs>[0];
};

/**
 * One Anthropic Messages call as an LLM span. `request` is what was sent
 * (model, max_tokens, system, messages); `call` makes the request. The
 * response is returned unchanged.
 */
export function tracedAnthropic<T extends AnthropicMessage>(
  trace: Trace,
  parent: Span | undefined,
  request: { model: string; max_tokens?: number; system?: unknown; messages: unknown },
  call: () => Promise<T>,
): Promise<T> {
  return trace.run(
    `chat ${request.model}`,
    {
      "openinference.span.kind": "LLM",
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": "anthropic",
      "gen_ai.request.model": request.model,
      "gen_ai.request.max_tokens": request.max_tokens,
    },
    parent,
    async (span) => {
      span.content(
        "input",
        request.system ? { system: request.system, messages: request.messages } : request.messages,
      );
      const message = await call();
      span
        .set({
          "gen_ai.response.model": message.model,
          "gen_ai.response.id": message.id,
          "gen_ai.response.finish_reasons": message.stop_reason ?? undefined,
          ...anthropicUsageAttrs(message.usage),
        })
        .content("output", message.content);
      return message;
    },
  );
}

/**
 * One OpenAI embeddings call as an EMBEDDING span. `call` makes the request
 * and returns the vector plus the prompt_tokens OpenAI reported.
 */
export async function tracedEmbedding(
  trace: Trace,
  parent: Span | undefined,
  model: string,
  input: string,
  call: () => Promise<{ embedding: number[]; tokens?: number }>,
): Promise<number[]> {
  return await trace.run(
    `embeddings ${model}`,
    {
      "openinference.span.kind": "EMBEDDING",
      "gen_ai.operation.name": "embeddings",
      "gen_ai.provider.name": "openai",
      "gen_ai.request.model": model,
    },
    parent,
    async (span) => {
      span.content("input", input);
      const { embedding, tokens } = await call();
      span.set({ "gen_ai.usage.input_tokens": tokens });
      return embedding;
    },
  );
}
