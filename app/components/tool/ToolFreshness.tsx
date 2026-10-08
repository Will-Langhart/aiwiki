import { Link } from "react-router";
import { History, ShieldCheck } from "lucide-react";
import { describeChange, formatChangeDate, type ToolChange } from "@/lib/tool-changes";

interface ToolFreshnessProps {
  websiteUrl: string;
  lastVerifiedAt: string | null;
  changes: ToolChange[];
}

function siteHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * "Verified against cursor.com on Oct 6, 2026" + the tool's recent notable
 * changes. Both come from the enrichment pipeline's refresh mode; renders
 * nothing for a tool that has never been verified or changed.
 */
export function ToolFreshness({ websiteUrl, lastVerifiedAt, changes }: ToolFreshnessProps) {
  if (!lastVerifiedAt && changes.length === 0) return null;

  return (
    <section
      aria-label="Listing freshness"
      className="rounded-xl border border-border bg-surface px-5 py-3.5 space-y-2.5"
    >
      {lastVerifiedAt && (
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <ShieldCheck size={14} className="text-success flex-shrink-0" />
          <span>
            Facts verified against <span className="text-text">{siteHost(websiteUrl)}</span> on{" "}
            <time dateTime={lastVerifiedAt} className="text-text">
              {formatChangeDate(lastVerifiedAt)}
            </time>
          </span>
        </p>
      )}
      {changes.length > 0 && (
        <div>
          <p className="flex items-center gap-2 text-[10px] font-semibold text-text-subtle uppercase tracking-widest mb-1.5">
            <History size={12} /> Recent changes
          </p>
          <ul className="space-y-1">
            {changes.map((c) => (
              <li key={c.id} className="flex gap-3 text-sm">
                <time dateTime={c.created_at} className="text-text-subtle tabular-nums flex-shrink-0 w-24">
                  {formatChangeDate(c.created_at)}
                </time>
                <span className="text-text-muted line-clamp-2">{describeChange(c)}</span>
              </li>
            ))}
          </ul>
          <Link to="/changes" className="inline-block mt-2 text-xs font-medium text-accent hover:underline">
            What's changed across AI tools →
          </Link>
        </div>
      )}
    </section>
  );
}
