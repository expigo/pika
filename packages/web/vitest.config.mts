import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Web runs a DUAL test setup: `bun test` for pure `*.test.ts` modules (fast, no
// DOM) and this vitest config for React component tests named `*.rtl.tsx` (happy-dom
// + RTL). Bun's runner only globs `.test.`/`.spec.` files, so it ignores `.rtl.tsx`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.rtl.tsx"],
    setupFiles: ["./src/test/setup-rtl.tsx"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
