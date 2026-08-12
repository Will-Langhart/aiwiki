import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Playwright doesn't read Vite's `.env.local`. Load it with a tiny parser (no
// dotenv dependency) so `npm run test:e2e` picks up VITE_SUPABASE_* the same way
// the app does. Anything already in the environment wins, so CI can override.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    // The current suite is API-level (Supabase REST); no browser/baseURL needed.
    // A future UI suite can add a `webServer` and `baseURL` here.
    trace: "on-first-retry",
  },
});
