import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/web"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "./dist/web"),
    emptyOutDir: false, // This prevents deleting mcp-server.js during builds
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "./src/web/index.html"),
        settingsCopy: path.resolve(__dirname, "./src/web/settings-copy.html"),
      },
    },
  },
  root: path.resolve(__dirname, "./src/web"),
});
