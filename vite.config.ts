// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin, ViteDevServer } from "vite";

/**
 * Vite "ready" does not load src/server.ts until a request hits. The booth
 * print worker lives in that module, so listen() must start it explicitly.
 */
function boothPrintWorkerPlugin(): Plugin {
  let booted = false;
  const boot = (server: ViteDevServer) => {
    if (booted) return;
    if (typeof process === "undefined" || process.platform !== "win32") return;
    booted = true;
    console.log("[print-worker] Vite listening - loading print worker");
    void server
      .ssrLoadModule("/src/lib/print-worker.server.ts")
      .then((mod: { startPrintWorker?: () => void }) => {
        mod.startPrintWorker?.();
      })
      .catch((err: unknown) => {
        booted = false;
        console.error("[print-worker] vite listen boot failed:", err);
      });
  };

  return {
    name: "booth-print-worker",
    apply: "serve",
    configureServer(server) {
      const onListening = () => boot(server);
      if (server.httpServer?.listening) onListening();
      else server.httpServer?.once("listening", onListening);
      return () => {
        if (server.httpServer?.listening) onListening();
        else server.httpServer?.once("listening", onListening);
      };
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Accept Next-style public prefixes already present on Vercel, not only VITE_*.
  vite: {
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    plugins: [boothPrintWorkerPlugin()],
  },
  // Lovable defaults Nitro to cloudflare; on Vercel force the vercel preset.
  nitro: process.env.VERCEL
    ? { preset: "vercel" }
    : { defaultPreset: "cloudflare-module" },
});
