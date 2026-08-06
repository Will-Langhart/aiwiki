import { useEffect } from "react";
import { Link, useLoaderData } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Components } from "react-markdown";
import { ChevronRight, MessageSquare, ArrowRight } from "lucide-react";
import type { Route } from "./+types/answers.$slug";
import { supabase } from "@/lib/supabase.client";
import { createBuildClient } from "@/lib/supabase.server";
import { MarkdownRenderer } from "@/components/tool/MarkdownRenderer";
import { ToolCard } from "@/components/tool/ToolCard";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { trackEvent, resolveChannel } from "@/lib/analytics";
import {
  baseMeta, jsonLd, breadcrumbLd, faqPageLd, itemListLd, plainExcerpt,
} from "@/lib/seo";

const TOOL_FIELDS =
  "id, slug, name, tagline, logo_url, pricing_tier, has_free_tier, audience_fit, api_available, open_source, self_hostable, model_provider, github_stars, integrations, traffic_tier, pricing_detail";

interface AnswerTool {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logo_url: string | null;
  pricing_tier: string;
  has_free_tier: boolean;
  audience_fit: string;
  api_available: boolean;
  open_source: boolean;
  self_hostable: boolean | null;
  model_provider: string | null;
  github_stars: number | null;
  integrations: string[] | null;
  traffic_tier: string | null;
  pricing_detail: string | null;
}

interface AnswerRow {
  slug: string;
  question: string;
  answer_md: string;
  summary: string | null;
  tool_ids: string[];
  category_id: string | null;
}

interface AnswerData {
  answer: AnswerRow | null;
  tools: AnswerTool[];
}

async function fetchAnswer(client: SupabaseClient, slug: string): Promise<AnswerData> {
  const { data: answer } = await client
    .from("public_answers")
    .select("slug, question, answer_md, summary, tool_ids, category_id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!answer) return { answer: null, tools: [] };

  const ids = (answer.tool_ids ?? []) as string[];
  let tools: AnswerTool[] = [];
  if (ids.length > 0) {
    const { data } = await client.from("tools").select(TOOL_FIELDS).in("id", ids).eq("status", "published");
    const byId = new Map((data as AnswerTool[] | null ?? []).map((t) => [t.id, t]));
    // Preserve the curated tool_ids order.
    tools = ids.map((id) => byId.get(id)).filter((t): t is AnswerTool => !!t);
  }

  return { answer: answer as AnswerRow, tools };
}

export async function loader({ params }: Route.LoaderArgs) {
  return fetchAnswer(createBuildClient(), params.slug as string);
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return fetchAnswer(supabase, params.slug as string);
}

// Emit FAQPage only when the question genuinely reads like a question.
function looksLikeQuestion(q: string): boolean {
  return /\?\s*$/.test(q) || /^(what|which|how|is|are|can|should|best|why|when|who|do|does)\b/i.test(q);
}

export function meta({ data }: Route.MetaArgs) {
  const answer = data?.answer;
  if (!answer) {
    return baseMeta({
      title: "Answer not found — AI Wiki",
      description: "This answer doesn't exist or hasn't been published yet.",
      path: "/answers",
      noindex: true,
    });
  }

  const description = answer.summary?.trim() || plainExcerpt(answer.answer_md);
  const tags = [
    ...baseMeta({
      title: `${answer.question} — AI Wiki`,
      description,
      path: `/answers/${answer.slug}`,
      type: "article",
    }),
    jsonLd(
      breadcrumbLd([
        { name: "Home", path: "/" },
        { name: "Answers", path: "/answers" },
        { name: answer.question, path: `/answers/${answer.slug}` },
      ]),
    ),
  ];

  if (data.tools.length > 0) {
    tags.push(jsonLd(itemListLd(data.tools.map((t) => ({ name: t.name, slug: t.slug })))));
  }
  if (looksLikeQuestion(answer.question)) {
    tags.push(jsonLd(faqPageLd(answer.question, plainExcerpt(answer.answer_md, 900))));
  }
  return tags;
}

export default function AnswerPage() {
  const { answer, tools } = useLoaderData<typeof loader>();
  const { user } = useCurrentUser();

  // biome-ignore lint/correctness/useExhaustiveDependencies: fire once per view
  useEffect(() => {
    if (!answer) return;
    trackEvent("answer_view", {
      channel: resolveChannel(),
      signed_in: !!user,
      has_category: !!answer.category_id,
    });
  }, [answer?.slug]);

  if (!answer) {
    return (
      <div className="container max-w-2xl py-20 text-center">
        <h1 className="text-2xl font-bold text-text mb-2">Answer not found</h1>
        <p className="text-text-muted mb-6">This answer doesn't exist or hasn't been published yet.</p>
        <Link to="/answers" className="text-accent hover:underline inline-flex items-center gap-1">
          Browse all answers <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  // Turn [tool:slug] markers into markdown links; the components map below
  // renders internal links as tracked, client-side <Link>s.
  const bySlug = new Map(tools.map((t) => [t.slug, t]));
  const displayContent = answer.answer_md.replace(/\[tool:([a-z0-9-]+)\]/g, (_, slug) => {
    const t = bySlug.get(slug);
    return `[${t ? t.name : slug}](/tools/${slug})`;
  });

  const mdComponents: Components = {
    a: ({ href, children }) =>
      href?.startsWith("/") ? (
        <Link
          to={href}
          onClick={() => trackEvent("answer_tool_click", { signed_in: !!user, source: "inline" })}
          className="text-accent no-underline hover:underline font-medium"
        >
          {children}
        </Link>
      ) : (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ),
  };

  const followupHref = `/chat?q=${encodeURIComponent(answer.question)}&src=answer`;

  return (
    <article className="container max-w-3xl py-8 sm:py-12">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-text-subtle mb-5">
        <Link to="/" className="hover:text-text transition-colors">Home</Link>
        <ChevronRight size={12} />
        <Link to="/answers" className="hover:text-text transition-colors">Answers</Link>
        <ChevronRight size={12} />
        <span className="text-text-muted truncate">{answer.question}</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-bold text-text tracking-tight leading-[1.15] mb-6">
        {answer.question}
      </h1>

      <MarkdownRenderer content={displayContent} components={mdComponents} className="prose-base" />

      {/* Cited tools */}
      {tools.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-bold text-text mb-4">Tools mentioned</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {tools.map((tool) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: click only augments the inner ToolCard link with analytics
              <div
                key={tool.id}
                onClick={() => trackEvent("answer_tool_click", { signed_in: !!user, source: "card" })}
              >
                <ToolCard tool={tool} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Ask a follow-up — closes the flywheel back into chat */}
      <section
        className="mt-12 rounded-2xl border border-border p-6 sm:p-8 text-center relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, var(--surface)), color-mix(in srgb, var(--accent-2) 6%, var(--surface)))" }}
      >
        <h2 className="text-xl font-bold text-text mb-2">Still deciding?</h2>
        <p className="text-sm text-text-muted mb-5 max-w-md mx-auto">
          Ask AI Wiki a follow-up about your specific use case and get a tailored recommendation.
        </p>
        <Link
          to={followupHref}
          onClick={() => trackEvent("answer_followup_click", { signed_in: !!user })}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          <MessageSquare size={15} /> Ask a follow-up
        </Link>
      </section>
    </article>
  );
}
