import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const API_PROXY_TARGET = "http://127.0.0.1:5123";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const useApiProxy = env.VITE_API_BASE_URL === "/jbhm";

  return {
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: mode === "lan" ? "0.0.0.0" : "127.0.0.1",
    proxy: useApiProxy
      ? {
          "/jbhm": {
            target: API_PROXY_TARGET,
            changeOrigin: true,
            rewrite: (p) => p.replace(/^\/jbhm/, ""),
          },
        }
      : undefined,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
};
});
