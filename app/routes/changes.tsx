import { Link, useLoaderData } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { History, ShieldCheck } from "lucide-react";
import type { Route } from "./+types/changes";
import { supabase } from "@/lib/supabase.client";
import { createBuildClient } from "@/lib/supabase.server";
import { baseMeta, jsonLd, breadcrumbLd } from "@/lib/seo";
import { ToolLogo } from "@/components/tool/ToolCard";
import {
  describeChange,
  fetchRecentChanges,
  formatChangeDate,
  groupChanges,
  type ChangeGroup,
} from "@/lib/tool-changes";

const WINDOW_DAYS = 60;

async function fetchChanges(client: SupabaseClient): Promise<{ groups: ChangeGroup[] }> {
  return { groups: groupChanges(await fetchRecentChanges(client, WINDOW_DAYS)) };
}

export async function loader(_: Route.LoaderArgs) {
  return fetchChanges(createBuildClient());
}

export async function clientLoader(_: Route.ClientLoaderArgs) {
  return fetchChanges(supabase);
}

export function meta(_: Route.MetaArgs) {
  return [
    ...baseMeta({
      title: "What changed in AI tools — pricing, free tiers & features | AI Wiki",
      description:
        "A running log of real changes to AI tools — price increases, free tiers added or removed, new APIs and open-source releases — each verified against the vendor's own site.",
      path: "/changes",
    }),
    jsonLd(
      breadcrumbLd([
        { name: "Home", path: "/" },
        { name: "What changed", path: "/changes" },
      ]),
    ),
  ];
}

/** Day headings for the feed, newest first. */
function byDay(groups: ChangeGroup[]): Array<{ date: string; groups: ChangeGroup[] }> {
  const days: Array<{ date: string; groups: ChangeGroup[] }> = [];
  for (const g of groups) {
    const last = days[days.length - 1];
    if (last?.date === g.date) last.groups.push(g);
    else days.push({ date: g.date, groups: [g] });
  }
  return days;
}

export default function ChangesPage() {
  const { groups } = useLoaderData<typeof loader>();
  const days = byDay(groups);
  const toolCount = new Set(groups.map((g) => g.tool.slug)).size;

  return (
    <div className="container max-w-3xl py-10 sm:py-14">
      <header className="mb-10">
        <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-accent/8 border border-accent/20 text-accent mb-4">
          <History size={13} /> Change log
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text mb-3">What changed in AI tools</h1>
        <p className="text-text-muted max-w-2xl">
          Price changes, free tiers added or dropped, new APIs and open-source releases — caught when we re-check
          each listing against the vendor's own site.
          {toolCount > 0 && ` ${toolCount} tools changed in the last ${WINDOW_DAYS} days.`}
        </p>
        <p className="flex items-center gap-2 text-xs text-text-subtle mt-3">
          <ShieldCheck size={13} className="text-success" />
          Every change is backed by a quote from the vendor's site.
        </p>
      </header>

      {days.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-border bg-surface">
          <p className="text-text-muted mb-5">No changes recorded in the last {WINDOW_DAYS} days.</p>
          <Link to="/tools" className="text-accent hover:underline text-sm">
            Browse the directory →
          </Link>
        </div>
      ) : (
        <ol className="space-y-8">
          {days.map((day) => (
            <li key={day.date}>
              <h2 className="text-xs font-semibold text-text-subtle uppercase tracking-widest mb-3">
                <time dateTime={day.date}>
                  {formatChangeDate(`${day.date}T00:00:00Z`, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                </time>
              </h2>
              <ul className="space-y-3">
                {day.groups.map((g) => (
                  <li key={`${g.tool.slug}:${g.date}`}>
                    <Link
                      to={`/tools/${g.tool.slug}`}
                      className="group flex gap-4 rounded-xl border border-border bg-surface p-4 hover:border-accent/30 hover:shadow-[var(--shadow-card-hover)] transition-all duration-200"
                    >
                      <ToolLogo name={g.tool.name} logo_url={g.tool.logo_url} size="sm" />
                      <div className="min-w-0">
                        <h3 className="font-semibold text-text group-hover:text-accent transition-colors">
                          {g.tool.name}
                        </h3>
                        <ul className="mt-1 space-y-0.5">
                          {g.changes.map((c) => (
                            <li key={c.id} className="text-sm text-text-muted line-clamp-2">
                              {describeChange(c)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
