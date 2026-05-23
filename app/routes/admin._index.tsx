import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase.client";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { DollarSign, FileStack, Star, Zap } from "lucide-react";

interface CostRow { feature: string; total_cost: number; call_count: number }

async function fetchAdminStats() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: usageRows }, { data: queueCounts }, { data: recentTools }] = await Promise.all([
    supabase
      .from("llm_usage")
      .select("feature, cost_usd")
      .gte("created_at", sevenDaysAgo),
    // biome-ignore lint/suspicious/noExplicitAny: supabase rpc returns any
    supabase.from("tool_drafts").select("status").neq("status", "in_progress") as any,
    supabase
      .from("tools")
      .select("id, name, slug, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(5),
  ]);

  // Aggregate llm_usage by feature (GROUP BY not available client-side)
  const costMap: Record<string, { total_cost: number; call_count: number }> = {};
  for (const row of (usageRows ?? []) as { feature: string; cost_usd: number | null }[]) {
    const entry = costMap[row.feature] ?? { total_cost: 0, call_count: 0 };
    entry.total_cost += row.cost_usd ?? 0;
    entry.call_count += 1;
    costMap[row.feature] = entry;
  }
  const costRows: CostRow[] = Object.entries(costMap).map(([feature, v]) => ({
    feature,
    total_cost: v.total_cost,
    call_count: v.call_count,
  }));

  // Aggregate queue counts manually since group-by isn't available client-side
  const queueMap: Record<string, number> = {};
  for (const row of (queueCounts as { status: string }[] ?? [])) {
    queueMap[row.status] = (queueMap[row.status] ?? 0) + 1;
  }

  return {
    costs: costRows,
    queueCounts: queueMap,
    recentTools: recentTools ?? [],
  };
}

const FEATURE_LABELS: Record<string, string> = {
  url_to_draft: "URL autofill",
  chat: "Ask AI Wiki",
  compare_summary: "Compare TL;DR",
  moderate_comment: "Comment moderation",
};

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-500/10 text-blue-500",
  in_review: "bg-amber-500/10 text-amber-500",
  approved: "bg-emerald-500/10 text-emerald-600",
  rejected: "bg-danger/10 text-danger",
};

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-1">
      <div className="flex items-center gap-2 text-text-muted text-xs font-medium">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-text">{value}</p>
      {sub && <p className="text-xs text-text-subtle">{sub}</p>}
    </div>
  );
}

export default function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: fetchAdminStats,
    staleTime: 60 * 1000,
  });

  const totalCost = data?.costs.reduce((s, r) => s + (r.total_cost ?? 0), 0) ?? 0;
  const pending = (data?.queueCounts.submitted ?? 0) + (data?.queueCounts.in_review ?? 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-text">Admin dashboard</h1>
        <p className="text-sm text-text-muted mt-0.5">Overview of recent activity and LLM spend.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {["sk0", "sk1", "sk2", "sk3"].map((k) => <Skeleton key={k} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<FileStack size={14} />} label="Pending review" value={pending} sub="submitted + in review" />
          <StatCard icon={<Star size={14} />} label="Approved (7d)" value={data?.queueCounts.approved ?? 0} />
          <StatCard icon={<DollarSign size={14} />} label="LLM spend (7d)" value={`$${totalCost.toFixed(4)}`} sub="across all features" />
          <StatCard icon={<Zap size={14} />} label="AI calls (7d)" value={data?.costs.reduce((s, r) => s + (r.call_count ?? 0), 0) ?? 0} />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* LLM cost breakdown */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface-2">
            <h2 className="text-sm font-semibold text-text">LLM cost by feature (7d)</h2>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {["c0","c1","c2","c3"].map((k) => <Skeleton key={k} className="h-8 rounded" />)}
            </div>
          ) : data?.costs.length === 0 ? (
            <p className="p-6 text-sm text-text-muted text-center">No LLM usage in the last 7 days.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {data?.costs.map((row) => (
                <div key={row.feature} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-text-muted">{FEATURE_LABELS[row.feature] ?? row.feature}</span>
                  <div className="flex items-center gap-4 text-right">
                    <span className="text-text-subtle text-xs">{row.call_count} calls</span>
                    <span className="text-text font-medium font-mono">${(row.total_cost ?? 0).toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Queue breakdown */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface-2">
            <h2 className="text-sm font-semibold text-text">Submission queue</h2>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {["q0","q1","q2","q3"].map((k) => <Skeleton key={k} className="h-8 rounded" />)}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {Object.entries(data?.queueCounts ?? {}).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[status] ?? "bg-surface-2 text-text-muted"}`}>
                    {status.replace(/_/g, " ")}
                  </span>
                  <span className="text-text font-semibold">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recently published tools */}
      {(data?.recentTools?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface-2">
            <h2 className="text-sm font-semibold text-text">Recently published</h2>
          </div>
          <div className="divide-y divide-border/50">
            {data?.recentTools?.map((t) => (
              <a
                key={t.id}
                href={`/tools/${t.slug}`}
                className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surface-2 transition-colors"
              >
                <span className="text-text font-medium">{t.name}</span>
                <span className="text-text-subtle text-xs">
                  {t.published_at ? formatDistanceToNow(new Date(t.published_at), { addSuffix: true }) : "—"}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
