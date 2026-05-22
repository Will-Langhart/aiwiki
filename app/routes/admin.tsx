import { Outlet, Link, useLocation } from "react-router";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function AdminLayout() {
  const { isAdmin, loading } = useCurrentUser();
  const location = useLocation();

  if (loading) {
    return (
      <div className="container py-12 flex justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Access denied</h1>
        <p className="text-text-muted">This area is for admins only.</p>
      </div>
    );
  }

  const navLinks = [
    { to: "/admin", label: "Dashboard" },
    { to: "/admin/submissions", label: "Submissions" },
    { to: "/admin/flags", label: "Flags" },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-border p-4 shrink-0 hidden md:block">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 px-3">Admin</p>
        <nav className="flex flex-col gap-1 text-sm">
          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`px-3 py-2 rounded-md transition-colors ${
                location.pathname === to
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-text-muted hover:text-text hover:bg-surface-2"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 min-w-0 p-6">
        <Outlet />
      </div>
    </div>
  );
}
