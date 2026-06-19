import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Route } from "./+types/root";
import "./styles/globals.css";

// Module-level singleton so the client is stable across HMR and SSR→hydration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
      // Don't run on the server (ssr:false mode — all data is client-side)
      enabled: typeof window !== "undefined",
    },
  },
});

export function meta(_: Route.MetaArgs) {
  // Sensible defaults for routes that don't export their own meta. Content
  // routes (home, tools, tool pages) override this with page-specific tags.
  return [
    { title: "AI Wiki — Community-curated AI tool directory" },
    { name: "description", content: "Community-curated directory and reference for AI tools." },
    { property: "og:site_name", content: "AI Wiki" },
    { property: "og:type", content: "website" },
    { property: "og:image", content: "https://aiwiki.io/logo.png" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:image", content: "https://aiwiki.io/logo.png" },
  ];
}

export function links() {
  return [
    { rel: "icon", type: "image/png", href: "/logo.png" },
    { rel: "apple-touch-icon", href: "/logo.png" },
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    {
      rel: "preconnect",
      href: "https://fonts.gstatic.com",
      crossOrigin: "anonymous",
    },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    },
  ];
}

// Flash-free theme hydration — runs before React mounts.
const themeScript = `(function(){var t=localStorage.getItem('theme')||'dark';if(t==='dark')document.documentElement.classList.add('dark');})();`;

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* eslint-disable-next-line */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: intentional flash-free theme hydration — must run before React mounts */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The page you're looking for doesn't exist."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-4xl font-bold mb-4">{message}</h1>
        <p className="text-text-muted mb-6">{details}</p>
        {stack && (
          <pre className="text-left text-xs bg-surface p-4 rounded-lg overflow-auto">
            {stack}
          </pre>
        )}
        <a href="/" className="text-accent hover:underline">
          Go home
        </a>
      </div>
    </main>
  );
}
