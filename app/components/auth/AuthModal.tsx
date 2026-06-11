import { useState } from "react";
import { Mail, Github, ArrowRight, CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabase.client";
import { useAuthModalStore } from "@/stores/auth-modal";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type View = "idle" | "loading" | "check-email" | "error";

export function AuthModal() {
  const { open, next, closeModal } = useAuthModalStore();
  const [email, setEmail] = useState("");
  const [view, setView] = useState<View>("idle");
  const [error, setError] = useState<string | null>(null);

  const redirectTo = `${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback?next=${encodeURIComponent(next)}`;

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setView("loading");
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setError(error.message);
      setView("error");
    } else {
      setView("check-email");
    }
  };

  const handleOAuth = async (provider: "google" | "github") => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) {
      setError(error.message);
      setView("error");
    }
  };

  const reset = () => {
    setView("idle");
    setError(null);
    setEmail("");
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      closeModal();
      setTimeout(reset, 300); // wait for close animation
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden border-border bg-surface">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <img src="/logo.png" alt="AI Wiki" className="w-8 h-8 object-contain" />
            <span className="font-bold text-text">AI Wiki</span>
          </div>
          <DialogTitle className="text-lg font-bold text-text">
            {view === "check-email" ? "Check your inbox" : "Sign in to AI Wiki"}
          </DialogTitle>
          <DialogDescription className="text-sm text-text-muted mt-0.5">
            {view === "check-email"
              ? `We sent a magic link to ${email}`
              : "Save tools, rate them, and get personalised recommendations."}
          </DialogDescription>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Success state */}
          {view === "check-email" ? (
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle size={24} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-text font-medium">Magic link sent!</p>
                <p className="text-xs text-text-muted mt-1">
                  Click the link in your email to sign in. You can close this window.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={reset}
                className="text-xs"
              >
                Try a different email
              </Button>
            </div>
          ) : (
            <>
              {/* Social auth */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 text-sm font-normal"
                  onClick={() => handleOAuth("google")}
                  disabled={view === "loading"}
                >
                  <GoogleIcon />
                  Google
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 text-sm font-normal"
                  onClick={() => handleOAuth("github")}
                  disabled={view === "loading"}
                >
                  <Github size={15} />
                  GitHub
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-text-subtle">or</span>
                <Separator className="flex-1" />
              </div>

              {/* Magic link form */}
              <form onSubmit={handleMagicLink} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="auth-email" className="text-sm text-text-muted">
                    Email address
                  </Label>
                  <Input
                    id="auth-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    disabled={view === "loading"}
                    className={cn(
                      "bg-surface-2 border-border text-text placeholder:text-text-subtle",
                      "focus:border-accent focus:ring-0"
                    )}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={view === "loading" || !email.trim()}
                >
                  {view === "loading" ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-accent-fg/40 border-t-accent-fg rounded-full animate-spin" />
                      Sending…
                    </span>
                  ) : (
                    <>
                      <Mail size={14} />
                      Continue with email
                      <ArrowRight size={14} className="ml-auto" />
                    </>
                  )}
                </Button>
              </form>

              {error && (
                <p className="text-xs text-danger text-center rounded-md bg-danger/5 border border-danger/20 px-3 py-2">
                  {error}
                </p>
              )}

              <p className="text-[11px] text-center text-text-subtle leading-relaxed">
                By continuing, you agree to our{" "}
                <a href="/terms" className="underline hover:text-text-muted">Terms</a>{" "}
                and{" "}
                <a href="/privacy" className="underline hover:text-text-muted">Privacy Policy</a>.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
