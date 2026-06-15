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
  self_hostable?: boolean | null;
  model_provider?: string | null;
  avg_stars?: number | null;
  rating_count?: number | null;
  category_name?: string | null;
  category_slug?: string | null;
  has_free_tier?: boolean;
  is_featured?: boolean;
}

interface DirectoryGridProps {
  tools: Tool[];
  loading?: boolean;
  dense?: boolean;
}

function ToolCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5 space-y-3">
      <div className="flex items-start gap-2.5">
        <Skeleton className="w-9 h-9 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex gap-1.5 pt-2.5 border-t border-border/60">
        <Skeleton className="h-5 w-14 rounded-md" />
        <Skeleton className="h-5 w-12 rounded-md" />
      </div>
    </div>
  );
}

export function DirectoryGrid({ tools, loading = false, dense = false }: DirectoryGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
        {Array.from({ length: 12 }, (_, i) => `skel-${i}`).map((id) => (
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
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
      {tools.map((tool) => (
        <ToolCard key={tool.id} tool={tool} dense />
      ))}
    </div>
  );
}
