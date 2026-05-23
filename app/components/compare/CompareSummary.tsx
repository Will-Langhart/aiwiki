import { useEffect } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { useStreamingFetch } from "@/hooks/useStreamingFetch";
import { MarkdownRenderer } from "@/components/tool/MarkdownRenderer";

interface CompareSummaryProps {
  toolSlugs: string[];
  /** Supabase project URL for Edge Function calls */
  supabaseUrl: string;
}

export function CompareSummary({ toolSlugs, supabaseUrl }: CompareSummaryProps) {
  const { text, done, error, streaming, stream, reset } = useStreamingFetch();

  const fetchSummary = () => {
    if (toolSlugs.length < 2) return;
    reset();
    stream({
      url: `${supabaseUrl}/functions/v1/compare-summary`,
      body: { tool_slugs: toolSlugs },
    });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-run when slugs change; stream/reset are stable
  useEffect(() => {
    fetchSummary();
  }, [toolSlugs.join(",")]);

  if (toolSlugs.length < 2) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-text">
          <Sparkles size={15} className="text-accent" />
          AI comparison summary
        </div>
        {done && (
          <button
            type="button"
            onClick={fetchSummary}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
            aria-label="Regenerate summary"
          >
            <RefreshCw size={12} />
            Regenerate
          </button>
        )}
      </div>

      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : !text && !streaming ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          Generating comparison…
        </div>
      ) : (
        <div className="text-sm text-text leading-relaxed prose prose-sm dark:prose-invert max-w-none">
          <MarkdownRenderer content={text} />
          {streaming && (
            <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse rounded-sm align-middle" />
          )}
        </div>
      )}
    </div>
  );
}
