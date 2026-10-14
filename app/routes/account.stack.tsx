import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Layers, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabase.client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { StackDialog } from "@/components/tool/StackButton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trackEvent } from "@/lib/analytics";
import { fetchToolAlternatives } from "@/lib/alternatives";
import { describeChange, fetchToolChanges, formatChangeDate } from "@/lib/tool-changes";
import {
  type StackItem,
  cheaperAlternatives,
  fetchMyStack,
  formatUsd,
  priceGap,
  summarizeStack,
  toEntry,
} from "@/lib/stack";
import { cn } from "@/lib/utils";

const STACK_KEY = ["my-stack"];

const STATUS_LABEL: Record<StackItem["status"], string> = {
  active: "Paying",
  trial: "Trial",
  cancelled: "Cancelled",
};

export default function MyStack() {
  const { user } = useCurrentUser();
  const [editing, setEditing] = useState<StackItem | null>(null);

  const { data: items = [], isLoading, isError } = useQuery({
    queryKey: [...STACK_KEY, user?.id],
    queryFn: fetchMyStack,
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const summary = useMemo(() => summarizeStack(items), [items]);
  const stackToolIds = useMemo(() => new Set(items.map((i) => i.tool_id)), [items]);

  // One view event per visit, once data is in (counts only — §19.4).
  const viewTracked = useRef(false);
  useEffect(() => {
    if (isLoading || isError || viewTracked.current || !user) return;
    viewTracked.current = true;
    trackEvent("stack_view", { stack_size: items.length, has_overlap: summary.overlaps.length > 0 });
  }, [isLoading, isError, user, items.length, summary.overlaps.length]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-text">My AI stack</h2>
        <p className="text-text-muted text-sm mt-1">
          The AI tools you pay for. Only you can see this. We email you when one of them changes its pricing or plans.
        </p>
      </div>

      {isLoading ? (
        <StackSkeleton />
      ) : isError ? (
        <p className="text-sm text-danger">Couldn't load your stack. Refresh to try again.</p>
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-[var(--space-element)]">
          {/* Totals */}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Per month" value={formatUsd(summary.monthlyTotal)} />
            <Stat label="Per year" value={formatUsd(summary.annualTotal)} />
            <Stat label="Tools paying for" value={String(summary.liveCount)} />
          </div>

          {/* Overlaps */}
          {summary.overlaps.map((group) => (
            <Callout key={group.key}>
              <span className="font-medium text-text">{joinNames(group.items.map((i) => i.name))}</span> are {group.items.length === 2 ? "both" : "all"}{" "}
              <span className="font-medium text-text">{group.categoryName}</span> tools, together{" "}
              {formatUsd(group.monthlyTotal)}/mo. Worth checking whether you need all of them.
            </Callout>
          ))}

          {/* No longer listed */}
          {summary.unlisted.length > 0 && (
            <Callout>
              <span className="font-medium text-text">{joinNames(summary.unlisted.map((i) => i.name))}</span>{" "}
              {summary.unlisted.length === 1 ? "is" : "are"} no longer listed on AI Wiki. It may have shut down or
              merged into another product.
            </Callout>
          )}

          {/* Items */}
          <ul className="space-y-3">
            {items.map((item) => (
              <StackRow key={item.tool_id} item={item} stackToolIds={stackToolIds} onEdit={() => setEditing(item)} />
            ))}
          </ul>

          <p className="text-xs text-text-subtle">
            Add more from any tool page with the <Layers size={11} className="inline -mt-0.5" /> button.{" "}
            <Link to="/tools" className="text-accent hover:underline">
              Browse the directory →
            </Link>
          </p>
        </div>
      )}

      {editing && user && (
        <StackDialog
          toolId={editing.tool_id}
          toolName={editing.name}
          userId={user.id}
          entry={toEntry(editing)}
          listedPrice={editing.pricing_starts_at}
          queryKey={["tool-user", editing.tool_id, user.id]}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </div>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────

function StackRow({
  item,
  stackToolIds,
  onEdit,
}: {
  item: StackItem;
  stackToolIds: Set<string>;
  onEdit: () => void;
}) {
  const live = item.status !== "cancelled";
  const gap = priceGap(item);

  // Per-item extras load after the list; small stacks, so N small queries is fine.
  const { data: changes = [] } = useQuery({
    queryKey: ["tool-changes", item.tool_id],
    queryFn: () => fetchToolChanges(supabase, item.tool_id, 2),
    enabled: item.is_listed,
    staleTime: 5 * 60 * 1000,
  });
  const { data: alternatives = [] } = useQuery({
    queryKey: ["tool-alternatives", item.slug],
    queryFn: async () => (await fetchToolAlternatives(supabase, item.slug, 10)) ?? [],
    enabled: live && item.monthly_cost > 0,
    staleTime: 10 * 60 * 1000,
  });
  const cheaper = cheaperAlternatives(item, alternatives, stackToolIds);

  return (
    <li className={cn("rounded-xl border border-border bg-surface p-4", !live && "opacity-70")}>
      <div className="flex items-start gap-3">
        <ToolLogo name={item.name} logoUrl={item.logo_url} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {item.is_listed ? (
              <Link to={`/tools/${item.slug}`} className="font-semibold text-text hover:text-accent">
                {item.name}
              </Link>
            ) : (
              <span className="font-semibold text-text">{item.name}</span>
            )}
            <span
              className={cn(
                "text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded",
                item.status === "active" && "bg-accent/10 text-accent",
                item.status === "trial" && "bg-warning/10 text-warning",
                item.status === "cancelled" && "bg-surface-2 text-text-muted",
              )}
            >
              {STATUS_LABEL[item.status]}
            </span>
          </div>
          <p className="text-sm text-text-muted mt-0.5">
            {[item.plan_label, item.category_name].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-semibold text-text tabular-nums">
            {formatUsd(item.monthly_cost)}
            <span className="text-xs font-normal text-text-muted">/mo</span>
          </p>
          {item.billing_period === "year" && (
            <p className="text-xs text-text-subtle tabular-nums">{formatUsd(item.cost_usd)}/yr</p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${item.name}`}>
          <Pencil size={15} />
        </Button>
      </div>

      <div className="mt-3 space-y-1.5 text-xs text-text-muted pl-12">
        {gap.kind === "paying_more" && (
          <p>
            Listed from {formatUsd(gap.listed)}/mo. You pay {formatUsd(gap.diff)} more (a higher plan?).
          </p>
        )}
        {gap.kind === "paying_less" && (
          <p>
            Listed from {formatUsd(gap.listed)}/mo. You pay {formatUsd(gap.diff)} less, which may be a legacy or discounted plan.
          </p>
        )}
        {item.renews_on && live && <p>Renews {formatChangeDate(item.renews_on)}</p>}
        {changes.map((c) => (
          <p key={c.id}>
            <span className="text-text-subtle">{formatChangeDate(c.created_at, { month: "short", day: "numeric" })}:</span>{" "}
            {describeChange(c)}
          </p>
        ))}
        {item.last_verified_at && (
          <p className="text-text-subtle">Pricing verified {formatChangeDate(item.last_verified_at)}</p>
        )}
        {cheaper.length > 0 && (
          <p className="pt-1">
            <span className="text-text">Cheaper options:</span>{" "}
            {cheaper.map((alt, i) => (
              <span key={alt.id}>
                {i > 0 && ", "}
                <Link to={`/tools/${alt.slug}`} className="text-accent hover:underline">
                  {alt.name}
                </Link>{" "}
                ({alt.has_free_tier ? "free tier" : `from ${formatUsd(alt.pricing_starts_at ?? 0)}/mo`})
              </span>
            ))}
            {item.is_listed && (
              <>
                {" · "}
                <Link to={`/tools/${item.slug}/alternatives`} className="text-accent hover:underline">
                  all alternatives
                </Link>
              </>
            )}
          </p>
        )}
        {!item.is_listed && (
          <p className="text-warning">No longer listed. Consider cancelling, or remove it from your stack.</p>
        )}
      </div>
    </li>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className="text-lg sm:text-2xl font-semibold text-text tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-text-muted">
      <AlertTriangle size={16} className="text-warning flex-shrink-0 mt-0.5" />
      <p>{children}</p>
    </div>
  );
}

function ToolLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!logoUrl || failed) {
    return (
      <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center text-sm font-semibold text-text-muted flex-shrink-0">
        {name.charAt(0)}
      </div>
    );
  }
  return (
    <img
      src={logoUrl}
      alt=""
      width={36}
      height={36}
      className="w-9 h-9 rounded-lg object-contain bg-surface-2 flex-shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
        <Layers size={24} className="text-text-subtle" />
      </div>
      <p className="text-text font-medium mb-1">Your AI stack is empty</p>
      <p className="text-text-muted text-sm mb-6 max-w-sm">
        Add the AI tools you pay for to see your monthly total and where tools overlap. We'll email you when their
        pricing changes.
      </p>
      <div className="flex flex-wrap justify-center gap-2 text-sm">
        {["chatgpt", "claude", "cursor", "midjourney"].map((slug) => (
          <Link
            key={slug}
            to={`/tools/${slug}`}
            className="px-3 py-1.5 rounded-lg border border-border text-text-muted hover:text-text hover:border-text-subtle"
          >
            {slug === "chatgpt" ? "ChatGPT" : slug.charAt(0).toUpperCase() + slug.slice(1)}
          </Link>
        ))}
        <Link to="/tools" className="px-3 py-1.5 text-accent hover:underline inline-flex items-center gap-1">
          Browse all <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}

function StackSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {(["a", "b", "c"] as const).map((k) => (
          <Skeleton key={k} className="h-20 rounded-xl" />
        ))}
      </div>
      {(["d", "e"] as const).map((k) => (
        <Skeleton key={k} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
