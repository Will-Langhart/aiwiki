import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // Public routes under AppShell
  layout("components/layout/AppShell.tsx", [
    index("routes/_index.tsx"),
    route("tools", "routes/tools._index.tsx"),
    route("tools/:slug", "routes/tools.$slug.tsx", [
      index("routes/tools.$slug._index.tsx"),
      route("docs", "routes/tools.$slug.docs.tsx"),
      route("use-cases", "routes/tools.$slug.use-cases.tsx"),
    ]),
    route("categories/:slug", "routes/categories.$slug.tsx"),
    route("compare", "routes/compare.tsx"),
    route("search", "routes/search.tsx"),
    route("submit", "routes/submit._index.tsx"),
    route("submit/:draftId", "routes/submit.$draftId.tsx"),
    // Account (auth-gated)
    layout("routes/account.tsx", [
      route("account", "routes/account._index.tsx"),
      route("account/bookmarks", "routes/account.bookmarks.tsx"),
      route("account/drafts", "routes/account.drafts.tsx"),
      route("account/notifications", "routes/account.notifications.tsx"),
      route("account/preferences", "routes/account.preferences.tsx"),
    ]),
  ]),

  // Chat has its own layout
  route("chat", "routes/chat.tsx"),

  // Admin (admin-gated)
  layout("routes/admin.tsx", [
    route("admin", "routes/admin._index.tsx"),
    route("admin/submissions", "routes/admin.submissions._index.tsx"),
    route("admin/submissions/:id", "routes/admin.submissions.$id.tsx"),
    route("admin/flags", "routes/admin.flags.tsx"),
    route("admin/tools/:slug/edit", "routes/admin.tools.$slug.edit.tsx"),
  ]),

  // Auth callback
  route("auth/callback", "routes/auth.callback.tsx"),
] satisfies RouteConfig;
