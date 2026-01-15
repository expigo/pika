import { test, expect } from "@playwright/test";
import { createDjSession, DjSimulator } from "../fixtures/ws-dj-simulator";

/**
 * Pika! Session Discovery Test (v2)
 *
 * Tests that the audience can discover a session that starts AFTER page load.
 */

test.describe("Pika! Session Discovery", () => {
  let djSession: DjSimulator | null = null;

  test.afterEach(async () => {
    djSession?.disconnect();
  });

  test("Audience discovers late-starting session", async ({ page }) => {
    // 1. Audience loads page BEFORE session exists
    console.log("📱 Audience: Loading page (no sessions yet)...");
    await page.goto("http://localhost:3002");

    // 2. Verify no session visible initially
    // (We'll check that "Discovery DJ" is not there)
    await expect(page.getByText("Discovery DJ")).not.toBeVisible({ timeout: 3000 });
    console.log("✅ No session visible initially");

    // 3. Start DJ session AFTER audience loaded
    console.log("🖥️ DJ: Going live...");
    djSession = await createDjSession({
      djName: "Discovery DJ",
      track: {
        title: "Late Night",
        artist: "Odesza",
      },
    });

    // 4. Wait for polling to discover the session
    console.log("⏳ Waiting for polling to detect session (up to 60s)...");
    await expect(page.getByText("Discovery DJ")).toBeVisible({ timeout: 60000 });
    console.log("✅ Session discovered!");

    // 5. Join the session
    await page
      .getByRole("link", { name: /tune in/i })
      .first()
      .click();
    await expect(page.getByText("Late Night")).toBeVisible({ timeout: 10000 });

    console.log("✅ Late session discovery verified!");
  });

  test("Session list updates when DJ ends session", async ({ page }) => {
    // 1. Start DJ session first
    djSession = await createDjSession({
      djName: "Temporary DJ",
      track: { title: "Short Set", artist: "Test Artist" },
    });

    // 2. Audience sees the session
    await page.goto("http://localhost:3002");
    await expect(page.getByText("Temporary DJ")).toBeVisible({ timeout: 15000 });

    // 3. DJ ends session
    console.log("🖥️ DJ: Ending session...");
    djSession.disconnect();
    djSession = null;

    // 4. Verify session disappears (after polling refresh)
    console.log("⏳ Waiting for session to disappear...");
    await expect(page.getByText("Temporary DJ")).not.toBeVisible({ timeout: 60000 });

    console.log("✅ Session removal detected!");
  });
});
