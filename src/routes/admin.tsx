import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Camera, ClipboardList, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLogin = pathname === "/admin/login";
  const navigate = useNavigate();
  const [checking, setChecking] = useState(!isLogin);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (isLogin) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setChecking(true);
      const res = await fetch("/api/admin/auth", { credentials: "include" });
      if (cancelled) return;
      if (!res.ok) {
        navigate({ to: "/admin/login" });
        return;
      }
      const data = (await res.json()) as { username?: string };
      setUsername(data.username ?? "admin");
      setChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isLogin, navigate, pathname]);

  async function logout() {
    await fetch("/api/admin/auth", { method: "DELETE", credentials: "include" });
    navigate({ to: "/admin/login" });
  }

  if (isLogin) {
    return <Outlet />;
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="font-sans text-muted-foreground">Checking session…</p>
      </div>
    );
  }

  const nav = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/admin/registrations", label: "Registrations", icon: ClipboardList, exact: false },
    { to: "/admin/photos", label: "Photos", icon: Camera, exact: false },
    { to: "/admin/companies", label: "Stores", icon: Building2, exact: false },
    { to: "/admin/settings", label: "Settings", icon: Settings, exact: false },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col md:flex-row">
        <aside className="border-b border-border bg-secondary/40 p-5 md:w-64 md:border-b-0 md:border-r">
          <div className="mb-8">
            <p className="font-display text-xl font-bold">Doha Mall Admin</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as {username}
            </p>
          </div>
          <nav className="flex flex-wrap gap-2 md:flex-col">
            {nav.map((item) => {
              const active = item.exact
                ? pathname === item.to || pathname === `${item.to}/`
                : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 space-y-2">
            <Link
              to="/register"
              className="block rounded-xl px-3 py-2 text-sm font-semibold text-accent hover:bg-secondary"
            >
              Open registration desk
            </Link>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="size-4" />
              Log out
            </button>
          </div>
        </aside>
        <main className="flex-1 p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
