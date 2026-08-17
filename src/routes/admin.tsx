import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Camera,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react";
import {
  canVisitAdminPath,
  displayNameForRole,
  homePathForRole,
  navKeysForRole,
  pagesCan,
  type AdminNavKey,
  type AdminRole,
} from "@/lib/admin-roles";
import { AdminSessionContext } from "@/lib/admin-session";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const SIDEBAR_COLLAPSED_KEY = "admin-sidebar-collapsed";

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLogin = pathname === "/admin/login";
  const navigate = useNavigate();
  const { t } = useI18n();
  const [checking, setChecking] = useState(!isLogin);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<AdminRole>("admin");
  const [pages, setPages] = useState<AdminNavKey[]>([
    ...navKeysForRole("admin"),
  ]);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);

  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
    setSidebarReady(true);
  }, []);

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
      const data = (await res.json()) as {
        username?: string;
        role?: AdminRole;
        pages?: AdminNavKey[];
        displayName?: string;
        home?: string;
      };
      const nextRole =
        data.role === "operation" || data.role === "dohamall" || data.role === "admin"
          ? data.role
          : "admin";
      const nextPages =
        Array.isArray(data.pages) && data.pages.length > 0
          ? data.pages
          : [...navKeysForRole(nextRole)];
      setRole(nextRole);
      setPages(nextPages);
      setUsername(data.displayName || data.username || "admin");
      setChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isLogin, navigate, pathname]);

  useEffect(() => {
    if (isLogin || checking) return;
    if (!canVisitAdminPath(role, pathname, pages)) {
      navigate({ to: homePathForRole(role, pages) });
    }
  }, [checking, isLogin, navigate, pathname, pages, role]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      writeSidebarCollapsed(next);
      return next;
    });
  }

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
        <p className="font-sans text-muted-foreground">{t("adminChecking")}</p>
      </div>
    );
  }

  const nav = [
    { to: "/admin", key: "dashboard" as const, label: t("adminDashboard"), icon: LayoutDashboard, exact: true },
    { to: "/admin/registrations", key: "registrations" as const, label: t("adminRegistrations"), icon: ClipboardList, exact: false },
    { to: "/admin/photos", key: "photos" as const, label: t("adminPhotos"), icon: Camera, exact: false },
    { to: "/admin/companies", key: "stores" as const, label: t("adminStores"), icon: Building2, exact: false },
    { to: "/admin/settings", key: "settings" as const, label: t("adminSettings"), icon: Settings, exact: false },
  ].filter((item) => pagesCan(pages, item.key));

  const session = useMemo(
    () => ({
      username: username ?? displayNameForRole(role, "admin"),
      role,
      pages,
    }),
    [pages, role, username],
  );

  const itemClass = (active: boolean) =>
    cn(
      "inline-flex items-center rounded-xl text-sm font-semibold transition-colors",
      collapsed ? "size-10 justify-center" : "w-full gap-2 px-3 py-2",
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
    );

  const expandLabel = t("adminExpand");
  const collapseLabel = t("adminCollapse");

  return (
    <AdminSessionContext.Provider value={session}>
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className={cn(
          "sticky top-0 z-20 flex h-svh shrink-0 flex-col overflow-hidden border-r border-border bg-secondary/40",
          collapsed ? "w-16" : "w-64",
          sidebarReady && "transition-[width] duration-300 ease-in-out",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-start gap-2",
            collapsed ? "flex-col items-center justify-center px-2 pt-4 pb-3" : "justify-between p-5 pb-4",
          )}
        >
          {collapsed ? (
            <img
              src="/smart-start-logo.png"
              alt="Smart Start"
              className="h-10 w-10 object-contain drop-shadow-md"
            />
          ) : null}
          {!collapsed && (
            <div className="min-w-0">
              <img
                src="/smart-start-logo.png"
                alt="Smart Start"
                className="h-auto w-[148px] max-w-full object-contain drop-shadow-md"
              />
              <p className="mt-2 truncate text-sm text-muted-foreground">
                {t("adminSignedIn", { username: username ?? "admin" })}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? expandLabel : collapseLabel}
            title={collapsed ? expandLabel : collapseLabel}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>

        <nav
          className={cn(
            "flex flex-1 flex-col gap-1 overflow-y-auto",
            collapsed ? "items-center px-2" : "px-3",
          )}
        >
          {nav.map((item) => {
            const active = item.exact
              ? pathname === item.to || pathname === `${item.to}/`
              : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={item.label}
                className={itemClass(active)}
              >
                <Icon className="size-4 shrink-0" />
                <span className={cn(collapsed && "sr-only")}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div
          className={cn(
            "mt-auto flex shrink-0 flex-col gap-1 pb-4",
            collapsed ? "items-center px-2" : "px-3",
          )}
        >
          <Link
            to="/register"
            title={t("adminOpenDesk")}
            className={cn(
              itemClass(false),
              !collapsed && "text-accent hover:text-accent",
            )}
          >
            <Monitor className="size-4 shrink-0" />
            <span className={cn(collapsed && "sr-only")}>{t("adminOpenDesk")}</span>
          </Link>
          <button
            type="button"
            onClick={logout}
            title={t("adminLogout")}
            className={itemClass(false)}
          >
            <LogOut className="size-4 shrink-0" />
            <span className={cn(collapsed && "sr-only")}>{t("adminLogout")}</span>
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6 md:p-8">
        <Outlet />
      </main>
    </div>
    </AdminSessionContext.Provider>
  );
}
