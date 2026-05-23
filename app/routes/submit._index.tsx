import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSubmissionStore } from "@/stores/submission";
import { SubmissionWizard } from "@/components/submission/SubmissionWizard";
import { Skeleton } from "@/components/ui/skeleton";

export default function Submit() {
  const { user, loading } = useCurrentUser();
  const { reset } = useSubmissionStore();
  const navigate = useNavigate();

  // Fresh wizard on this page (no draftId)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset is stable
  useEffect(() => { reset(); }, []);

  if (loading) {
    return (
      <div className="container py-12 max-w-2xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container py-20 text-center max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-4">Sign in to submit a tool</h1>
        <p className="text-text-muted mb-6">
          You need an account to submit tools. It&apos;s free and takes 30 seconds.
        </p>
        <button
          type="button"
          onClick={() => navigate("/auth/callback")}
          className="text-accent hover:underline"
        >
          Sign in with GitHub or Google →
        </button>
      </div>
    );
  }

  return <SubmissionWizard user={user} />;
}
