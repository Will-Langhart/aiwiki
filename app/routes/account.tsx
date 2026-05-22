import { Outlet, Link, useLocation } from "react-router";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function AccountLayout() {
  const { user, loading } = useCurrentUser();
  const location = useLocation();

  if (loading) {
    return (
      <div className="container py-12 flex justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Sign in required</h1>
        <p className="text-text-muted mb-6">You need to be signed in to view this page.</p>
      </div>
    );
  }

  const navLinks = [
    { to: "/account", label: "Profile" },
    { to: "/account/bookmarks", label: "Bookmarks" },
    { to: "/account/drafts", label: "My submissions" },
    { to: "/account/notifications", label: "Notifications" },
    { to: "/account/preferences", label: "Preferences" },
  ];

  return (
    <div className="container py-8">
      <div className="flex flex-col md:flex-row gap-8">
        <nav className="md:w-48 shrink-0">
          <ul className="flex flex-row md:flex-col gap-1 text-sm overflow-x-auto">
            {navLinks.map(({ to, label }) => (
              <li key={to}>
                <Link
                  to={to}
                  className={`block px-3 py-2 rounded-md transition-colors whitespace-nowrap ${
                    location.pathname === to
                      ? "bg-accent/10 text-accent font-medium"
                      : "text-text-muted hover:text-text hover:bg-surface-2"
                  }`}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
