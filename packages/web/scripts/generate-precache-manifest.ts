import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

interface PrecacheEntry {
  url: string;
  revision: string | null;
}

function generateHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("md5").update(content).digest("hex").substring(0, 8);
}

function generatePrecacheManifest() {
  console.log("📦 Generating precache manifest...");

  const manifest: PrecacheEntry[] = [];
  const publicDir = path.join(process.cwd(), "public");
  const nextStaticDir = path.join(process.cwd(), ".next/static");

  // Helper to walk directories
  function walkDir(dir: string, baseDir: string, urlPrefix: string) {
    if (!fs.existsSync(dir)) {
      console.warn(`⚠️  Directory not found: ${dir}`);
      return;
    }

    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        walkDir(filePath, baseDir, urlPrefix);
      } else {
        // Only cache specific file types
        if (file.match(/\.(js|css|woff2?|png|jpg|jpeg|svg|webp|json)$/i)) {
          const relativePath = path.relative(baseDir, filePath);
          const url = `${urlPrefix}/${relativePath.replace(/\\/g, "/")}`;
          const revision = generateHash(filePath);

          manifest.push({ url, revision });
        }
      }
    }
  }

  // 1. Cache Next.js static assets (JS/CSS chunks)
  walkDir(nextStaticDir, path.join(process.cwd(), ".next"), "/_next");

  // 2. Cache public assets (icons, images, manifest)
  const publicAssets = ["manifest.json", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];

  for (const asset of publicAssets) {
    const assetPath = path.join(publicDir, asset);
    if (fs.existsSync(assetPath)) {
      manifest.push({
        url: `/${asset}`,
        revision: generateHash(assetPath),
      });
    }
  }

  // 3. Add critical routes (no revision = use cache busting via network)
  const criticalRoutes = [
    { url: "/", revision: null },
    { url: "/offline", revision: null },
    { url: "/live", revision: null },
    { url: "/my-likes", revision: null },
  ];

  manifest.push(...criticalRoutes);

  // Write manifest to public directory
  const outputPath = path.join(publicDir, "sw-manifest.json");
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

  console.log(`✅ Generated precache manifest: ${manifest.length} entries`);
  console.log(`   - Static assets: ${manifest.filter((e) => e.revision !== null).length}`);
  console.log(`   - Dynamic routes: ${manifest.filter((e) => e.revision === null).length}`);
  console.log(`   - Output: public/sw-manifest.json`);
}

generatePrecacheManifest();
