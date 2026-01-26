/**
 * PWA Verification Script
 * Runs post-build to ensure all PWA components are correctly configured
 */

import fs from "node:fs";
import path from "node:path";

const errors: string[] = [];
const warnings: string[] = [];
const success: string[] = [];

function checkFile(filePath: string, description: string): boolean {
  const fullPath = path.join(process.cwd(), filePath);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    success.push(`✅ ${description}: ${filePath} (${(stats.size / 1024).toFixed(1)}KB)`);
    return true;
  }
  errors.push(`❌ ${description}: ${filePath} not found`);
  return false;
}

function checkManifest() {
  const manifestPath = path.join(process.cwd(), "public/manifest.json");
  if (!checkFile("public/manifest.json", "PWA Manifest")) return;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  // Check required fields
  const required = ["name", "short_name", "start_url", "display", "icons"];
  for (const field of required) {
    if (!manifest[field]) {
      errors.push(`❌ Manifest missing required field: ${field}`);
    }
  }

  // Check icons
  if (manifest.icons && manifest.icons.length > 0) {
    success.push(`✅ Manifest has ${manifest.icons.length} icons defined`);

    // Verify maskable icon exists
    const hasMaskable = manifest.icons.some(
      (icon: { purpose?: string }) => icon.purpose === "maskable",
    );
    if (hasMaskable) {
      success.push("✅ Maskable icon defined");
    } else {
      warnings.push("⚠️  No maskable icon defined (Android may crop icon)");
    }
  } else {
    errors.push("❌ Manifest has no icons defined");
  }

  // Check shortcuts
  if (manifest.shortcuts && manifest.shortcuts.length > 0) {
    success.push(`✅ App shortcuts: ${manifest.shortcuts.length}`);
  }
}

function checkServiceWorker() {
  if (!checkFile("public/sw.js", "Service Worker")) return;

  const swContent = fs.readFileSync(path.join(process.cwd(), "public/sw.js"), "utf-8");

  // Check for Serwist
  if (swContent.includes("Serwist")) {
    success.push("✅ Service Worker uses Serwist");
  } else {
    warnings.push("⚠️  Service Worker doesn't contain Serwist code");
  }

  // Check for NetworkOnly strategy
  if (swContent.includes("NetworkOnly")) {
    success.push("✅ NetworkOnly strategy found (for /api and /live routes)");
  }

  // Check precache manifest
  if (swContent.includes("self.__SW_MANIFEST")) {
    success.push("✅ Precache manifest variable found");
  } else {
    errors.push("❌ Precache manifest not embedded");
  }

  // Check size
  const swSize = fs.statSync(path.join(process.cwd(), "public/sw.js")).size;
  if (swSize > 10 * 1024) {
    success.push(`✅ Service Worker has reasonable size: ${(swSize / 1024).toFixed(1)}KB`);
  } else {
    warnings.push(`⚠️  Service Worker seems small: ${(swSize / 1024).toFixed(1)}KB`);
  }
}

function checkPrecacheManifest() {
  if (!checkFile("public/sw-manifest.json", "Precache Manifest")) return;

  const manifestContent = fs.readFileSync(
    path.join(process.cwd(), "public/sw-manifest.json"),
    "utf-8",
  );
  const manifest = JSON.parse(manifestContent);

  if (Array.isArray(manifest) && manifest.length > 0) {
    success.push(`✅ Precache manifest has ${manifest.length} entries`);

    // Count assets vs routes
    const withRevision = manifest.filter(
      (e: { revision: string | null }) => e.revision !== null,
    ).length;
    const withoutRevision = manifest.filter(
      (e: { revision: string | null }) => e.revision === null,
    ).length;

    success.push(`   - Static assets: ${withRevision}`);
    success.push(`   - Dynamic routes: ${withoutRevision}`);
  } else {
    errors.push("❌ Precache manifest is empty");
  }
}

function checkRegistration() {
  const layoutPath = path.join(process.cwd(), "src/app/layout.tsx");
  if (!fs.existsSync(layoutPath)) {
    warnings.push("⚠️  Could not verify SW registration (layout.tsx not found)");
    return;
  }

  const layoutContent = fs.readFileSync(layoutPath, "utf-8");

  if (layoutContent.includes("RegisterPWA")) {
    success.push("✅ RegisterPWA component imported in layout");
  } else {
    errors.push("❌ RegisterPWA component not imported in layout.tsx");
  }

  // Check if the component file exists
  const componentPath = path.join(process.cwd(), "src/components/pwa/RegisterPWA.tsx");
  if (fs.existsSync(componentPath)) {
    const componentContent = fs.readFileSync(componentPath, "utf-8");
    if (componentContent.includes("serviceWorker") && componentContent.includes("register")) {
      success.push("✅ Service Worker registration code found");
    } else {
      errors.push("❌ RegisterPWA component doesn't register service worker");
    }
  } else {
    errors.push("❌ RegisterPWA component file not found");
  }
}

function checkIcons() {
  const requiredIcons = ["icon-192.png", "icon-512.png", "icon-maskable-512.png"];

  for (const icon of requiredIcons) {
    checkFile(`public/${icon}`, `Icon: ${icon}`);
  }
}

// Run all checks
console.log("🔍 PWA Verification Starting...\n");

checkManifest();
checkServiceWorker();
checkPrecacheManifest();
checkRegistration();
checkIcons();

// Print results
console.log(`\n${"=".repeat(60)}`);

if (success.length > 0) {
  console.log("\n✅ SUCCESS:");
  for (const msg of success) {
    console.log(msg);
  }
}

if (warnings.length > 0) {
  console.log("\n⚠️  WARNINGS:");
  for (const msg of warnings) {
    console.log(msg);
  }
}

if (errors.length > 0) {
  console.log("\n❌ ERRORS:");
  for (const msg of errors) {
    console.log(msg);
  }
  console.log(`\n${"=".repeat(60)}`);
  console.log("❌ PWA verification FAILED");
  process.exit(1);
}

console.log(`\n${"=".repeat(60)}`);
console.log("✅ PWA verification PASSED");
console.log("🚀 Your PWA is ready for production!");
