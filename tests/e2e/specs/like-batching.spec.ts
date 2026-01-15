/// <reference path="../types.d.ts" />
import { test, expect } from "@playwright/test";
import { mockTauriInitScript } from "../fixtures/mock-tauri";

/**
 * Pika! Like Batching Test
 * Verifies that rapid "Like" actions from the audience are correctly received and stored by the Desktop App.
 */

// Helper to setup DJ Context
async function createDjContext(browser: any) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem(
      "pika_dj_settings",
      JSON.stringify({
        djName: "Batch Test DJ",
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

test.describe("Pika! Feedback Systems", () => {
  test("Rapid Likes are recorded in Database", async ({ browser }) => {
    // 1. Setup DJ
    const { page: djPage } = await createDjContext(browser);
    await djPage.goto("/");
    await djPage.getByRole("button", { name: "Go Live" }).click();
    await djPage.getByRole("button", { name: "Start Live Session" }).click();
    await expect(djPage.getByRole("button", { name: "LIVE" })).toBeVisible({ timeout: 10000 });

    // 2. Play Track
    await djPage.evaluate(() => {
      window.__TEST_DRIVER_HISTORY__ = [
        {
          artist: "Michael Jackson",
          title: "Thriller",
          filepath: "/music/thriller.mp3",
          played_at: Date.now() / 1000,
        },
      ];
    });

    // 3. Setup Audience
    await djPage.waitForTimeout(5000); // Wait for cloud sync
    const audienceContext = await browser.newContext();
    const audiencePage = await audienceContext.newPage();
    audiencePage.on("console", (msg: any) => console.log(`[Audience] ${msg.text()}`));
    await audiencePage.goto("http://127.0.0.1:3002", { waitUntil: "commit" });

    // 4. Join Session & Verify Track
    // Check if "Thriller" appears on the Audience Screen (Live Banner)
    await expect(async () => {
      await expect(audiencePage.getByText("Thriller")).toBeVisible();
    }).toPass({ timeout: 20000 });
    // Click "Tune In" to enter the session (DJ Name is not clickable)
    await audiencePage.getByRole("link", { name: "Tune In" }).first().click();

    // Now inside the session, check for track
    await expect(audiencePage.getByText("Thriller")).toBeVisible({ timeout: 15000 });

    console.log("❤️ Audience: Sending rapid batch of likes (5x)...");
    const likeButton = audiencePage.getByLabel("Like Track");
    await expect(likeButton).toBeVisible();

    // Click 5 times
    for (let i = 0; i < 5; i++) {
      await likeButton.click({ force: true });
      await audiencePage.waitForTimeout(100); // Slight delay to emulate fast clicking
    }

    // 5. Verify Desktop DB
    console.log("🖥️ DJ: Verifying DB Updates...");
    await djPage.waitForTimeout(5000); // Allow for network + batching processing

    // Assert SQL execution
    const sqlLogs = await djPage.evaluate(() => window.__TEST_SQL_LOG__ || []);

    // Count how many updates to 'plays' table containing 'dancer_likes' or generic update
    // The query is `UPDATE plays SET dancer_likes = dancer_likes + 1 ...`
    const likeUpdates = sqlLogs.filter(
      (l: any) =>
        l.query.toLowerCase().includes("update") &&
        l.query.toLowerCase().includes("plays") &&
        (l.query.toLowerCase().includes("like") || l.query.includes("dancer_likes")),
    );

    console.log(`📊 Found ${likeUpdates.length} like update queries.`);

    // We expect AT LEAST 1 update. Usually 5.
    expect(likeUpdates.length).toBeGreaterThanOrEqual(1);

    console.log("✅ Verified: Rapid likes processed.");
  });
});
