import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const proxy: Record<string, ProxyOptions> = {
  "/api": {
    target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3000",
    changeOrigin: true,
    configure(server) {
      server.on("proxyReq", (proxyReq, req) => {
        const origin = req.headers.origin;
        if (origin && req.headers.host) {
          try {
            if (new URL(origin).host === req.headers.host) proxyReq.removeHeader("origin");
          } catch {
            // Preserve invalid origins for the API to reject.
          }
        }
      });
    },
  },
};

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react(), {
    name: "cafm-offline-assets",
    generateBundle(_, bundle) {
      const assets = Object.keys(bundle).filter((name) => /\.(js|css|woff2?|ttf|svg|png|webp)$/.test(name));
      this.emitFile({ type: "asset", fileName: "offline-assets.json", source: JSON.stringify(assets) });
    },
  }],
  server: {
    port: 3001,
    host: true,
    allowedHosts: true,
    proxy,
  },
  preview: {
    port: 3001,
    host: true,
    allowedHosts: true,
    proxy,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
