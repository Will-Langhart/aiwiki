import tailwindcss from "@tailwindcss/vite";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tailwindcss(), // must come before reactRouter
    reactRouter(),
    tsconfigPaths(),
  ],
  server: {
    port: 5174,
  },
  resolve: {
    // Force a single React instance — prevents "Invalid hook call" when CJS
    // packages (e.g. zustand, @base-ui internals) pull in a second copy.
    dedupe: ["react", "react-dom", "react-dom/client"],
  },
  optimizeDeps: {
    // Crawl all route entry points upfront so Vite discovers every dep in a
    // single pass and never triggers a mid-session re-optimisation that would
    // produce a second React chunk with a different ?v= hash.
    entries: [
      "app/root.tsx",
      "app/routes/**/*.tsx",
      "app/components/**/*.tsx",
    ],
    // Pre-bundle every non-React dep that imports React internally.
    // Explicitly EXCLUDE react/react-dom: letting Vite handle them as part of
    // react-dom's own sub-graph is more stable than forcing a separate entry.
    include: [
      "react-router",
      "zustand",
      "zustand/react",
      "zustand/middleware",
      "@tanstack/react-query",
      "cmdk",
      "react-markdown",
      "remark-gfm",
      "@base-ui/react/accordion",
      "@base-ui/react/avatar",
      "@base-ui/react/button",
      "@base-ui/react/checkbox",
      "@base-ui/react/dialog",
      "@base-ui/react/input",
      "@base-ui/react/menu",
      "@base-ui/react/merge-props",
      "@base-ui/react/popover",
      "@base-ui/react/preview-card",
      "@base-ui/react/progress",
      "@base-ui/react/radio",
      "@base-ui/react/radio-group",
      "@base-ui/react/scroll-area",
      "@base-ui/react/select",
      "@base-ui/react/separator",
      "@base-ui/react/slider",
      "@base-ui/react/switch",
      "@base-ui/react/tabs",
      "@base-ui/react/tooltip",
      "@base-ui/react/use-render",
    ],
  },
});
