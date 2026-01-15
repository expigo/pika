import { test, expect } from "@playwright/test";
import { createDjSession, DjSimulator } from "../fixtures/ws-dj-simulator";

/**
 * Pika! Happy Path E2E Test (v2)
 *
 * Tests the core user flow using WebSocket injection:
 * 1. DJ goes live (via WS simulator)
 * 2. Audience sees the session
 * 3. Audience joins and sees the track
 * 4. Audience likes the track
 * 5. DJ receives the like
 */

test.describe("Pika! Core Flow", () => {
  let djSession: DjSimulator;

  test.beforeEach(async () => {
    // Create DJ session before each test
    djSession = await createDjSession({
      djName: "Happy Path DJ",
      track: {
        title: "Billie Jean",
        artist: "Michael Jackson",
        bpm: 117,
        energy: 0.8,
      },
    });
  });

  test.afterEach(async () => {
    djSession?.disconnect();
  });

  test("Audience sees track and can like it", async ({ page }) => {
    // 1. Navigate to Web App
    console.log("📱 Audience: Loading web app...");
    await page.goto("http://localhost:3002");

    // 2. Wait for session to appear (session discovery)
    console.log("📱 Audience: Looking for DJ session...");
    await expect(page.getByText("Happy Path DJ")).toBeVisible({ timeout: 15000 });

    // 3. Click on the session to join
    console.log("📱 Audience: Clicking Tune In...");
    await page
      .getByRole("link", { name: /tune in/i })
      .first()
      .click();

    // 4. Verify track is visible
    console.log("📱 Audience: Verifying track visible...");
    await expect(page.getByText("Billie Jean")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Michael Jackson")).toBeVisible();

    // 5. Click Like button
    console.log("❤️ Audience: Liking track...");
    const likeButton = page.getByLabel("Like Track");
    await expect(likeButton).toBeVisible();
    await likeButton.click();

    // 6. Verify DJ received like (via WebSocket)
    console.log("🖥️ DJ: Waiting for like confirmation...");
    const receivedLike = await djSession.waitForLikes(1, 5000);

    if (!receivedLike) {
      // Fallback: Check messages array
      const messages = djSession.getMessages();
      console.log("📊 DJ Messages:", JSON.stringify(messages, null, 2));
    }

    expect(receivedLike || djSession.getLikeCount() > 0).toBe(true);
    console.log("✅ Flow complete: DJ→Cloud→Audience→Like→DJ verified!");
  });

  test("Track info displays correctly", async ({ page }) => {
    await page.goto("http://localhost:3002");
    await expect(page.getByText("Happy Path DJ")).toBeVisible({ timeout: 15000 });
    await page
      .getByRole("link", { name: /tune in/i })
      .first()
      .click();

    // Verify all track metadata renders
    await expect(page.getByText("Billie Jean")).toBeVisible();
    await expect(page.getByText("Michael Jackson")).toBeVisible();

    // BPM should be visible somewhere (if displayed)
    // This is optional based on UI
    console.log("✅ Track info renders correctly");
  });
});
