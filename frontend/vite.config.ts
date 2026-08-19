import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: fileURLToPath(new URL("../static/modern", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL("./src/main.ts", import.meta.url)),
      formats: ["es"],
      fileName: () => "tvtracker-modern.js"
    }
  }
});
