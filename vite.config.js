import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Allow the sandboxed preview host (and any tunnel) to reach the dev server.
    allowedHosts: true,
  },
});
