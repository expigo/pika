import { expect, test } from "@playwright/test";
import { createDjSession, type DjSimulator } from "../fixtures/ws-dj-simulator";

/**
 * Pika! Like Batching Test (v2)
 *
 * Tests rapid "Like" actions from the audience using WebSocket injection.
 */

test.describe("Pika! Feedback Systems", () => {
  let djSession: DjSimulator;

  test.beforeEach(async () => {
    djSession = await createDjSession({
      djName: "Batch Test DJ",
      track: {
        title: "Thriller",
        artist: "Michael Jackson",
        bpm: 118,
      },
    });
  });

  test.afterEach(async () => {
    // End the session immediately (not just close the socket) so it doesn't linger in the 45s
    // reconnect-grace and collapse the next test's landing banner to "N DJs LIVE NOW".
    djSession?.endSession();
    await new Promise((r) => setTimeout(r, 250)); // flush END_SESSION before the socket closes
    djSession?.disconnect();
  });

  test("Rapid likes are received by DJ", async ({ page }) => {
    // 1. Navigate to session
    await page.goto("http://localhost:3002");
    await expect(page.getByText("Batch Test DJ")).toBeVisible({ timeout: 15000 });
    await page
      .getByRole("link", { name: /tune in/i })
      .first()
      .click();

    // 2. Verify track
    await expect(page.getByText("Thriller")).toBeVisible({ timeout: 10000 });

    // 3. Rapid-fire likes
    console.log("❤️ Sending rapid likes (5x)...");
    const likeButton = page.getByLabel(/like this track/i);
    await expect(likeButton).toBeVisible();

    for (let i = 0; i < 5; i++) {
      await likeButton.click({ force: true });
      await page.waitForTimeout(100);
    }

    // 4. Verify DJ received likes
    console.log("🖥️ DJ: Checking like count...");
    await page.waitForTimeout(2000); // Allow batching/debounce

    const likeCount = djSession.getLikeCount();
    console.log(`📊 DJ received ${likeCount} likes`);

    // Due to batching/debouncing, we may not get exactly 5
    // But we should get at least 1
    expect(likeCount).toBeGreaterThanOrEqual(1);
    console.log("✅ Rapid likes processed successfully");
  });

  test("Multiple audience members can like", async ({ browser }) => {
    // Create multiple audience contexts
    const audience1 = await browser.newPage();
    const audience2 = await browser.newPage();

    // Both join the session
    for (const page of [audience1, audience2]) {
      await page.goto("http://localhost:3002");
      await expect(page.getByText("Batch Test DJ")).toBeVisible({ timeout: 15000 });
      await page
        .getByRole("link", { name: /tune in/i })
        .first()
        .click();
      await expect(page.getByText("Thriller")).toBeVisible({ timeout: 10000 });
    }

    // Both send likes
    await audience1.getByLabel(/like this track/i).click();
    await audience2.getByLabel(/like this track/i).click();

    // Wait for processing
    await audience1.waitForTimeout(2000);

    const likeCount = djSession.getLikeCount();
    console.log(`📊 DJ received ${likeCount} likes from 2 audience members`);

    expect(likeCount).toBeGreaterThanOrEqual(2);
    console.log("✅ Multiple audience likes verified");
  });
});
