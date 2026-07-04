import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    // Default to node (avoids jsdom-under-bun ESM issues). Component tests are
    // named *.rtl.tsx and opt into a DOM via a `// @vitest-environment happy-dom`
    // docblock; their jest-dom/cleanup setup lives in src/test/rtl.tsx (imported
    // only by those files), so the node-env suites stay DOM-free.
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "src/**/*.rtl.tsx"],
    exclude: ["node_modules", "src-tauri"],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", "src-tauri", "src/test"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
