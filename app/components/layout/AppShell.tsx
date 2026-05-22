import { Link, Outlet, useNavigate } from "react-router";
import { Moon, Sun, Search, Menu, X, Sparkles } from "lucide-react";
import { useState } from "react";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { DensityProvider } from "@/lib/density";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabase.client";
import { cn } from "@/lib/utils";

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
  const [open, setOpen] = useState(false);

  if (loading) {
    return <div className="w-8 h-8 rounded-full bg-surface-2 animate-pulse" />;
  }

  if (!user) {
    return (
      <Link
        to="/submit"
        className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity"
      >
        Sign in
      </Link>
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

  return (
    <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur border-b border-border">
      <div className="container flex items-center justify-between h-14 gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 font-bold text-text shrink-0">
          <Sparkles size={18} className="text-accent" />
          <span>AI Wiki</span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-1 text-sm">
          <Link
            to="/tools"
            className="px-3 py-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            Browse
          </Link>
          <Link
            to="/compare"
            className="px-3 py-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            Compare
          </Link>
          <Link
            to="/chat"
            className="px-3 py-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            Ask AI
          </Link>
        </nav>

        {/* Right side actions */}
        <div className="flex items-center gap-1">
          <Link
            to="/search"
            className="p-2 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            aria-label="Search"
          >
            <Search size={18} />
          </Link>
          <ThemeToggle />
          <Link
            to="/submit"
            className="hidden md:inline-flex text-sm font-medium px-3 py-1.5 rounded-md border border-border text-text-muted hover:text-text hover:border-text-muted transition-colors"
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
        <div className="md:hidden border-t border-border bg-bg py-2 px-4 flex flex-col gap-1 text-sm">
          <Link
            to="/tools"
            className="py-2 text-text-muted hover:text-text"
            onClick={() => setMobileOpen(false)}
          >
            Browse
          </Link>
          <Link
            to="/compare"
            className="py-2 text-text-muted hover:text-text"
            onClick={() => setMobileOpen(false)}
          >
            Compare
          </Link>
          <Link
            to="/chat"
            className="py-2 text-text-muted hover:text-text"
            onClick={() => setMobileOpen(false)}
          >
            Ask AI
          </Link>
          <Link
            to="/submit"
            className="py-2 text-text-muted hover:text-text"
            onClick={() => setMobileOpen(false)}
          >
            Submit tool
          </Link>
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border mt-auto py-8 text-sm text-text-muted">
      <div className="container flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-accent" />
          <span className="font-medium text-text">AI Wiki</span>
          <span>— community-curated AI tool directory</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/tools" className="hover:text-text transition-colors">
            Browse
          </Link>
          <Link to="/submit" className="hover:text-text transition-colors">
            Submit
          </Link>
          <Link to="/chat" className="hover:text-text transition-colors">
            Ask AI
          </Link>
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
        </div>
      </DensityProvider>
    </ThemeProvider>
  );
}

export { cn };
