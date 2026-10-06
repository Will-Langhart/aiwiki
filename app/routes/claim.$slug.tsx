import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, Check, Clock, Copy, ShieldCheck, XCircle } from "lucide-react";
import type { Route } from "./+types/claim.$slug";
import { supabase } from "@/lib/supabase.client";
import { baseMeta, SITE_URL } from "@/lib/seo";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthModalStore } from "@/stores/auth-modal";

export function meta({ params }: Route.MetaArgs) {
  return baseMeta({
    title: "Claim your listing & get the badge — AI Wiki",
    description: "Verify you make this tool and add the Featured on AI Wiki badge to your site.",
    path: `/claim/${params.slug}`,
    noindex: true,
  });
}

interface ClaimTool {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  website_url: string;
}

interface Claim {
  status: "pending" | "verified" | "rejected";
  verification_method: "email_domain" | "manual";
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function fetchTool(slug: string): Promise<ClaimTool | null> {
  const { data } = await supabase
    .from("tools")
    .select("id, slug, name, logo_url, website_url")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return (data as ClaimTool | null) ?? null;
}

async function fetchOwnClaim(toolId: string, userId: string): Promise<Claim | null> {
  const { data } = await supabase
    .from("tool_claims")
    .select("status, verification_method")
    .eq("tool_id", toolId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as Claim | null) ?? null;
}

type BadgeTheme = "dark" | "light";

function badgeSnippets(slug: string, name: string, theme: BadgeTheme) {
  const href = `${SITE_URL}/tools/${slug}?ref=badge`;
  const src = `${SITE_URL}/badges/featured-${theme}.svg`;
  const alt = `${name} is featured on AI Wiki`;
  return {
    html: `<a href="${href}" target="_blank" rel="noopener"><img src="${src}" alt="${alt}" width="220" height="54" /></a>`,
    markdown: `[![${alt}](${src})](${href})`,
  };
}

function CopyBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the text is still selectable */
    }
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-text-muted">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg border border-border bg-bg px-3 py-2.5 text-[11px] leading-relaxed text-text-muted whitespace-pre-wrap break-all">
        {code}
      </pre>
    </div>
  );
}

export default function ClaimPage() {
  const { slug = "" } = useParams();
  const { user } = useCurrentUser();
  const openAuthModal = useAuthModalStore((s) => s.openModal);
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<BadgeTheme>("dark");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: tool, isLoading } = useQuery({
    queryKey: ["claim-tool", slug],
    queryFn: () => fetchTool(slug),
    staleTime: 5 * 60 * 1000,
  });
  const claimKey = ["claim-own", tool?.id, user?.id];
  const { data: claim } = useQuery({
    queryKey: claimKey,
    queryFn: () => fetchOwnClaim(tool?.id ?? "", user?.id ?? ""),
    enabled: !!tool?.id && !!user?.id,
  });

  if (isLoading) {
    return <div className="container py-16 text-sm text-text-muted">Loading…</div>;
  }
  if (!tool) {
    return (
      <div className="container py-16 text-center">
        <h1 className="text-2xl font-bold text-text mb-2">Tool not found</h1>
        <Link to="/tools" className="text-accent hover:underline">
          Browse the directory
        </Link>
      </div>
    );
  }

  const host = hostOf(tool.website_url);
  const snippets = badgeSnippets(tool.slug, tool.name, theme);

  async function submitClaim() {
    if (!tool) return;
    setSubmitting(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("claim_tool", {
      p_slug: tool.slug,
      p_note: note.trim() || undefined,
    });
    setSubmitting(false);
    if (rpcError) {
      setError("Something went wrong submitting your claim. Please try again.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: claimKey });
  }

  return (
    <div className="container max-w-3xl py-[var(--space-section,2.5rem)] space-y-6">
      <Link
        to={`/tools/${tool.slug}`}
        className="inline-flex items-center gap-1 text-xs text-text-subtle hover:text-text transition-colors"
      >
        <ArrowLeft size={12} /> Back to {tool.name}
      </Link>

      <header className="flex items-center gap-4">
        {tool.logo_url ? (
          <img
            src={tool.logo_url}
            alt=""
            className="h-14 w-14 rounded-xl border border-border bg-surface object-contain p-1.5"
          />
        ) : null}
        <div>
          <span className="section-eyebrow">For makers</span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text">
            Is {tool.name} yours?
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Add the badge to your site, and claim the listing to get the verified mark.
          </p>
        </div>
      </header>

      {/* ── Badge ─────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-text">
              Add the &ldquo;Featured on AI Wiki&rdquo; badge
            </h2>
            <p className="text-xs text-text-muted mt-1">
              Free for any listed tool — no claim needed. It links visitors to your {tool.name}{" "}
              page.
            </p>
          </div>
          <div className="flex rounded-lg border border-border p-0.5 text-xs flex-shrink-0">
            {(["dark", "light"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                aria-pressed={theme === t}
                className={`rounded-md px-2.5 py-1 font-medium capitalize ${theme === t ? "bg-accent/10 text-accent" : "text-text-muted"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div
          className={`flex items-center justify-center rounded-xl border border-border py-8 ${theme === "light" ? "bg-white" : "bg-[#05070b]"}`}
        >
          <img
            src={`/badges/featured-${theme}.svg`}
            alt="Featured on AI Wiki badge preview"
            width={220}
            height={54}
          />
        </div>
        <CopyBlock label="HTML" code={snippets.html} />
        <CopyBlock label="Markdown (README)" code={snippets.markdown} />
      </section>

      {/* ── Claim ─────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-text">Claim this listing</h2>
          <ul className="mt-2 space-y-1.5 text-xs text-text-muted">
            <li className="flex items-center gap-2">
              <BadgeCheck size={14} className="text-accent flex-shrink-0" /> A &ldquo;Verified by
              maker&rdquo; mark on your tool page
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-accent flex-shrink-0" /> Sign in with an{" "}
              <span className="font-medium text-text">@{host}</span> email to verify instantly —
              otherwise we review it by hand
            </li>
          </ul>
        </div>

        {!user ? (
          <button
            type="button"
            onClick={() => openAuthModal(`/claim/${tool.slug}`)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90"
          >
            Sign in to claim {tool.name}
          </button>
        ) : claim?.status === "verified" ? (
          <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-text">
            <BadgeCheck size={16} className="text-accent" />
            Verified — you're listed as the maker of {tool.name}.
          </div>
        ) : claim?.status === "pending" ? (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-bg/40 px-4 py-3 text-sm text-text">
            <Clock size={16} className="text-text-muted mt-0.5 flex-shrink-0" />
            <span>
              Claim received — we'll review it shortly. Your sign-in email doesn't match {host}, so
              this one gets checked by hand.
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {claim?.status === "rejected" && (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-bg/40 px-4 py-3 text-xs text-text-muted">
                <XCircle size={14} className="mt-0.5 flex-shrink-0" />
                Your previous claim wasn't approved. Sign in with an @{host} email, or add a note
                below, and try again.
              </div>
            )}
            <label className="block">
              <span className="text-xs font-medium text-text-muted">
                Anything we should know? (optional)
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 1000))}
                rows={3}
                placeholder="e.g. I'm the founder — you can reach me at …"
                className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-subtle focus:outline-none focus:border-accent/60"
              />
            </label>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="button"
              onClick={submitClaim}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : `Claim ${tool.name}`}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
