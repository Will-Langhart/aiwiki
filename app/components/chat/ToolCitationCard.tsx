import { useState } from "react";
import { Link } from "react-router";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthModalStore } from "@/stores/auth-modal";
import { supabase } from "@/lib/supabase.client";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

interface CitedTool {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logo_url: string | null;
  pricing_tier: string;
}

interface ToolCitationCardProps {
  tool: CitedTool;
  /** Fired when the user clicks through to the tool page (chat → tool). */
  onSelect?: () => void;
}

const PRICING_COLORS: Record<string, string> = {
  free: "bg-emerald-500/10 text-emerald-600 border-0",
  freemium: "bg-blue-500/10 text-blue-500 border-0",
  paid: "bg-amber-500/10 text-amber-600 border-0",
  enterprise: "bg-purple-500/10 text-purple-600 border-0",
};

export function ToolCitationCard({ tool, onSelect }: ToolCitationCardProps) {
  const { user } = useCurrentUser();
  const openAuth = useAuthModalStore((s) => s.openModal);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // One-way "save to my list" from a chat answer. Un-saving happens on the tool
  // page / account — keeping this a single action avoids loading bookmark state
  // for every citation.
  const handleSave = async () => {
    if (!user) {
      trackEvent("chat_save", { signed_in: false, result: "auth_required" });
      openAuth("/chat");
      return;
    }
    if (saving || saved) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("bookmarks").insert({ tool_id: tool.id, user_id: user.id });
      // 23505 = already bookmarked → treat as a successful save.
      if (error && error.code !== "23505") throw error;
      setSaved(true);
      trackEvent("chat_save", { signed_in: true, result: "saved" });
    } catch {
      trackEvent("chat_save", { signed_in: true, result: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex items-start gap-3 p-3 rounded-lg border border-border bg-surface hover:bg-surface-2 transition-colors group">
      <Link
        to={`/tools/${tool.slug}`}
        onClick={onSelect}
        className="flex items-start gap-3 flex-1 min-w-0"
      >
        {/* Logo */}
        <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center flex-shrink-0 overflow-hidden border border-border">
          {tool.logo_url ? (
            <img src={tool.logo_url} alt={tool.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-text-subtle">
              {tool.name[0]?.toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text truncate">{tool.name}</span>
            <Badge className={`text-xs flex-shrink-0 ${PRICING_COLORS[tool.pricing_tier] ?? ""}`}>
              {tool.pricing_tier}
            </Badge>
          </div>
          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{tool.tagline}</p>
        </div>
      </Link>

      {/* Save to bookmarks */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        aria-label={saved ? `${tool.name} saved to bookmarks` : `Save ${tool.name} to bookmarks`}
        aria-pressed={saved}
        title={saved ? "Saved to bookmarks" : "Save to bookmarks"}
        className={cn(
          "flex-shrink-0 p-1.5 -mr-1 -mt-1 rounded-md transition-colors",
          saved
            ? "text-accent"
            : "text-text-subtle opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-accent hover:bg-surface",
        )}
      >
        {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
      </button>
    </div>
  );
}
