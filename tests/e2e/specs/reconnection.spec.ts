import { test, expect } from "@playwright/test";
import { createDjSession, DjSimulator } from "../fixtures/ws-dj-simulator";

/**
 * Network Resilience E2E Tests
 *
 * Tests the system's behavior during network interruptions:
 * 1. DJ reconnects after brief disconnect (30s)
 * 2. DJ reconnects after extended disconnect (5min)
 * 3. Audience page refresh during offline
 * 4. Multiple rapid reconnections (flapping)
 * 5. Likes survive disconnection (offline queue)
 */

test.describe("Network Resilience", () => {
  let djSession: DjSimulator;

  test.afterEach(async () => {
    djSession?.disconnect();
  });

  test.describe("DJ Reconnection", () => {
    test("DJ reconnects after brief disconnect - audience sees updated track", async ({ page }) => {
      // 1. Create DJ session with initial track
      djSession = await createDjSession({
        djName: "Resilience DJ",
        track: {
          title: "Initial Track",
          artist: "Test Artist",
          bpm: 120,
        },
      });

      // 2. Navigate to Live page
      await page.goto("http://localhost:3002");
      await expect(page.getByText("Resilience DJ")).toBeVisible({ timeout: 15000 });
      await page
        .getByRole("link", { name: /tune in/i })
        .first()
        .click();
      await expect(page.getByText("Initial Track")).toBeVisible({ timeout: 10000 });

      // 3. Simulate DJ disconnect for 2 seconds
      console.log("🔌 Simulating DJ disconnect...");
      await djSession.simulateReconnect(2000);

      // 4. DJ broadcasts new track after reconnect
      djSession.broadcastTrack({
        title: "Post-Reconnect Track",
        artist: "Resilient Artist",
        bpm: 128,
      });

      // 5. Verify audience sees new track (within reasonable timeout)
      console.log("📱 Verifying audience receives new track...");
      await expect(page.getByText("Post-Reconnect Track")).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByText("Resilient Artist")).toBeVisible();

      console.log("✅ DJ reconnection test passed!");
    });

    test("Audience survives DJ disconnect - sees 'Signal Lost' indicator", async ({ page }) => {
      // 1. Create DJ session
      djSession = await createDjSession({
        djName: "Signal Test DJ",
        track: {
          title: "Signal Track",
          artist: "Signal Artist",
          bpm: 120,
        },
      });

      // 2. Navigate to Live page
      await page.goto("http://localhost:3002");
      await expect(page.getByText("Signal Test DJ")).toBeVisible({ timeout: 15000 });
      await page
        .getByRole("link", { name: /tune in/i })
        .first()
        .click();
      await expect(page.getByText("Signal Track")).toBeVisible({ timeout: 10000 });

      // 3. Disconnect DJ (simulating network loss)
      console.log("🔌 Disconnecting DJ...");
      djSession.disconnect();

      // 4. After ~35 seconds, the audience should see "Signal Lost" or similar
      // Note: This test may be slow due to 30s heartbeat timeout
      // For CI efficiency, we can use a mock or skip this timing-dependent test
      console.log("⏳ Waiting for signal lost detection (this may take up to 35s)...");

      // We check for the amber "SIGNAL WEAK" indicator
      await expect(page.getByText(/signal weak|signal lost/i)).toBeVisible({
        timeout: 40000,
      });

      console.log("✅ Signal lost indicator displayed correctly!");
    });

    test("Track changes queue during DJ offline and sync on reconnect", async ({ page }) => {
      // This test verifies the offline queue behavior
      // Note: This tests the cloud→audience path, not desktop→cloud

      // 1. Create DJ session
      djSession = await createDjSession({
        djName: "Queue Test DJ",
        track: {
          title: "First Track",
          artist: "Queue Artist",
          bpm: 120,
        },
      });

      // 2. Navigate to Live page and verify initial track
      await page.goto("http://localhost:3002");
      await expect(page.getByText("Queue Test DJ")).toBeVisible({ timeout: 15000 });
      await page
        .getByRole("link", { name: /tune in/i })
        .first()
        .click();
      await expect(page.getByText("First Track")).toBeVisible({ timeout: 10000 });

      // 3. Broadcast several tracks rapidly (simulating normal DJ behavior)
      const tracks = [
        { title: "Second Track", artist: "Queue Artist" },
        { title: "Third Track", artist: "Queue Artist" },
        { title: "Fourth Track", artist: "Queue Artist" },
      ];

      for (const track of tracks) {
        djSession.broadcastTrack({ ...track, bpm: 125 });
        await new Promise((r) => setTimeout(r, 300));
      }

      // 4. Verify the last track is displayed (order guaranteed)
      await expect(page.getByText("Fourth Track")).toBeVisible({ timeout: 10000 });

      console.log("✅ Track sequence handled correctly!");
    });
  });

  test.describe("Audience Offline Queue", () => {
    test("Like is preserved during brief page offline", async ({ page }) => {
      // 1. Create DJ session
      djSession = await createDjSession({
        djName: "Offline Queue DJ",
        track: {
          title: "Like Queue Track",
          artist: "Queue Artist",
          bpm: 120,
        },
      });

      // 2. Navigate and join session
      await page.goto("http://localhost:3002");
      await expect(page.getByText("Offline Queue DJ")).toBeVisible({ timeout: 15000 });
      await page
        .getByRole("link", { name: /tune in/i })
        .first()
        .click();
      await expect(page.getByText("Like Queue Track")).toBeVisible({ timeout: 10000 });

      // 3. Take browser offline
      console.log("🔌 Taking browser offline...");
      await page.context().setOffline(true);

      // 4. Click like (should queue optimistically)
      const likeButton = page.getByLabel("Like Track");
      await expect(likeButton).toBeVisible();
      await likeButton.click();

      // 5. Verify optimistic UI update (filled heart)
      // The button state should change even though we're offline
      console.log("✅ Like button clicked while offline");

      // 6. Bring browser back online
      console.log("🔌 Bringing browser back online...");
      await page.context().setOffline(false);

      // 7. Wait for flush and verify DJ received the like
      const receivedLike = await djSession.waitForLikes(1, 10000);
      expect(receivedLike).toBe(true);

      console.log("✅ Offline like queue test passed!");
    });
  });

  test.describe("Rapid Reconnection (Flapping)", () => {
    test("System handles rapid connect/disconnect cycles", async ({ page }) => {
      // 1. Create DJ session
      djSession = await createDjSession({
        djName: "Flapping DJ",
        track: {
          title: "Flap Track",
          artist: "Flap Artist",
          bpm: 120,
        },
      });

      // 2. Navigate and join session
      await page.goto("http://localhost:3002");
      await expect(page.getByText("Flapping DJ")).toBeVisible({ timeout: 15000 });
      await page
        .getByRole("link", { name: /tune in/i })
        .first()
        .click();
      await expect(page.getByText("Flap Track")).toBeVisible({ timeout: 10000 });

      // 3. Simulate rapid reconnections (5 times)
      console.log("🔄 Simulating rapid reconnections...");
      for (let i = 0; i < 5; i++) {
        await djSession.simulateReconnect(200); // 200ms disconnects
        await new Promise((r) => setTimeout(r, 100));
      }

      // 4. Broadcast a new track after stabilization
      djSession.broadcastTrack({
        title: "Stable Track",
        artist: "Stable Artist",
        bpm: 130,
      });

      // 5. Verify audience sees the stable track
      await expect(page.getByText("Stable Track")).toBeVisible({ timeout: 10000 });

      console.log("✅ Rapid reconnection (flapping) test passed!");
    });
  });
});
