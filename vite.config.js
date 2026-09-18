import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * GitHub Pages serves a project site from a subpath — https://user.github.io/gas_station/
 * — not from the domain root, so every asset URL has to be rebased. The path
 * is taken from an env var so the same build works for a user/org site at the
 * root (BASE_PATH=/) or from a different repository name, without editing
 * this file.
 */
const base = process.env.BASE_PATH || "/gas_station/";

/**
 * GitHub Pages has no rewrite rules, so a deep link like /gas_station/owner/stock
 * is a request for a file that does not exist and Pages answers with 404.html.
 * Shipping a copy of index.html under that name hands the URL to the router
 * instead, which is the conventional way to run a history-mode SPA on Pages.
 */
function spaFallback() {
  return {
    name: "spa-fallback-404",
    apply: "build",
    closeBundle() {
      const index = resolve(__dirname, "dist/index.html");
      if (existsSync(index)) {
        copyFileSync(index, resolve(__dirname, "dist/404.html"));
      }
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), spaFallback()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Allow the sandboxed preview host (and any tunnel) to reach the dev server.
    allowedHosts: true,
  },
});
