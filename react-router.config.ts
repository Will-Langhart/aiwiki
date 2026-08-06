import type { Config } from "@react-router/dev/config";
import { createClient } from "@supabase/supabase-js";
import { getPopularComparePaths } from "./app/lib/compare-paths";
import { getPublishedAnswerPaths } from "./app/lib/answer-paths";

export default {
  ssr: false,
  prerender: async () => {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

    if (!url || !key) {
      console.warn("[prerender] Missing SUPABASE_URL or key — skipping dynamic prerender.");
      return ["/", "/tools"];
    }

    const supabase = createClient(url, key);

    const [{ data: tools }, { data: categories }, comparePaths, answerPaths] =
      await Promise.all([
        supabase.from("tools").select("slug").eq("status", "published"),
        supabase.from("categories").select("slug"),
        getPopularComparePaths(supabase),
        getPublishedAnswerPaths(supabase),
      ]);

    const toolPaths = (tools ?? []).flatMap((t) => [
      `/tools/${t.slug}`,
      `/tools/${t.slug}/docs`,
      `/tools/${t.slug}/use-cases`,
    ]);

    const categoryPaths = (categories ?? []).map((c) => `/categories/${c.slug}`);

    return [
      "/", "/tools", "/suggest", "/answers",
      ...toolPaths, ...categoryPaths, ...comparePaths, ...answerPaths,
    ];
  },
} satisfies Config;
