import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendTarget = process.env.VITE_BACKEND_TARGET ?? "http://127.0.0.1:3000";

export default defineConfig({
  root: "src/client",
  plugins: [react()],
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/auth": backendTarget,
      "/health": backendTarget,
      "/me": backendTarget,
      "/applications": backendTarget,
      "/personnel": backendTarget,
    },
  },
});
