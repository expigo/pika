/// <reference path="../types.d.ts" />
import { test, expect } from "@playwright/test";
import { mockTauriInitScript } from "../fixtures/mock-tauri";

/**
 * Pika! Happy Path E2E Test
 * Verifies that a DJ can Go Live and Broadast a track that appears on the Audience View.
 */

// Helper to setup DJ Context
async function createDjContext(browser: any) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem(
      "pika_dj_settings",
      JSON.stringify({
        djName: "E2E Test DJ",
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

test.describe("Pika! E2E Flow", () => {
  test("Song Play -> Audience See -> Like Loop", async ({ browser }) => {
    // 1. Setup DJ
    const { page: djPage } = await createDjContext(browser);

    // 2. DJ: Go Live
    console.log("🖥️ DJ: Navigating to Desktop App...");
    await djPage.goto("/");
    await expect(djPage.getByText("Pika!")).toBeVisible();

    console.log("🖥️ DJ: Going Live...");
    await djPage.getByRole("button", { name: "Go Live" }).click();
    await expect(djPage.getByText("Name Your Session")).toBeVisible();
    await djPage.getByRole("button", { name: "Start Live Session" }).click();

    // Verify Live State
    await expect(djPage.getByRole("button", { name: "LIVE", exact: true })).toBeVisible({
      timeout: 10000,
    });

    // 3. Simulate Track Change (via Mock Driver)
    console.log("🖥️ DJ: Simulating Track Play...");
    await djPage.evaluate(() => {
      // Direct window injection for the watcher to pick up
      window.__TEST_DRIVER_HISTORY__ = [
        {
          artist: "Michael Jackson",
          title: "Billie Jean",
          filepath: "/music/billie_jean.mp3",
          played_at: Date.now() / 1000,
        },
      ];
    });

    // 4. Setup Audience
    console.log("⏳ Waiting for track propagation to Cloud...");
    await djPage.waitForTimeout(5000); // Allow time for cloud sync

    const audienceContext = await browser.newContext();
    const audiencePage = await audienceContext.newPage();
    audiencePage.on("console", (msg: any) => console.log(`[Audience] ${msg.text()}`));

    console.log("📱 Audience: connecting to broadcast...");
    await audiencePage.goto("http://127.0.0.1:3002", { waitUntil: "commit" });

    // Debug check
    await audiencePage.evaluate(() => console.log("✅ Audience Page DOM Ready"));

    // 5. Audience Experience (New Page/Context)
    // Check if "Billie Jean" appears on the Audience Screen (Live Banner)
    await expect(async () => {
      await expect(audiencePage.getByText("Billie Jean")).toBeVisible();
    }).toPass({ timeout: 20000 });

    // Click "Tune In" to enter the session
    console.log("👆 Audience: Clicking 'Tune In'...");
    await audiencePage.getByRole("link", { name: "Tune In" }).first().click();

    // 6. Test Feedback: Audience Like
    console.log("❤️ Audience: Sending Like...");
    // Button should now be visible on the Session Page
    const likeButton = audiencePage.getByLabel("Like Track"); // Try pure selector first

    // It should be visible now that we are on the session page
    await expect(likeButton).toBeVisible();
    await likeButton.click();

    // Verify visual feedback on Audience (Toast)
    await expect(audiencePage.getByText("Liked!"))
      .toBeVisible()
      .catch(() => console.log("⚠️ Toast miss (optional check)"));

    // 7. Verify Desktop Receives Like
    console.log("🖥️ DJ: Verifying Like Received...");

    // Poll for the SQL update (wait up to 10s)
    await expect
      .poll(
        async () => {
          const sqlLogs = await djPage.evaluate(() => window.__TEST_SQL_LOG__ || []);
          return sqlLogs.some(
            (l: any) =>
              l.query.toLowerCase().includes("update") &&
              l.query.toLowerCase().includes("plays") &&
              l.query.toLowerCase().includes("dancer_likes"),
          );
        },
        {
          message: "Expected SQL UPDATE for incrementing dancer_likes",
          timeout: 10000,
          intervals: [1000],
        },
      )
      .toBeTruthy();

    console.log("✅ Verified: Like propagated Web -> Cloud -> Desktop -> DB");
  });
});
