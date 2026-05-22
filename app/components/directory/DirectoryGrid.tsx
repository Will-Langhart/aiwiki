import { ToolCard } from "@/components/tool/ToolCard";
import { Skeleton } from "@/components/ui/skeleton";

interface Tool {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logo_url: string | null;
  pricing_tier: string;
  audience_fit: string;
  api_available?: boolean;
  open_source?: boolean;
  avg_stars?: number | null;
  rating_count?: number;
  category_name?: string | null;
  category_slug?: string | null;
  has_free_tier?: boolean;
}

interface DirectoryGridProps {
  tools: Tool[];
  loading?: boolean;
  dense?: boolean;
}

function ToolCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-10 rounded-full" />
      </div>
    </div>
  );
}

export function DirectoryGrid({ tools, loading = false, dense = false }: DirectoryGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 9 }, (_, i) => `skel-${i}`).map((id) => (
          <ToolCardSkeleton key={id} />
        ))}
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-text-muted text-sm">No tools match your filters.</p>
        <p className="text-text-subtle text-xs mt-1">Try clearing some filters to see more results.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {tools.map((tool) => (
        <ToolCard key={tool.id} tool={tool} dense={dense} />
      ))}
    </div>
  );
}
