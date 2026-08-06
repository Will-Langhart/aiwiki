import { Link, useLoaderData } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, MessagesSquare, Sparkles } from "lucide-react";
import type { Route } from "./+types/answers._index";
import { supabase } from "@/lib/supabase.client";
import { createBuildClient } from "@/lib/supabase.server";
import { baseMeta, jsonLd, breadcrumbLd } from "@/lib/seo";

interface AnswerListItem {
  slug: string;
  question: string;
  summary: string | null;
}

async function fetchAnswers(client: SupabaseClient): Promise<AnswerListItem[]> {
  const { data } = await client
    .from("public_answers")
    .select("slug, question, summary")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  return (data ?? []) as AnswerListItem[];
}

export async function loader(_: Route.LoaderArgs) {
  return { answers: await fetchAnswers(createBuildClient()) };
}

export async function clientLoader(_: Route.ClientLoaderArgs) {
  return { answers: await fetchAnswers(supabase) };
}

export function meta(_: Route.MetaArgs) {
  return [
    ...baseMeta({
      title: "AI Wiki Answers — expert answers to common AI-tool questions",
      description:
        "Straight answers to the AI-tool questions people actually ask — the best tool for a job, honest comparisons, and free options — grounded in the AI Wiki directory.",
      path: "/answers",
    }),
    jsonLd(
      breadcrumbLd([
        { name: "Home", path: "/" },
        { name: "Answers", path: "/answers" },
      ]),
    ),
  ];
}

export default function AnswersHub() {
  const { answers } = useLoaderData<typeof loader>();

  return (
    <div className="container max-w-4xl py-10 sm:py-14">
      <header className="text-center mb-10">
        <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-accent/8 border border-accent/20 text-accent mb-4">
          <MessagesSquare size={13} /> Answers
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text mb-3">
          Answers to the AI-tool questions people actually ask
        </h1>
        <p className="text-text-muted max-w-xl mx-auto">
          Expert, directory-grounded answers — best tool for a job, honest comparisons, and free
          options. Can't find yours? Just ask.
        </p>
      </header>

      {answers.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-border bg-surface">
          <p className="text-text-muted mb-5">No answers published yet — be the first to ask.</p>
          <Link
            to="/chat"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            <Sparkles size={15} /> Ask AI Wiki
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {answers.map((a) => (
            <Link
              key={a.slug}
              to={`/answers/${a.slug}`}
              className="group flex flex-col rounded-xl border border-border bg-surface p-5 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] hover:border-accent/30 transition-all duration-200"
            >
              <h2 className="text-base font-semibold text-text group-hover:text-accent transition-colors leading-snug">
                {a.question}
              </h2>
              {a.summary && (
                <p className="text-sm text-text-muted mt-2 line-clamp-2 flex-1">{a.summary}</p>
              )}
              <span className="mt-3 text-xs font-medium text-accent inline-flex items-center gap-1">
                Read answer <ArrowRight size={12} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
