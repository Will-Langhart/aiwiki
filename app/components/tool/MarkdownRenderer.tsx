import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none",
        // Light theme
        "prose-headings:text-text prose-p:text-text-muted prose-strong:text-text",
        "prose-a:text-accent prose-a:no-underline hover:prose-a:underline",
        "prose-code:text-text prose-code:bg-surface-2 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-xs",
        "prose-pre:bg-surface-2 prose-pre:border prose-pre:border-border prose-pre:rounded-lg",
        "prose-blockquote:border-accent prose-blockquote:text-text-muted",
        "prose-li:text-text-muted prose-li:marker:text-text-subtle",
        "prose-hr:border-border",
        "prose-table:text-sm prose-th:text-text prose-td:text-text-muted",
        // Dark overrides (tokens handle automatically via CSS vars)
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
