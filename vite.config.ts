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
});
