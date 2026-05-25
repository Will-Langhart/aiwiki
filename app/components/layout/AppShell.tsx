import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { Moon, Sun, Search, Menu, X, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { DensityProvider } from "@/lib/density";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabase.client";
import { cn } from "@/lib/utils";
import { SearchCommandPalette } from "@/components/search/SearchCommandPalette";
import { CompareTray } from "@/components/compare/CompareTray";
import { NotificationBell } from "@/components/notification/NotificationBell";
import { AuthModal } from "@/components/auth/AuthModal";
import { useAuthModalStore } from "@/stores/auth-modal";

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className="p-2 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function UserMenu() {
  const { user, profile, isAdmin, loading } = useCurrentUser();
  const navigate = useNavigate();
  const { openModal } = useAuthModalStore();
  const [open, setOpen] = useState(false);

  if (loading) {
    return <div className="w-8 h-8 rounded-full bg-surface-2 animate-pulse" />;
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => openModal(window.location.pathname)}
        className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity"
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 p-1 rounded-full hover:bg-surface-2 transition-colors"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.display_name ?? profile.username}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-accent-fg text-sm font-semibold">
            {(profile?.display_name ?? profile?.username ?? "U")[0].toUpperCase()}
          </div>
        )}
      </button>

      {open && (
        <>
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: overlay backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 w-48 bg-surface border border-border rounded-lg shadow-lg py-1 text-sm">
            <div className="px-3 py-2 border-b border-border">
              <div className="font-medium truncate">
                {profile?.display_name ?? profile?.username}
              </div>
              <div className="text-text-muted text-xs truncate">{user.email}</div>
            </div>
            <Link
              to="/account"
              className="block px-3 py-2 hover:bg-surface-2 transition-colors"
              onClick={() => setOpen(false)}
            >
              Account
            </Link>
            <Link
              to="/account/bookmarks"
              className="block px-3 py-2 hover:bg-surface-2 transition-colors"
              onClick={() => setOpen(false)}
            >
              Bookmarks
            </Link>
            <Link
              to="/account/drafts"
              className="block px-3 py-2 hover:bg-surface-2 transition-colors"
              onClick={() => setOpen(false)}
            >
              My submissions
            </Link>
            {isAdmin && (
              <>
                <div className="border-t border-border my-1" />
                <Link
                  to="/admin"
                  className="block px-3 py-2 hover:bg-surface-2 transition-colors text-accent"
                  onClick={() => setOpen(false)}
                >
                  Admin
                </Link>
              </>
            )}
            <div className="border-t border-border my-1" />
            <button
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-surface-2 transition-colors text-danger"
              onClick={async () => {
                await supabase.auth.signOut();
                setOpen(false);
                navigate("/");
              }}
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { user } = useCurrentUser();

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <SearchCommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <header className="sticky top-0 z-40 bg-bg/85 backdrop-blur-md border-b border-border/80 shadow-[var(--shadow-nav)]">
        <div className="container flex items-center justify-between h-14 gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 font-bold text-text shrink-0 group">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center transition-opacity group-hover:opacity-80"
              style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}>
              <Sparkles size={14} className="text-white" />
            </div>
            <span className="tracking-tight">AI Wiki</span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-0.5 text-sm">
            {[
              { to: "/tools", label: "Browse" },
              { to: "/compare", label: "Compare" },
              { to: "/chat", label: "Ask AI" },
            ].map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "px-3 py-1.5 rounded-md transition-colors outline-none",
                    isActive
                      ? "text-text bg-surface-2 font-medium"
                      : "text-text-muted hover:text-text hover:bg-surface-2"
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Right side actions */}
          <div className="flex items-center gap-1.5">
            {/* Search — opens palette */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-surface text-text-muted hover:text-text hover:border-text-subtle transition-all text-sm"
              aria-label="Search (⌘K)"
            >
              <Search size={13} />
              <span className="text-xs text-text-subtle">Search…</span>
              <kbd className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-surface-2 border border-border font-mono text-text-subtle">⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="md:hidden p-2 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
              aria-label="Search"
            >
              <Search size={18} />
            </button>
            <ThemeToggle />
            {user && <NotificationBell userId={user.id} />}
            <Link
              to="/submit"
              className="hidden md:inline-flex text-sm font-medium px-3 py-1.5 rounded-lg border border-border text-text-muted hover:text-text hover:border-text-subtle transition-colors"
            >
              Submit tool
            </Link>
            <UserMenu />
            {/* Mobile menu toggle */}
            <button
              type="button"
              className="md:hidden p-2 rounded-md text-text-muted hover:bg-surface-2"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Menu"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border bg-bg/95 backdrop-blur-md py-2 px-4 flex flex-col gap-0.5 text-sm">
            <Link
              to="/tools"
              className="py-2.5 text-text-muted hover:text-text transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              Browse
            </Link>
            <Link
              to="/compare"
              className="py-2.5 text-text-muted hover:text-text transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              Compare
            </Link>
            <Link
              to="/chat"
              className="py-2.5 text-text-muted hover:text-text transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              Ask AI
            </Link>
            <Link
              to="/submit"
              className="py-2.5 text-text-muted hover:text-text transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              Submit tool
            </Link>
          </div>
        )}
      </header>
    </>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border mt-auto text-sm text-text-muted">
      <div className="container py-10">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-8">
          {/* Brand */}
          <div className="space-y-2 max-w-xs">
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
              >
                <Sparkles size={12} className="text-white" />
              </div>
              <span className="font-semibold text-text">AI Wiki</span>
            </div>
            <p className="text-xs text-text-subtle leading-relaxed">
              Community-curated directory of AI tools. Discover, compare, and find the right tool for every workflow.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-col sm:flex-row gap-8">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-text-subtle uppercase tracking-widest">Explore</p>
              <div className="space-y-1.5">
                <Link to="/tools" className="block hover:text-text transition-colors">Browse tools</Link>
                <Link to="/compare" className="block hover:text-text transition-colors">Compare</Link>
                <Link to="/chat" className="block hover:text-text transition-colors">Ask AI Wiki</Link>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-text-subtle uppercase tracking-widest">Contribute</p>
              <div className="space-y-1.5">
                <Link to="/submit" className="block hover:text-text transition-colors">Submit a tool</Link>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border/60 mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-text-subtle">© {new Date().getFullYear()} AI Wiki. Free to use.</p>
        </div>
      </div>
    </footer>
  );
}

export default function AppShell() {
  return (
    <ThemeProvider>
      <DensityProvider>
        <div className="min-h-screen flex flex-col bg-bg text-text">
          <Nav />
          <main className="flex-1">
            <Outlet />
          </main>
          <Footer />
          {/* Global compare tray — floats over all pages */}
          <CompareTray />
          {/* Global auth modal — opened from anywhere via useAuthModalStore */}
          <AuthModal />
        </div>
      </DensityProvider>
    </ThemeProvider>
  );
}

export { cn };
