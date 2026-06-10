import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { formatDistanceToNow, format } from "date-fns";
import {
  Pencil,
  Check,
  X,
  Bookmark,
  Star,
  FileEdit,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/lib/supabase.client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Schema ────────────────────────────────────────────────────────────────────
const profileSchema = z.object({
  display_name: z.string().max(60, "Max 60 characters").optional(),
  username: z
    .string()
    .min(3, "Min 3 characters")
    .max(30, "Max 30 characters")
    .regex(/^[a-z0-9_-]+$/, "Only lowercase letters, numbers, _ and -"),
  bio: z.string().max(200, "Max 200 characters").optional(),
});
type ProfileForm = z.infer<typeof profileSchema>;

// ── Data fetchers ─────────────────────────────────────────────────────────────
interface ProfileStats {
  bookmarkCount: number;
  submissionCount: number;
  ratingCount: number;
}

async function fetchStats(userId: string): Promise<ProfileStats> {
  const [bRes, sRes, rRes] = await Promise.all([
    supabase.from("bookmarks").select("tool_id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("tool_drafts").select("id", { count: "exact", head: true }).eq("submitter_id", userId),
    supabase.from("ratings").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  return {
    bookmarkCount: bRes.count ?? 0,
    submissionCount: sRes.count ?? 0,
    ratingCount: rRes.count ?? 0,
  };
}

interface RecentBookmark {
  tool_id: string;
  created_at: string;
  tools: {
    slug: string;
    name: string;
    tagline: string;
    logo_url: string | null;
    pricing_tier: string;
  } | null;
}

async function fetchRecentBookmarks(userId: string): Promise<RecentBookmark[]> {
  const { data } = await supabase
    .from("bookmarks")
    .select("tool_id, created_at, tools(slug, name, tagline, logo_url, pricing_tier)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(3);
  return (data as unknown as RecentBookmark[]) ?? [];
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function AvatarBlock({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="w-20 h-20 rounded-2xl object-cover ring-2 ring-border"
        onError={(e) => {
          e.currentTarget.style.display = "none";
          (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex");
        }}
      />
    );
  }

  return (
    <div
      className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold text-white flex-shrink-0"
      style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
    >
      {initials || "?"}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  to,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex-1 min-w-0 flex flex-col items-center gap-1 p-4 rounded-xl border border-border bg-surface hover:bg-surface-2 hover:border-accent/30 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] transition-all text-center group"
    >
      <Icon size={16} className="text-accent mb-0.5" />
      <span className="text-2xl font-bold text-text group-hover:text-accent transition-colors">
        {value}
      </span>
      <span className="text-xs text-text-muted">{label}</span>
    </Link>
  );
}

// ── Bookmark mini-card ────────────────────────────────────────────────────────
const PRICING_CHIP: Record<string, string> = {
  free: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  freemium: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  paid: "text-text-muted bg-surface-2",
  enterprise: "text-text-muted bg-surface-2",
};
const PRICING_LABEL: Record<string, string> = {
  free: "Free",
  freemium: "Free tier",
  paid: "Paid",
  enterprise: "Enterprise",
};

function BookmarkMiniCard({ bm }: { bm: RecentBookmark }) {
  const t = bm.tools;
  if (!t) return null;

  const initials = t.name[0]?.toUpperCase() ?? "?";

  return (
    <Link
      to={`/tools/${t.slug}`}
      className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface hover:bg-surface-2 hover:border-accent/30 transition-all group"
    >
      <div className="relative w-9 h-9 flex-shrink-0">
        {t.logo_url ? (
          <img
            src={t.logo_url}
            alt={t.name}
            className="w-9 h-9 rounded-lg object-contain bg-surface-2 p-0.5"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex");
            }}
          />
        ) : null}
        <div
          className="w-9 h-9 rounded-lg items-center justify-center text-xs font-bold text-white absolute inset-0"
          style={{
            display: t.logo_url ? "none" : "flex",
            background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
          }}
        >
          {initials}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text group-hover:text-accent transition-colors truncate">
          {t.name}
        </p>
        <p className="text-xs text-text-muted truncate">{t.tagline}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={cn("text-xs px-2 py-0.5 rounded-md font-medium", PRICING_CHIP[t.pricing_tier] ?? "text-text-muted bg-surface-2")}>
          {PRICING_LABEL[t.pricing_tier] ?? t.pricing_tier}
        </span>
        <ExternalLink size={12} className="text-text-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user, profile } = useCurrentUser();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: {
      display_name: profile?.display_name ?? "",
      username: profile?.username ?? "",
      bio: profile?.bio ?? "",
    },
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["profile-stats", user?.id],
    queryFn: () => fetchStats(user?.id ?? ""),
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const { data: recentBookmarks = [], isLoading: bmLoading } = useQuery({
    queryKey: ["recent-bookmarks", user?.id],
    queryFn: () => fetchRecentBookmarks(user?.id ?? ""),
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const cancelEdit = () => {
    reset();
    setEditing(false);
  };

  const onSubmit = async (values: ProfileForm) => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: values.display_name || null,
        username: values.username,
        bio: values.bio || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    setSaving(false);

    if (error) {
      if (error.code === "23505") {
        toast.error("That username is already taken.");
      } else {
        toast.error("Failed to save. Please try again.");
      }
      return;
    }

    toast.success("Profile updated.");
    qc.invalidateQueries({ queryKey: ["current-user"] });
    setEditing(false);
  };

  if (!profile) {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <Skeleton className="w-20 h-20 rounded-2xl" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      </div>
    );
  }

  const displayName = profile.display_name || profile.username;
  const memberSince = format(new Date(profile.created_at), "MMMM yyyy");

  return (
    <div className="space-y-8">
      {/* ── Profile header ───────────────────────────────────────────────── */}
      <div className="flex items-start gap-5">
        <AvatarBlock name={displayName} avatarUrl={profile.avatar_url} />

        <div className="flex-1 min-w-0">
          {!editing ? (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-text leading-tight">{displayName}</h2>
                {profile.is_admin && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                    Admin
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="text-text-muted hover:text-text -my-1 h-7 px-2"
                >
                  <Pencil size={12} className="mr-1" />
                  Edit
                </Button>
              </div>
              <p className="text-sm text-text-muted mt-0.5">@{profile.username}</p>
              {profile.bio && (
                <p className="text-sm text-text mt-2 leading-relaxed max-w-md">{profile.bio}</p>
              )}
              <div className="flex items-center gap-1.5 mt-2 text-xs text-text-subtle">
                <Calendar size={11} />
                Member since {memberSince}
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 max-w-sm">
              <div className="space-y-1">
                <Label htmlFor="display_name" className="text-xs">Display name</Label>
                <Input
                  id="display_name"
                  placeholder="Your full name"
                  className="h-8 text-sm"
                  {...register("display_name")}
                />
                {errors.display_name && (
                  <p className="text-xs text-danger">{errors.display_name.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="username" className="text-xs">Username</Label>
                <div className="flex items-center">
                  <span className="flex items-center px-2.5 h-8 rounded-l-md border border-r-0 border-border bg-surface-2 text-text-muted text-sm">@</span>
                  <Input
                    id="username"
                    placeholder="username"
                    className="h-8 text-sm rounded-l-none"
                    {...register("username")}
                  />
                </div>
                {errors.username && (
                  <p className="text-xs text-danger">{errors.username.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="bio" className="text-xs">Bio</Label>
                <Textarea
                  id="bio"
                  placeholder="Short bio (optional)"
                  className="text-sm resize-none h-20"
                  {...register("bio")}
                />
                {errors.bio && (
                  <p className="text-xs text-danger">{errors.bio.message}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={saving || !isDirty}
                  className="h-7 px-3 text-xs"
                >
                  <Check size={12} className="mr-1" />
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelEdit}
                  className="h-7 px-3 text-xs text-text-muted"
                >
                  <X size={12} className="mr-1" />
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ── Account email ────────────────────────────────────────────────── */}
      <div className="p-4 rounded-xl border border-border bg-surface-2/60 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-0.5">Email</p>
          <p className="text-sm text-text">{user?.email}</p>
        </div>
        <span className="text-xs text-text-subtle flex-shrink-0">Managed via auth provider</span>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-text-subtle uppercase tracking-widest mb-3">Activity</h3>
        {statsLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {(["s0","s1","s2"] as const).map((k) => (
              <Skeleton key={k} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon={Bookmark}
              label="Bookmarks"
              value={stats?.bookmarkCount ?? 0}
              to="/account/bookmarks"
            />
            <StatCard
              icon={FileEdit}
              label="Submissions"
              value={stats?.submissionCount ?? 0}
              to="/account/drafts"
            />
            <StatCard
              icon={Star}
              label="Ratings given"
              value={stats?.ratingCount ?? 0}
              to="/account/bookmarks"
            />
          </div>
        )}
      </div>

      {/* ── Recent bookmarks ─────────────────────────────────────────────── */}
      {!bmLoading && recentBookmarks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-text-subtle uppercase tracking-widest">
              Recently saved
            </h3>
            <Link to="/account/bookmarks" className="text-xs text-accent hover:underline">
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {recentBookmarks.map((bm) => (
              <BookmarkMiniCard key={bm.tool_id} bm={bm} />
            ))}
          </div>
        </div>
      )}

      {/* ── Danger zone ──────────────────────────────────────────────────── */}
      <div className="pt-4 border-t border-border">
        <h3 className="text-xs font-semibold text-text-subtle uppercase tracking-widest mb-3">Account</h3>
        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface">
          <div>
            <p className="text-sm font-medium text-text">Sign out</p>
            <p className="text-xs text-text-muted mt-0.5">
              Signed in as {user?.email}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
            }}
            className="text-text-muted hover:text-danger hover:border-danger/40 transition-colors"
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
