import { useQuery } from "@tanstack/react-query";
import { Bookmark } from "lucide-react";
import { Link } from "react-router";
import { supabase } from "@/lib/supabase.client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ToolCard } from "@/components/tool/ToolCard";
import { Skeleton } from "@/components/ui/skeleton";

interface BookmarkedTool {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logo_url: string | null;
  primary_category_id: string | null;
  pricing_tier: string;
  has_free_tier: boolean;
  audience_fit: string;
  api_available: boolean;
  open_source: boolean;
  self_hostable: boolean | null;
  model_provider: string | null;
  category_name?: string | null;
}

async function fetchBookmarks(userId: string): Promise<BookmarkedTool[]> {
  const { data, error } = await supabase
    .from("bookmarks")
    .select(`
      tool_id,
      tools (
        id, slug, name, tagline, logo_url,
        primary_category_id, pricing_tier, has_free_tier,
        audience_fit, api_available, open_source, self_hostable, model_provider
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const tools = data
    .map((row) => row.tools)
    .filter((t): t is NonNullable<typeof t> => !!t);

  // Fetch category names
  const categoryIds = tools
    .map((t) => t.primary_category_id)
    .filter((id): id is string => !!id);

  const categoryMap = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: cats } = await supabase
      .from("categories")
      .select("id, name")
      .in("id", categoryIds);
    for (const c of cats ?? []) {
      categoryMap.set(c.id, c.name);
    }
  }

  return tools.map((t) => ({
    ...(t as BookmarkedTool),
    category_name: t.primary_category_id ? (categoryMap.get(t.primary_category_id) ?? null) : null,
  }));
}

function BookmarksSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {(["sk-0", "sk-1", "sk-2", "sk-3"] as const).map((key) => (
        <div key={key} className="p-4 rounded-xl border border-border space-y-3">
          <div className="flex items-start gap-3">
            <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

export default function Bookmarks() {
  const { user } = useCurrentUser();

  const { data: tools = [], isLoading } = useQuery({
    queryKey: ["bookmarks", user?.id],
    queryFn: () => fetchBookmarks(user?.id ?? ""),
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-text">Bookmarks</h2>
        <p className="text-text-muted text-sm mt-1">
          Tools you've saved for later.
        </p>
      </div>

      {isLoading ? (
        <BookmarksSkeleton />
      ) : tools.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
            <Bookmark size={24} className="text-text-subtle" />
          </div>
          <p className="text-text font-medium mb-1">No bookmarks yet</p>
          <p className="text-text-muted text-sm mb-6">
            Bookmark tools while browsing to save them here.
          </p>
          <Link
            to="/tools"
            className="text-sm text-accent hover:underline"
          >
            Browse the directory →
          </Link>
        </div>
      ) : (
        <>
          <p className="text-xs text-text-muted mb-4">
            {tools.length} saved tool{tools.length !== 1 ? "s" : ""}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
