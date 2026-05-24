import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { supabase } from "@/lib/supabase.client";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const next = searchParams.get("next") ?? "/";
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        navigate(next, { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-text-muted text-sm">Signing you in…</p>
      </div>
    </div>
  );
}
