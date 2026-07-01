import { expect, test } from "@playwright/test";
import { createDjSession, type DjSimulator } from "../fixtures/ws-dj-simulator";

/**
 * Wedge on mobile (iPhone viewport, `mobile-wedge` project).
 *
 * Proves the live-dancer wedge's payoff reaches a phone end-to-end: the Spotify identity
 * (album art + "Listen on Spotify") shows LIVE, on my-likes, and on the persisted recap.
 * Requires the cloud running with E2E_PERSIST=1 (playwright.config.ts) + Postgres migrated.
 */
const TRACK = {
  title: "Midnight City",
  artist: "M83",
  bpm: 105,
  albumArtUrl: "https://i.scdn.co/image/ab67616d0000b273e2e0f9e2c3a1b4d5e6f70819",
  spotifyUrl: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
};

const LISTEN = /listen to midnight city on spotify/i;

test.describe("Wedge on mobile", () => {
  let dj: DjSimulator;

  test.beforeEach(async () => {
    dj = await createDjSession({ djName: "Wedge DJ", track: TRACK });
  });

  test.afterEach(() => {
    dj?.disconnect();
  });

  test("shows Spotify identity live, in my-likes, and on the recap", async ({ page }) => {
    // 1. LIVE — tune into the broadcast and see album art + the Listen link.
    await page.goto("http://localhost:3002");
    await expect(page.getByText("Wedge DJ")).toBeVisible({ timeout: 15000 });
    await page
      .getByRole("link", { name: /tune in/i })
      .first()
      .click();
    await expect(page.getByText("Midnight City").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByAltText("Midnight City cover").first()).toBeVisible();
    await expect(page.getByRole("link", { name: LISTEN }).first()).toBeVisible();

    // 2. LIKE → my-likes (persisted; same-origin localStorage carries the client id).
    await page
      .getByLabel(/like this track/i)
      .first()
      .click();
    await page.waitForTimeout(1500); // absorb async persistence
    await page.goto("http://localhost:3002/my-likes");
    await expect(page.getByText("Midnight City").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("link", { name: LISTEN }).first()).toBeVisible();

    // 3. RECAP — end the set, then the persisted played_tracks.album_art_url / spotify_url
    //    surface through buildRecap → shared TrackRow.
    dj.endSession();
    await page.waitForTimeout(1500);
    await page.goto(`http://localhost:3002/recap/${dj.getSessionId()}`);
    await expect(page.getByText("Midnight City").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByAltText("Midnight City cover").first()).toBeVisible();
    await expect(page.getByRole("link", { name: LISTEN }).first()).toBeVisible();
  });
});
