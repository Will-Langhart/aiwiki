import { Outlet, Link, useLocation } from "react-router";
import { User, Bookmark, FileEdit, Bell, Settings, Lock } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthModalStore } from "@/stores/auth-modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLinks = [
  { to: "/account",                  label: "Profile",         icon: User },
  { to: "/account/bookmarks",        label: "Bookmarks",       icon: Bookmark },
  { to: "/account/drafts",           label: "My submissions",  icon: FileEdit },
  { to: "/account/notifications",    label: "Notifications",   icon: Bell },
  { to: "/account/preferences",      label: "Preferences",     icon: Settings },
];

export default function AccountLayout() {
  const { user, loading } = useCurrentUser();
  const location = useLocation();
  const openAuth = useAuthModalStore((s) => s.openModal);

  if (loading) {
    return (
      <div className="container py-12 flex justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container py-24 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-5">
          <Lock size={22} className="text-accent" />
        </div>
        <h1 className="text-2xl font-bold text-text mb-2">Sign in required</h1>
        <p className="text-text-muted text-sm mb-6 max-w-xs">
          Create a free account to save bookmarks, submit tools, and track ratings.
        </p>
        <Button onClick={() => openAuth()}>Sign in</Button>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar nav */}
        <nav className="md:w-52 shrink-0">
          <p className="text-[10px] font-semibold text-text-subtle uppercase tracking-widest px-3 mb-2 hidden md:block">
            Account
          </p>
          <ul className="flex flex-row md:flex-col gap-0.5 text-sm overflow-x-auto md:overflow-visible">
            {navLinks.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to;
              return (
                <li key={to}>
                  <Link
                    to={to}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap",
                      active
                        ? "bg-accent/10 text-accent font-medium"
                        : "text-text-muted hover:text-text hover:bg-surface-2"
                    )}
                  >
                    <Icon
                      size={14}
                      className={cn(active ? "text-accent" : "text-text-subtle")}
                    />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
