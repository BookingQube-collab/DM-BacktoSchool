import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { FullscreenToggle } from "@/components/FullscreenToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider, useI18n } from "@/lib/i18n";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          {t("notFoundTitle")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("notFoundBody")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("commonGoHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const { t } = useI18n();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("errorTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("errorBody")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("commonTryAgain")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("commonGoHome")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Smart Start — Doha Mall Back to School" },
      {
        name: "description",
        content:
          "Pick a dream job, take a selfie, and meet your grown-up self as a pilot, doctor, astronaut and more. Smart Start career photo booth at Doha Mall.",
      },
      { property: "og:title", content: "Smart Start — Doha Mall Back to School" },
      {
        property: "og:description",
        content:
          "Pick a dream job, take a selfie, and meet your grown-up self as a pilot, doctor, astronaut and more. Smart Start career photo booth at Doha Mall.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Smart Start — Doha Mall Back to School" },
      { name: "twitter:description", content: "Pick a dream job, take a selfie, and meet your grown-up self as a pilot, doctor, astronaut and more. Smart Start career photo booth at Doha Mall." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1cdcdfc4-f813-4058-b9f3-1ed9ad86469f/id-preview-80d78bc0--68d0e541-2501-4dec-8141-556c215413e1.lovable.app-1784765288357.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1cdcdfc4-f813-4058-b9f3-1ed9ad86469f/id-preview-80d78bc0--68d0e541-2501-4dec-8141-556c215413e1.lovable.app-1784765288357.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <LanguageToggle />
        <FullscreenToggle />
        <Toaster />
      </LanguageProvider>
    </QueryClientProvider>
  );
}
