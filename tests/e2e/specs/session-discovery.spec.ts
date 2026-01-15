import { test, expect } from "@playwright/test";
import { mockTauriInitScript } from "../fixtures/mock-tauri";

/**
 * Pika! Session Discovery Test
 * Verifies that the Audience Client discovers a session that starts AFTER the client has loaded.
 * This tests the polling mechanism of the Web App.
 */

// Helper to setup DJ Context
async function createDjContext(browser: any) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem(
      "pika_dj_settings",
      JSON.stringify({
        djName: "Discovery Test DJ",
        serverEnv: "dev",
        authToken: "",
        djInfo: null,
      }),
    );
  });
  const page = await context.newPage();
  await page.addInitScript(mockTauriInitScript);
  page.on("console", (msg: any) => console.log(`[Desktop] ${msg.text()}`));
  return { context, page };
}

test.describe("Pika! Polling & Discovery", () => {
  test("Audience discovers late-starting session", async ({ browser }) => {
    // 1. Start Audience FIRST (Before Session Exists)
    const audienceContext = await browser.newContext();
    const audiencePage = await audienceContext.newPage();
    audiencePage.on("console", (msg) => console.log(`[Audience] ${msg.text()}`));

    console.log("📱 Audience: checking for sessions (should be empty)...");
    await audiencePage.goto("http://127.0.0.1:3002", { waitUntil: "commit" });

    // Expect "No live sessions" message or similar empty state
    // The landing page usually lists sessions. If none, it might show a hero section.
    // Let's verify it sees NO active sessions initially.
    // Assuming the session list has a container or specific text.
    // If we don't know the exact "empty state" text, we can check that "Discovery Test DJ" is NOT visible.
    await expect(audiencePage.getByText("Discovery Test DJ")).not.toBeVisible();
    console.log("✅ Audience: No session visible initially.");

    // 2. Start DJ Session (Late Start)
    const { page: djPage } = await createDjContext(browser);
    console.log("🖥️ DJ: Going Live...");
    await djPage.goto("/");
    await djPage.getByRole("button", { name: "Go Live" }).click();
    await djPage.getByRole("button", { name: "Start Live Session" }).click();
    await expect(djPage.getByRole("button", { name: "LIVE" })).toBeVisible({ timeout: 10000 });

    // 3. Verify Discovery (Polling)
    console.log("⏳ Audience: Waiting for polling detection (max 60s)...");
    // The polling interval is 30s. 60s ensures at least one (maybe two) cycles.
    await expect(audiencePage.getByText("Discovery Test DJ")).toBeVisible({ timeout: 60000 });

    console.log("✅ Audience: Discovered session via polling!");

    // 4. Join Session
    await audiencePage.getByText("Discovery Test DJ").click();

    // Verify we are on the live page
    await expect(audiencePage.getByText("Discovery Test DJ")).toBeVisible();
    console.log("✅ Audience: Successfully joined late session.");
  });
});
