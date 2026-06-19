import type { Route } from "./+types/categories.$slug";
import { baseMeta } from "@/lib/seo";

// Placeholder until category pages are built — keep it out of search/AI indexes
// so thin "coming soon" pages don't dilute the site's content signal.
export function meta({ params }: Route.MetaArgs) {
  return baseMeta({
    title: "Category — AI Wiki",
    description: "Browse AI tools by category on AI Wiki.",
    path: `/categories/${params.slug}`,
    noindex: true,
  });
}

export default function CategoryPage() {
  return (
    <div className="container py-12">
      <p className="text-text-muted">Category — coming in Phase 1.</p>
    </div>
  );
}
