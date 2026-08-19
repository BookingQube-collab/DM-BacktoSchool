import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AdminRole } from "@/lib/admin-roles";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/admin/login")({
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/auth", { credentials: "include" });
      if (!cancelled && res.ok) {
        const data = (await res.json()) as { role?: AdminRole; home?: string };
        navigate({
          to:
            data.home === "/admin/registrations"
              ? "/admin/registrations"
              : "/admin",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as {
        error?: string;
        role?: AdminRole;
        home?: string;
      };
      if (!res.ok) {
        setError(data.error || t("adminLoginFailed"));
        return;
      }
      navigate({
        to:
          data.home === "/admin/registrations"
            ? "/admin/registrations"
            : "/admin",
      });
    } catch {
      setError(t("commonCouldNotReachServer"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-secondary/50 p-8 shadow-xl backdrop-blur">
        <img
          src="/smart-start-logo.png"
          alt="Smart Start"
          className="mx-auto mb-6 h-auto w-[200px] max-w-full object-contain drop-shadow-lg"
        />
        <p className="font-display text-3xl font-bold text-foreground">{t("adminLoginTitle")}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("adminLoginSubtitle")}
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">{t("adminUsername")}</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("adminPassword")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("adminSigningIn") : t("adminSignIn")}
          </Button>
        </form>
      </div>
    </div>
  );
}
