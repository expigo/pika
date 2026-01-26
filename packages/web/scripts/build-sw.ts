import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

async function buildServiceWorker() {
  console.log("🛠️  Building Service Worker manually...");

  const src = path.join(process.cwd(), "src/app/sw.ts");
  const dest = path.join(process.cwd(), "public/sw.js");
  const manifestPath = path.join(process.cwd(), "public/sw-manifest.json");

  // Load the generated precache manifest
  let manifest = "[]";
  if (fs.existsSync(manifestPath)) {
    manifest = fs.readFileSync(manifestPath, "utf-8");
    console.log("📦 Loaded precache manifest from sw-manifest.json");
  } else {
    console.warn("⚠️  No precache manifest found. Using empty array.");
  }

  try {
    await build({
      entryPoints: [src],
      outfile: dest,
      bundle: true,
      minify: process.env.NODE_ENV === "production",
      sourcemap: false,
      platform: "browser",
      target: "es2017",
      define: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
        "self.__SW_MANIFEST": manifest,
      },
      // Serwist relies on process being defined in some contexts
      banner: { js: 'var process = { env: { NODE_ENV: "production" } };' },
    });
    console.log("✅ Service Worker built successfully: public/sw.js");
  } catch (e) {
    console.error("❌ Service Worker build failed:", e);
    process.exit(1);
  }
}

buildServiceWorker();
