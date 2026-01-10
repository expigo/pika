/**
 * Pika! Sidecar Build Script
 * Compiles the Python sidecar using PyInstaller and places it in the correct
 * location for Tauri to bundle it.
 *
 * Usage: bun run scripts/build-sidecar.ts
 */

import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const SCRIPT_DIR = import.meta.dir;
const DESKTOP_ROOT = join(SCRIPT_DIR, "..");
const PYTHON_SRC = join(DESKTOP_ROOT, "python-src");
const PYTHON_VENV = join(PYTHON_SRC, ".venv");
const TAURI_DIR = join(DESKTOP_ROOT, "src-tauri");
const BINARIES_DIR = join(TAURI_DIR, "binaries");

/**
 * Get the path to a command within the Python virtual environment.
 */
function getVenvBinPath(command: string): string {
  const isWindows = process.platform === "win32";
  const binDir = isWindows ? "Scripts" : "bin";
  const ext = isWindows ? ".exe" : "";
  return join(PYTHON_VENV, binDir, `${command}${ext}`);
}

/**
 * Find rustc executable in common locations.
 */
function findRustc(): string {
  const isWindows = process.platform === "win32";
  const ext = isWindows ? ".exe" : "";
  const home = process.env["HOME"] || process.env["USERPROFILE"] || "";

  const candidates = [
    join(home, ".cargo", "bin", `rustc${ext}`),
    `/usr/local/bin/rustc${ext}`,
    `/opt/homebrew/bin/rustc${ext}`,
    `rustc${ext}`, // fallback to PATH
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Return "rustc" and let it fail with a clear error if not found
  return "rustc";
}

/**
 * Detect the host's target triple using rustc.
 * Example output: x86_64-apple-darwin, aarch64-apple-darwin, x86_64-pc-windows-msvc
 */
async function getTargetTriple(): Promise<string> {
  const rustcPath = findRustc();
  console.log(`🔧 Using rustc at: ${rustcPath}`);

  const proc = Bun.spawn([rustcPath, "-vV"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(
      `Failed to run rustc -vV. Is Rust installed?\n` +
        `Tried: ${rustcPath}\n` +
        `Install Rust from: https://rustup.rs`,
    );
  }

  // Parse the output to find the host line
  // Example: host: aarch64-apple-darwin
  const hostLine = output.split("\n").find((line) => line.startsWith("host:"));

  if (!hostLine) {
    throw new Error("Could not find host triple in rustc output");
  }

  const targetTriple = hostLine.replace("host:", "").trim();
  console.log(`🎯 Detected target triple: ${targetTriple}`);

  return targetTriple;
}

/**
 * Verify that the Python virtual environment exists and has PyInstaller.
 */
function checkPythonVenv(): void {
  const pyinstallerPath = getVenvBinPath("pyinstaller");

  if (!existsSync(PYTHON_VENV)) {
    throw new Error(
      `Python virtual environment not found at: ${PYTHON_VENV}\n` +
        "Please run:\n" +
        "  cd python-src && uv venv && uv pip install -r requirements.txt",
    );
  }

  if (!existsSync(pyinstallerPath)) {
    throw new Error(
      `PyInstaller not found in venv at: ${pyinstallerPath}\n` +
        "Please run:\n" +
        "  cd python-src && uv pip install -r requirements.txt",
    );
  }

  console.log(`✅ Found PyInstaller at: ${pyinstallerPath}`);
}

/**
 * Run PyInstaller to compile the Python sidecar.
 */
async function buildSidecar(): Promise<void> {
  console.log("📦 Building Python sidecar with PyInstaller...");

  const pyinstallerPath = getVenvBinPath("pyinstaller");
  const mainPyPath = join(PYTHON_SRC, "main.py");

  const proc = Bun.spawn([pyinstallerPath, "--onefile", "--name", "api", mainPyPath], {
    cwd: SCRIPT_DIR,
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`PyInstaller failed with exit code ${exitCode}`);
  }

  console.log("✅ PyInstaller build completed");
}

/**
 * Move the compiled binary to the Tauri binaries directory with the correct name.
 */
async function moveBinary(targetTriple: string): Promise<void> {
  // Ensure binaries directory exists
  if (!existsSync(BINARIES_DIR)) {
    console.log(`📁 Creating binaries directory: ${BINARIES_DIR}`);
    mkdirSync(BINARIES_DIR, { recursive: true });
  }

  // Determine source and destination paths
  const isWindows = process.platform === "win32";
  const binaryExt = isWindows ? ".exe" : "";
  const sourcePath = join(SCRIPT_DIR, "dist", `api${binaryExt}`);
  const destPath = join(BINARIES_DIR, `api-${targetTriple}${binaryExt}`);

  if (!existsSync(sourcePath)) {
    throw new Error(`Built binary not found at: ${sourcePath}`);
  }

  // Move the binary
  console.log(`📦 Moving binary to: ${destPath}`);
  renameSync(sourcePath, destPath);

  console.log("✅ Binary moved successfully");
}

/**
 * Clean up PyInstaller artifacts.
 */
function cleanup(): void {
  console.log("🧹 Cleaning up build artifacts...");

  const artifactsToRemove = [
    join(SCRIPT_DIR, "dist"),
    join(SCRIPT_DIR, "build"),
    join(SCRIPT_DIR, "api.spec"),
  ];

  for (const artifact of artifactsToRemove) {
    if (existsSync(artifact)) {
      rmSync(artifact, { recursive: true, force: true });
    }
  }

  console.log("✅ Cleanup completed");
}

async function main(): Promise<void> {
  console.log("🚀 Pika! Sidecar Build Script\n");

  try {
    // Step 0: Check Python venv
    checkPythonVenv();

    // Step 1: Get target triple
    const targetTriple = await getTargetTriple();

    // Step 2: Build the sidecar
    await buildSidecar();

    // Step 3: Move binary to correct location
    await moveBinary(targetTriple);

    // Step 4: Cleanup
    cleanup();

    console.log("\n🎉 Sidecar build completed successfully!");
    console.log(`   Binary location: src-tauri/binaries/api-${targetTriple}`);
  } catch (error) {
    console.error("\n❌ Build failed:", error);
    process.exit(1);
  }
}

main();
