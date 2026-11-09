import { defineConfig } from "vite";
import { resolve } from "path";

// PWA app (public/ brings sw.js, manifest and icons). Multi-page site (MPA): login + one protected page per module.
// To add a module: new HTML at the root + one entry in `input`.
export default defineConfig({
  root: ".",

  define: {
    // amazon-cognito-identity-js uses `global` internally (Node.js legacy)
    global: "globalThis",
  },

  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        index:     resolve(__dirname, "index.html"),
        chat:      resolve(__dirname, "chat.html"),
        policies:  resolve(__dirname, "policies.html"),
      },
    },
  },

  server: {
    port: 5174,
    open: "/index.html",
  },
});
