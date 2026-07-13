/**
 * Slice D: DJ playlist import + link-write policy, Signature, compat, crowd-pleasers, playlist deletion.
 * Moved verbatim from src/__tests__/db.integration.test.ts L3442-4039 @ 2d3f846
 * (2026-07 split; only the shared uniq() helper was deduped into ./harness).
 *
 * Gated by RUN_DB_TESTS via ./harness (plain `bun test` skips). Run ISOLATED:
 * `bun run test:integration` — never bare `RUN_DB_TESTS=1 bun test` (unit files
 * mock modules process-globally). Pool teardown lives in the bunfig preload.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { getTrackKey } from "@pika/shared";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { seedFromPlaylist } from "../../lib/services/spotifyMatch";
import { dj as djRoute } from "../../routes/dj";
import { meRoutes } from "../../routes/me";
import {
  ensureBaseSession,
  setupIntegrationEnv,
  signUpDancer,
  signUpDj,
  suite,
  uniq,
} from "./harness";

suite("DB integration (real Postgres)", () => {
  beforeAll(async () => {
    setupIntegrationEnv();
    await ensureBaseSession();
  });

  // ==========================================================================
  // Slice D — Musical Identity (import + provenance, Signature, compat, crowd-pleasers)
  // ==========================================================================
  describe("musical identity (Slice D, real Postgres)", () => {
    /** Sign up an approved DJ and fetch the slug the booth routes key on. */
    async function makeDj(name: string): Promise<{
      userId: string;
      slug: string;
      headers: Record<string, string>;
    }> {
      const dj = await signUpDj({ approved: true, name });
      const [row] = await db
        .select({ slug: schema.user.slug })
        .from(schema.user)
        .where(eq(schema.user.id, dj.userId))
        .limit(1);
      return {
        userId: dj.userId,
        slug: row?.slug ?? "",
        headers: { Authorization: `Bearer ${dj.token}`, "Content-Type": "application/json" },
      };
    }

    describe("DJ import + link-write policy", () => {
      test("import → curated rows; dual-CSV re-import accretes and PRESERVES promotion; cap exempts existing names", async () => {
        const dj = await makeDj(`Import DJ ${uniq()}`);
        const tag = uniq();
        const spA = `SLDA${tag}`;
        const spB = `SLDB${tag}`;
        const listName = `Budafest ${tag}`;

        const first = await djRoute.request("/me/playlists/import", {
          method: "POST",
          headers: dj.headers,
          body: JSON.stringify({
            name: listName,
            featuresSource: "exportify",
            tracks: [
              {
                spotifyId: spA,
                uri: `spotify:track:${spA}`,
                name: `Song A ${tag}`,
                artists: `Artist ${tag}`,
                albumArtUrl: "https://i.scdn.co/image/abc123",
                features: { tempo: 100.5, energy: 0.61 },
              },
              {
                spotifyId: spB,
                uri: `spotify:track:${spB}`,
                name: `Song B ${tag}`,
                artists: `Artist ${tag}`,
                features: { tempo: 92, energy: 0.4 },
              },
            ],
          }),
        });
        expect(first.status).toBe(200);
        const firstBody = (await first.json()) as {
          playlistId: number | null;
          trackCount: number;
          featureCount: number;
        };
        expect(firstBody.trackCount).toBe(2);
        expect(firstBody.featureCount).toBe(2);
        const playlistId = firstBody.playlistId;
        expect(playlistId).not.toBeNull();

        // Promote + label it, then re-import (Chosic pass: adds isrc, must not clobber decimals).
        const promote = await djRoute.request(`/me/curated-playlists/${playlistId}`, {
          method: "PATCH",
          headers: dj.headers,
          body: JSON.stringify({ showOnBooth: true, label: "party set" }),
        });
        expect(promote.status).toBe(200);

        const second = await djRoute.request("/me/playlists/import", {
          method: "POST",
          headers: dj.headers,
          body: JSON.stringify({
            name: listName,
            featuresSource: "chosic",
            tracks: [
              {
                spotifyId: spA,
                uri: `spotify:track:${spA}`,
                name: `Song A ${tag}`,
                artists: `Artist ${tag}`,
                features: { tempo: 100, energy: 0.6, isrc: `ISRC${tag}`, camelot: "9B" },
              },
            ],
          }),
        });
        expect(second.status).toBe(200);
        expect(((await second.json()) as { playlistId: number | null }).playlistId).toBe(
          playlistId,
        );

        const [pl] = await db
          .select()
          .from(schema.curatedPlaylists)
          .where(eq(schema.curatedPlaylists.id, playlistId as number))
          .limit(1);
        expect(pl?.showOnBooth).toBe(true); // re-import preserves promotion + metadata
        expect(pl?.label).toBe("party set");
        const [feat] = await db
          .select()
          .from(schema.spotifyTrackFeatures)
          .where(eq(schema.spotifyTrackFeatures.spotifyId, spA))
          .limit(1);
        expect(feat?.isrc).toBe(`ISRC${tag}`); // Chosic filled the gap…
        expect(feat?.energy).toBe(0.61); // …without clobbering the Exportify decimal

        // Cap: 48 direct rows → an EXISTING name still re-imports; a NEW name 409s.
        await db.insert(schema.curatedPlaylists).values(
          Array.from({ length: 48 }, (_, i) => ({
            djUserId: dj.userId,
            name: `Filler ${tag} ${i}`,
          })),
        );
        const reimportAtCap = await djRoute.request("/me/playlists/import", {
          method: "POST",
          headers: dj.headers,
          body: JSON.stringify({
            name: listName,
            tracks: [
              {
                spotifyId: spA,
                uri: `spotify:track:${spA}`,
                name: `Song A ${tag}`,
                artists: `Artist ${tag}`,
              },
            ],
          }),
        });
        expect(reimportAtCap.status).toBe(200);
        const newAtCap = await djRoute.request("/me/playlists/import", {
          method: "POST",
          headers: dj.headers,
          body: JSON.stringify({
            name: `Overflow ${tag}`,
            tracks: [
              {
                spotifyId: spB,
                uri: `spotify:track:${spB}`,
                name: `Song B ${tag}`,
                artists: `Artist ${tag}`,
              },
            ],
          }),
        });
        expect(newAtCap.status).toBe(409);
      });

      test("D0 fill-mode: a DJ import never clobbers a manual link, but fills an unmatched one", async () => {
        const dj = await makeDj(`Fill DJ ${uniq()}`);
        const tag = uniq();
        const manualArtist = `Manual Artist ${tag}`;
        const manualTitle = `Protected Song ${tag}`;
        const openArtist = `Open Artist ${tag}`;
        const openTitle = `Unmatched Song ${tag}`;
        const manualKey = getTrackKey(manualArtist, manualTitle);
        const openKey = getTrackKey(openArtist, openTitle);

        await db.insert(schema.trackLinks).values([
          {
            matchKey: manualKey,
            songKey: manualKey,
            provider: "spotify",
            providerId: "ADMIN_CURATED_ID",
            providerUrl: "https://open.spotify.com/track/ADMIN_CURATED_ID",
            status: "manual",
            confidence: null,
            source: "manual",
          },
          {
            matchKey: openKey,
            songKey: openKey,
            provider: "spotify",
            providerId: null,
            providerUrl: null,
            status: "unmatched",
            confidence: null,
            source: "auto",
          },
        ]);

        const res = await djRoute.request("/me/playlists/import", {
          method: "POST",
          headers: dj.headers,
          body: JSON.stringify({
            name: `Fill List ${tag}`,
            tracks: [
              {
                spotifyId: `DJCLAIM${tag}`,
                uri: `spotify:track:DJCLAIM${tag}`,
                name: manualTitle,
                artists: manualArtist,
              },
              {
                spotifyId: `DJFILL${tag}`,
                uri: `spotify:track:DJFILL${tag}`,
                name: openTitle,
                artists: openArtist,
              },
            ],
          }),
        });
        expect(res.status).toBe(200);

        const [protectedLink] = await db
          .select()
          .from(schema.trackLinks)
          .where(eq(schema.trackLinks.matchKey, manualKey))
          .limit(1);
        expect(protectedLink?.providerId).toBe("ADMIN_CURATED_ID"); // untouched
        expect(protectedLink?.source).toBe("manual");

        const [filledLink] = await db
          .select()
          .from(schema.trackLinks)
          .where(eq(schema.trackLinks.matchKey, openKey))
          .limit(1);
        expect(filledLink?.providerId).toBe(`DJFILL${tag}`); // filled
        expect(filledLink?.source).toBe("playlist");

        // Sanity: the default (authoritative) path still overwrites — admin/finalize behavior.
        await seedFromPlaylist(dj.userId, "", [
          {
            spotifyId: `ADMINWIN${tag}`,
            uri: `spotify:track:ADMINWIN${tag}`,
            name: manualTitle,
            artists: manualArtist,
          },
        ]);
        const [afterAdmin] = await db
          .select()
          .from(schema.trackLinks)
          .where(eq(schema.trackLinks.matchKey, manualKey))
          .limit(1);
        expect(afterAdmin?.providerId).toBe(`ADMINWIN${tag}`);
      });
    });

    describe("Signature + booth payload (one dial, floors, provenance)", () => {
      test("computed from published sets + promoted playlists; the dials shrink it honestly; showSignature hides only the public card", async () => {
        const dj = await makeDj(`Sig DJ ${uniq()}`);
        const tag = uniq();

        // 24 featured tracks via the real import route (well over the 20-track floor).
        const tracks = Array.from({ length: 24 }, (_, i) => ({
          spotifyId: `SIG${tag}${i}`,
          uri: `spotify:track:SIG${tag}${i}`,
          name: `Sig Song ${i} ${tag}`,
          artists: `Sig Artist ${tag}`,
          features: { tempo: 80 + i * 2, energy: 0.3 + i * 0.02, valence: 0.5 },
        }));
        const imp = await djRoute.request("/me/playlists/import", {
          method: "POST",
          headers: dj.headers,
          body: JSON.stringify({ name: `Sig List ${tag}`, tracks }),
        });
        expect(imp.status).toBe(200);
        const plId = ((await imp.json()) as { playlistId: number }).playlistId;
        await djRoute.request(`/me/curated-playlists/${plId}`, {
          method: "PATCH",
          headers: dj.headers,
          body: JSON.stringify({ showOnBooth: true }),
        });

        // One PUBLISHED live session with 3 plays whose names resolve via the playlist links.
        const sid = `sd_sig_${tag}`;
        await db
          .insert(schema.sessions)
          .values({ id: sid, djName: "Sig DJ", djUserId: dj.userId, endedAt: new Date() });
        await db.insert(schema.playedTracks).values(
          [0, 1, 2].map((i) => ({
            sessionId: sid,
            artist: `Sig Artist ${tag}`,
            title: `Sig Song ${i} ${tag}`,
            matchKey: getTrackKey(`Sig Artist ${tag}`, `Sig Song ${i} ${tag}`),
          })),
        );

        const pub1 = await djRoute.request(`/${dj.slug}`);
        const body1 = (await pub1.json()) as {
          signature: {
            contexts: {
              live: number;
              imported: number;
              liveTracks: number;
              importedTracks: number;
            };
            featuredTracks: number;
            tempo: { min: number; max: number };
          } | null;
          boothPlaylists: { source: string; trackCount: number; tracks: unknown[] }[];
        };
        expect(body1.signature).not.toBeNull();
        // The 3 live plays resolve to ids that are ALSO in the import — live-first attribution
        // credits them to live, and the parts sum exactly to featuredTracks (3 + 21 = 24).
        expect(body1.signature?.contexts).toEqual({
          live: 1,
          imported: 1,
          liveTracks: 3,
          importedTracks: 21,
        });
        expect(body1.signature?.featuredTracks).toBe(24);
        expect(body1.signature?.tempo.min).toBe(80);
        expect(body1.signature?.tempo.max).toBe(80 + 23 * 2);
        expect(body1.boothPlaylists.length).toBe(1);
        expect(body1.boothPlaylists[0]?.source).toBe("csv"); // "DJ's pick" badge branch
        expect(body1.boothPlaylists[0]?.trackCount).toBe(24);
        expect(body1.boothPlaylists[0]?.tracks.length).toBeLessThanOrEqual(5);

        // ONE DIAL, live side: unpublish the session → context floor kills the card.
        await djRoute.request(`/me/sessions/${sid}`, {
          method: "PATCH",
          headers: dj.headers,
          body: JSON.stringify({ published: false }),
        });
        const pub2 = await djRoute.request(`/${dj.slug}`);
        const body2 = (await pub2.json()) as { signature: unknown; boothPlaylists: unknown[] };
        expect(body2.signature).toBeNull();
        expect(body2.boothPlaylists.length).toBe(1); // playlist still promoted

        // Owner-only floors progress explains the null: 1 context of 2, tracks are fine.
        const belowFloors = await djRoute.request("/me/booth", { headers: dj.headers });
        const belowBody = (await belowFloors.json()) as {
          signaturePreview: unknown;
          signatureProgress: {
            featuredTracks: number;
            contexts: { live: number; imported: number };
          };
        };
        expect(belowBody.signaturePreview).toBeNull();
        expect(belowBody.signatureProgress.contexts).toEqual({ live: 0, imported: 1 });
        expect(belowBody.signatureProgress.featuredTracks).toBe(24);

        // ONE DIAL, import side: demote the playlist → native list gone too.
        await djRoute.request(`/me/curated-playlists/${plId}`, {
          method: "PATCH",
          headers: dj.headers,
          body: JSON.stringify({ showOnBooth: false }),
        });
        const pub3 = await djRoute.request(`/${dj.slug}`);
        expect(((await pub3.json()) as { boothPlaylists: unknown[] }).boothPlaylists.length).toBe(
          0,
        );

        // Restore, then hide via showSignature: public card gone, owner preview intact.
        await djRoute.request(`/me/sessions/${sid}`, {
          method: "PATCH",
          headers: dj.headers,
          body: JSON.stringify({ published: true }),
        });
        await djRoute.request(`/me/curated-playlists/${plId}`, {
          method: "PATCH",
          headers: dj.headers,
          body: JSON.stringify({ showOnBooth: true }),
        });
        const lone = await djRoute.request("/me/booth", {
          method: "PATCH",
          headers: dj.headers,
          body: JSON.stringify({ showSignature: false }), // lone-toggle body must not 400
        });
        expect(lone.status).toBe(200);
        const pub4 = await djRoute.request(`/${dj.slug}`);
        expect(((await pub4.json()) as { signature: unknown }).signature).toBeNull();
        const mine = await djRoute.request("/me/booth", { headers: dj.headers });
        const mineBody = (await mine.json()) as {
          showSignature: boolean;
          signaturePreview: unknown;
          signatureProgress: { featuredTracks: number };
        };
        expect(mineBody.showSignature).toBe(false);
        expect(mineBody.signaturePreview).not.toBeNull();
        expect(mineBody.signatureProgress.featuredTracks).toBe(24);
      });

      test("a direct-insert 'profile' playlist renders the live-badge branch", async () => {
        const dj = await makeDj(`Live Badge DJ ${uniq()}`);
        const tag = uniq();
        const [pl] = await db
          .insert(schema.curatedPlaylists)
          .values({
            djUserId: dj.userId,
            name: `Live Set ${tag}`,
            source: "profile",
            showOnBooth: true,
          })
          .returning({ id: schema.curatedPlaylists.id });
        await db.insert(schema.curatedTracks).values({
          djUserId: dj.userId,
          spotifyId: `LIVE${tag}`,
          name: "Live One",
          artists: "Live Artist",
          playlistName: `Live Set ${tag}`,
        });
        await db
          .insert(schema.curatedPlaylistTracks)
          .values({ playlistId: pl?.id as number, spotifyId: `LIVE${tag}` });

        const pub = await djRoute.request(`/${dj.slug}`);
        const body = (await pub.json()) as {
          boothPlaylists: { source: string; tracks: { title: string }[] }[];
        };
        expect(body.boothPlaylists[0]?.source).toBe("profile"); // "⚡ Played live on Pika"
        expect(body.boothPlaylists[0]?.tracks[0]?.title).toBe("Live One");
      });
    });

    describe("compatibility (snapshot-first + strict gate)", () => {
      test("counts snapshot-resolved and trusted-link likes; excludes low-confidence links", async () => {
        const dj = await makeDj(`Compat DJ ${uniq()}`);
        const tag = uniq();
        const idA = `CMPA${tag}`; // matched via like's own spotifyUrl (snapshot path)
        const idB = `CMPB${tag}`; // matched via the trusted playlist link
        const idC = `CMPC${tag}`; // link exists but low-confidence auto → excluded

        const imp = await djRoute.request("/me/playlists/import", {
          method: "POST",
          headers: dj.headers,
          body: JSON.stringify({
            name: `Compat List ${tag}`,
            tracks: [idA, idB, idC].map((id, i) => ({
              spotifyId: id,
              uri: `spotify:track:${id}`,
              name: `Compat Song ${i} ${tag}`,
              artists: `Compat Artist ${tag}`,
            })),
          }),
        });
        const plId = ((await imp.json()) as { playlistId: number }).playlistId;
        await djRoute.request(`/me/curated-playlists/${plId}`, {
          method: "PATCH",
          headers: dj.headers,
          body: JSON.stringify({ showOnBooth: true }),
        });

        // Downgrade C's link to a low-confidence auto row (the strict gate must drop it).
        await db
          .update(schema.trackLinks)
          .set({ status: "matched", source: "auto", confidence: 0.5 })
          .where(
            eq(
              schema.trackLinks.matchKey,
              getTrackKey(`Compat Artist ${tag}`, `Compat Song 2 ${tag}`),
            ),
          );

        const dancer = await signUpDancer();
        const device = `client_cmp_${tag}`;
        await db
          .insert(schema.clientIdentities)
          .values({ clientId: device, userId: dancer.userId });
        const sid = `sd_cmp_${tag}`;
        await db.insert(schema.sessions).values({ id: sid, djName: "Someone Else" });
        const plays = await db
          .insert(schema.playedTracks)
          .values([
            {
              sessionId: sid,
              artist: "X",
              title: "Snapshot Hit",
              spotifyUrl: `https://open.spotify.com/track/${idA}`,
            },
            {
              sessionId: sid,
              artist: `Compat Artist ${tag}`,
              title: `Compat Song 1 ${tag}`,
              matchKey: getTrackKey(`Compat Artist ${tag}`, `Compat Song 1 ${tag}`),
            },
            {
              sessionId: sid,
              artist: `Compat Artist ${tag}`,
              title: `Compat Song 2 ${tag}`,
              matchKey: getTrackKey(`Compat Artist ${tag}`, `Compat Song 2 ${tag}`),
            },
            { sessionId: sid, artist: "Y", title: "Unresolvable" },
          ])
          .returning({ id: schema.playedTracks.id });
        await db
          .insert(schema.likes)
          .values(plays.map((p) => ({ sessionId: sid, clientId: device, playedTrackId: p.id })));

        const asDancer = {
          Authorization: `Bearer ${dancer.token}`,
          "Content-Type": "application/json",
        };
        const res = await meRoutes.request(`/compat/${dj.slug}`, { headers: asDancer });
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          sharedCount: number;
          viewerTrackCount: number;
          topShared: { title: string }[];
        };
        expect(body.sharedCount).toBe(2); // A (snapshot) + B (trusted link); C excluded
        expect(body.viewerTrackCount).toBe(2); // only resolvable likes count
        expect(body.topShared.length).toBe(2);

        const unknown = await meRoutes.request(`/compat/nope-${tag}`, { headers: asDancer });
        expect(unknown.status).toBe(404);
      });
    });

    describe("crowd-pleasers", () => {
      test("aggregates likes per track across ALL my sessions (publish-agnostic, DJ-private)", async () => {
        const dj = await makeDj(`Pleaser DJ ${uniq()}`);
        const tag = uniq();
        const s1 = `sd_cp1_${tag}`;
        const s2 = `sd_cp2_${tag}`;
        await db.insert(schema.sessions).values([
          { id: s1, djName: "P", djUserId: dj.userId, published: true },
          { id: s2, djName: "P", djUserId: dj.userId, published: false }, // hidden set still counts here
        ]);
        const key = getTrackKey(`Hit Artist ${tag}`, `Hit Song ${tag}`);
        const plays = await db
          .insert(schema.playedTracks)
          .values([
            { sessionId: s1, artist: `Hit Artist ${tag}`, title: `Hit Song ${tag}`, matchKey: key },
            { sessionId: s1, artist: `Hit Artist ${tag}`, title: `Hit Song ${tag}`, matchKey: key },
            { sessionId: s2, artist: `Hit Artist ${tag}`, title: `Hit Song ${tag}`, matchKey: key },
          ])
          .returning({ id: schema.playedTracks.id });
        const [p1, , p3] = plays.map((p) => p.id);
        await db.insert(schema.likes).values([
          { sessionId: s1, clientId: `client_cp_a_${tag}`, playedTrackId: p1 as number },
          { sessionId: s1, clientId: `client_cp_b_${tag}`, playedTrackId: p1 as number },
          { sessionId: s2, clientId: `client_cp_a_${tag}`, playedTrackId: p3 as number },
        ]);

        const res = await djRoute.request("/me/crowd-pleasers", { headers: dj.headers });
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          totals: { sessions: number; likes: number; dancers: number };
          tracks: { title: string; plays: number; likes: number; likesPerPlay: number }[];
        };
        expect(body.totals.sessions).toBe(2);
        expect(body.totals.likes).toBe(3);
        expect(body.totals.dancers).toBe(2);
        const hit = body.tracks.find((t) => t.title === `Hit Song ${tag}`);
        expect(hit?.plays).toBe(3); // incl. the unliked play
        expect(hit?.likes).toBe(3);
        expect(hit?.likesPerPlay).toBe(1);
      });
    });

    describe("playlist deletion", () => {
      test("removes the playlist + memberships, leaves the shared corpus intact", async () => {
        const dj = await makeDj(`Delete DJ ${uniq()}`);
        const tag = uniq();
        const spX = `DEL${tag}`;
        const imp = await djRoute.request("/me/playlists/import", {
          method: "POST",
          headers: dj.headers,
          body: JSON.stringify({
            name: `Doomed ${tag}`,
            tracks: [
              {
                spotifyId: spX,
                uri: `spotify:track:${spX}`,
                name: "Doomed Song",
                artists: "Doomed Artist",
                features: { tempo: 90 },
              },
            ],
          }),
        });
        const plId = ((await imp.json()) as { playlistId: number }).playlistId;

        const del = await djRoute.request(`/me/curated-playlists/${plId}`, {
          method: "DELETE",
          headers: dj.headers,
        });
        expect(del.status).toBe(200);

        const memberships = await db
          .select()
          .from(schema.curatedPlaylistTracks)
          .where(eq(schema.curatedPlaylistTracks.playlistId, plId));
        expect(memberships.length).toBe(0);
        const [track] = await db
          .select()
          .from(schema.curatedTracks)
          .where(eq(schema.curatedTracks.spotifyId, spX))
          .limit(1);
        expect(track).toBeDefined(); // shared corpus untouched
        const [feat] = await db
          .select()
          .from(schema.spotifyTrackFeatures)
          .where(eq(schema.spotifyTrackFeatures.spotifyId, spX))
          .limit(1);
        expect(feat?.tempo).toBe(90);
      });
    });
  });
});
