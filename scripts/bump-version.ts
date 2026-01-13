#!/usr/bin/env bun
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

// 1. Get new version from args
const newVersion = process.argv[2];

if (!newVersion) {
  console.error("❌ Usage: bun scripts/bump-version.ts <new-version> (e.g., 0.2.0)");
  process.exit(1);
}

// Validation regex for SemVer (simple)
if (!/^\d+\.\d+\.\d+(-[a-z0-9]+(\.[0-9]+)?)?$/.test(newVersion)) {
  console.error("❌ Invalid version format. Use semver (e.g. 1.0.0, 0.1.0-rc1)");
  process.exit(1);
}

console.log(`🚀 Bumping version to: ${newVersion}...`);

const rootDir = process.cwd();

// 2. Define files to update
const targets = [
  { path: "package.json", type: "json" },
  { path: "packages/cloud/package.json", type: "json" },
  { path: "packages/desktop/package.json", type: "json" },
  { path: "packages/shared/package.json", type: "json" },
  { path: "packages/web/package.json", type: "json" },
  { path: "packages/desktop/src-tauri/tauri.conf.json", type: "json" },
  { path: "packages/desktop/src-tauri/Cargo.toml", type: "toml" },
];

let updatedCount = 0;

for (const target of targets) {
  const filePath = join(rootDir, target.path);
  try {
    const content = readFileSync(filePath, "utf-8");
    let newContent = content;

    if (target.type === "json") {
      // Use regex to presume formatting
      // specific replace for "version": "x.y.z"
      newContent = content.replace(/"version":\s*"[^"]+"/, `"version": "${newVersion}"`);
    } else if (target.type === "toml") {
      // specific replace for version = "x.y.z" at the top level (hopefully)
      // Cargo.toml can have multiple versions for dependencies.
      // We target the [package] section's version.
      // A simple regex approach: replace the first occurrence of version = "..."
      // This is usually safe for the package version at the top.
      newContent = content.replace(/^version\s*=\s*"[^"]+"/m, `version = "${newVersion}"`);
    }

    if (content !== newContent) {
      writeFileSync(filePath, newContent);
      console.log(`✅ Updated ${target.path}`);
      updatedCount++;
    } else {
      console.log(`⚠️  No change needed for ${target.path} (already ${newVersion}?)`);
    }
  } catch (e) {
    console.error(`❌ Failed to update ${target.path}:`, e);
  }
}

console.log(`\n🎉 Success! Updated ${updatedCount} files to version ${newVersion}.`);
console.log(
  `👉 Don't forget to run: git commit -am "chore: bump version to ${newVersion}" && git tag v${newVersion}`,
);
