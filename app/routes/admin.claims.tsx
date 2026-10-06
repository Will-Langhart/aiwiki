import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { formatDistanceToNow } from "date-fns";
import { Check, X } from "lucide-react";
import { supabase } from "@/lib/supabase.client";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface ClaimRow {
  id: string;
  status: "pending" | "verified" | "rejected";
  verification_method: "email_domain" | "manual";
  claimant_email: string;
  note: string | null;
  created_at: string;
  tools: { slug: string; name: string; website_url: string } | null;
}

async function fetchClaims(): Promise<ClaimRow[]> {
  const { data } = await supabase
    .from("tool_claims")
    .select(
      "id, status, verification_method, claimant_email, note, created_at, tools(slug, name, website_url)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as unknown as ClaimRow[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600",
  verified: "bg-emerald-500/10 text-emerald-600",
  rejected: "bg-surface-2 text-text-muted",
};

export default function AdminClaims() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { data: claims, isLoading } = useQuery({
    queryKey: ["admin-claims"],
    queryFn: fetchClaims,
    staleTime: 30 * 1000,
  });

  async function review(id: string, status: "verified" | "rejected") {
    await supabase
      .from("tool_claims")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null })
      .eq("id", id);
    await queryClient.invalidateQueries({ queryKey: ["admin-claims"] });
  }

  const pending = (claims ?? []).filter((c) => c.status === "pending");
  const done = (claims ?? []).filter((c) => c.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text">Listing claims</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Makers claiming their tools. Matching-domain emails verify automatically; everything else
          lands here.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {["s0", "s1", "s2"].map((k) => (
            <Skeleton key={k} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : (claims?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-text-muted">
          No claims yet.
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-text">Pending ({pending.length})</h2>
            {pending.length === 0 && (
              <p className="text-sm text-text-muted">Nothing waiting for review.</p>
            )}
            {pending.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-border bg-surface p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text">
                    {c.tools ? (
                      <Link to={`/tools/${c.tools.slug}`} className="hover:underline">
                        {c.tools.name}
                      </Link>
                    ) : (
                      "Unknown tool"
                    )}{" "}
                    <span className="text-text-subtle font-normal">· {c.claimant_email}</span>
                  </p>
                  <p className="text-xs text-text-subtle mt-0.5">
                    Site: {c.tools?.website_url ?? "—"} ·{" "}
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </p>
                  {c.note && (
                    <p className="text-xs text-text-muted mt-1.5 whitespace-pre-wrap">{c.note}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => review(c.id, "verified")}
                    className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg hover:opacity-90"
                  >
                    <Check size={13} /> Verify
                  </button>
                  <button
                    type="button"
                    onClick={() => review(c.id, "rejected")}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text"
                  >
                    <X size={13} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </section>

          {done.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-text">Reviewed</h2>
              {done.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-border bg-surface px-4 py-2.5 flex items-center gap-3 text-sm"
                >
                  <span className="flex-1 min-w-0 truncate text-text">
                    {c.tools?.name ?? "Unknown tool"}{" "}
                    <span className="text-text-subtle">· {c.claimant_email}</span>
                  </span>
                  <span className="text-xs text-text-subtle">
                    {c.verification_method === "email_domain" ? "auto (email domain)" : "manual"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status]}`}
                  >
                    {c.status}
                  </span>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
