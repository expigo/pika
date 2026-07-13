/**
 * Night Recap sweep (Slice C) — the morning-after loop closer.
 *
 * A 15-minute interval tick (index.ts) that, inside a 09:00–13:00 server-local send window,
 * finds ended sessions with likes and mails each consented account holder their personal recap
 * (+ the DJ their digest, if opted in). Everything follows the finalizeWebSet doctrine:
 * best-effort, logged, never throws into the caller.
 *
 * Delivery discipline:
 *  - CLAIM-THEN-SEND: `recap_processed_at` is stamped exactly once (UPDATE … WHERE … IS NULL
 *    RETURNING) BEFORE any email goes out → at-most-once per session; a crash mid-batch loses
 *    that session's remaining sends rather than ever double-mailing.
 *  - Per-send Resend `Idempotency-Key` (recap:{session}:{user}) absorbs transient API retries.
 *  - Marketing throttle (separate from the transactional sign-in budget): address_limited skips
 *    a recipient (logged — the claim means they're lost, by design); daily_capped stops the tick.
 *    A session capped before sending ANYTHING is un-claimed (retried next window); the only
 *    residual is a session that straddles the cap mid-send — its tail is lost, at most one such
 *    session per cap-exhausted day. Once the cap trips, the send phase LATCHES OFF for the rest
 *    of the UTC day (one warn — not one claim/unclaim churn per 15-min tick); the latch clears
 *    on the day roll, exactly like the throttle's own budget. An un-claimed session whose 72h
 *    eligibility would expire before the next day's window is logged as an ERROR (recap lost) —
 *    cap exhaustion on consecutive days is beyond pilot scale by design.
 *
 * Zombie sessions: a crashed process leaves `ended_at IS NULL` rows behind
 * (`cleanupStaleSessions` is memory-only). The sweep closes them — every tick, OUTSIDE the send
 * window — once they've been inactive ≥6h and are absent from the in-memory session map, so a
 * Friday-night crash still recaps Saturday morning. The 72h candidate floor means a first
 * deploy never mass-mails the back catalog.
 */

import { logger } from "@pika/shared";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  clientIdentities,
  djFollows,
  emailPreferences,
  events,
  likes,
  playedTracks,
  sessions,
  sessionThanks,
  stages,
  user,
} from "../../db/schema";
import { sendPushNotification } from "../../services/push";
import { getClientIdsPushTargets } from "../persistence/push-targets";
import { hasSession } from "../sessions";
import { apiBaseUrl, webBaseUrl } from "../urls";
import { signUnsubToken } from "./email-prefs";
import { getClaimedClientIdsForUsers } from "./identity";
import {
  sendDjDigestEmail,
  sendNightRecapEmail,
  sendThrottledMarketingEmail,
} from "./mailTemplates";

export const RECAP_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

const MIN_AGE_MS = 8 * 60 * 60 * 1000; // recap no sooner than 8h after the set ended
const MAX_AGE_MS = 72 * 60 * 60 * 1000; // …and never for sessions older than 3 days
const ZOMBIE_IDLE_MS = 6 * 60 * 60 * 1000; // close a crash-orphaned open session after 6h idle

/**
 * Resolve the server-local send window from env: each hour clamped to 0–23, then the PAIR is
 * cross-validated — an inverted/empty window (start >= end) would silently never send, so it
 * falls back to the 9–13 defaults LOUDLY instead. Cross-midnight windows are deliberately
 * unsupported (single-region pilot; point the container's TZ or these hours at the pilot
 * region — see ops-manual). Exported pure for tests; read once at module load like the mail caps.
 */
export function resolveSendWindow(
  rawStart: string | undefined,
  rawEnd: string | undefined,
): { start: number; end: number } {
  const hour = (raw: string | undefined, fallback: number): number => {
    const n = Number.parseInt(raw ?? "", 10);
    return Number.isNaN(n) || n < 0 || n > 23 ? fallback : n;
  };
  const start = hour(rawStart, 9);
  const end = hour(rawEnd, 13);
  if (start >= end) {
    logger.warn("Invalid RECAP_SEND_WINDOW hours (start >= end) — using defaults 9–13", {
      start,
      end,
    });
    return { start: 9, end: 13 };
  }
  return { start, end };
}

const SEND_WINDOW = resolveSendWindow(
  process.env["RECAP_SEND_WINDOW_START_HOUR"],
  process.env["RECAP_SEND_WINDOW_END_HOUR"],
);
const MAX_SESSIONS_PER_TICK = 10;
const MIN_TRACKS_FOR_RECAP = 3; // parallels finalizeWebSet's trivial-noise floor
const PERSONAL_TRACKS_IN_EMAIL = 5;
const FLOOR_TOP_N = 3;
const MAX_ZOMBIES_PER_TICK = 50;

export interface RecapSweepDeps {
  now: () => Date;
  /** In-memory liveness check — a "zombie" row that's actually live must never be closed. */
  hasLiveSession: (sessionId: string) => boolean;
  sendRecap: typeof sendNightRecapEmail;
  sendDigest: typeof sendDjDigestEmail;
  sendMarketing: typeof sendThrottledMarketingEmail;
  sendPush: typeof sendPushNotification;
}

export const defaultRecapSweepDeps: RecapSweepDeps = {
  now: () => new Date(),
  hasLiveSession: hasSession,
  sendRecap: sendNightRecapEmail,
  sendDigest: sendDjDigestEmail,
  sendMarketing: sendThrottledMarketingEmail,
  sendPush: sendPushNotification,
};

/** Morning/noon send window, server-local (default 09:00–12:59). */
export function isInSendWindow(now: Date): boolean {
  const h = now.getHours();
  return h >= SEND_WINDOW.start && h < SEND_WINDOW.end;
}

// Day (UTC) on which the marketing budget was seen exhausted. Later ticks that day skip the
// send phase entirely instead of churning claim→unclaim + a warn every 15 minutes; the latch
// clears on the UTC day roll — the same reset the throttle's own budget uses. In-memory,
// single-process (documented architecture); a restart clears it, which is also when an operator
// would raise MARKETING_MAIL_DAILY_CAP.
let capExhaustedOnUtcDay: string | null = null;

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Test hook — clears the cap latch (mirrors resetJournalExportGuardsForTests). */
export function resetRecapSweepStateForTests(): void {
  capExhaustedOnUtcDay = null;
}

/** ≈ time until the next day's window: an un-claimed session needs at least this much 72h-floor
 * runway left, or the retry will never see it (heuristic — one day, not window-start-exact). */
const RETRY_RUNWAY_MS = 24 * 60 * 60 * 1000;

/**
 * Close crash-orphaned sessions: `ended_at IS NULL`, absent from the in-memory map, and idle
 * (last play, else start) ≥6h. `ended_at` is backdated to the last real activity so the recap's
 * age gates behave as if the session had ended properly.
 */
export async function closeZombieSessions(
  deps: RecapSweepDeps = defaultRecapSweepDeps,
): Promise<number> {
  const cutoff = deps.now().getTime() - ZOMBIE_IDLE_MS;
  const openRows = await db
    .select({ id: sessions.id, startedAt: sessions.startedAt })
    .from(sessions)
    .where(and(isNull(sessions.endedAt), lte(sessions.startedAt, new Date(cutoff))))
    .limit(MAX_ZOMBIES_PER_TICK);

  let closed = 0;
  for (const row of openRows) {
    if (deps.hasLiveSession(row.id)) continue; // a genuinely live long set
    const [lastPlay] = await db
      .select({ playedAt: playedTracks.playedAt })
      .from(playedTracks)
      .where(eq(playedTracks.sessionId, row.id))
      .orderBy(desc(playedTracks.playedAt))
      .limit(1);
    const lastActivity = lastPlay?.playedAt ?? row.startedAt;
    if (lastActivity.getTime() > cutoff) continue; // recent plays — leave it alone
    await db
      .update(sessions)
      .set({ endedAt: lastActivity })
      .where(and(eq(sessions.id, row.id), isNull(sessions.endedAt)));
    closed += 1;
    logger.info("🧟 Closed zombie session", { sessionId: row.id });
  }
  return closed;
}

interface CandidateSession {
  id: string;
  djUserId: string | null;
  djName: string;
  startedAt: Date;
  endedAt: Date | null;
  stageId: string | null;
}

/**
 * One sweep tick. Zombie-close runs EVERY tick; sends only inside the window (unless
 * `ignoreWindow` — the admin smoke trigger). Never throws.
 */
export async function sweepRecaps(
  deps: RecapSweepDeps = defaultRecapSweepDeps,
  opts: { ignoreWindow?: boolean } = {},
): Promise<{
  closedZombies: number;
  sessionsRecapped: number;
  emailsSent: number;
  capExhausted: boolean;
}> {
  let closedZombies = 0;
  let sessionsRecapped = 0;
  let emailsSent = 0;
  const latched = () => capExhaustedOnUtcDay === utcDay(deps.now());
  try {
    closedZombies = await closeZombieSessions(deps);

    if (!opts.ignoreWindow && !isInSendWindow(deps.now())) {
      return { closedZombies, sessionsRecapped, emailsSent, capExhausted: latched() };
    }

    // Budget already seen exhausted today — every send would cap again; the warn fired when the
    // latch was set. Stay quiet (zombie-close above still ran) until the UTC day rolls.
    if (latched()) {
      return { closedZombies, sessionsRecapped, emailsSent, capExhausted: true };
    }

    const now = deps.now().getTime();
    const candidates = (await db
      .select({
        id: sessions.id,
        djUserId: sessions.djUserId,
        djName: sessions.djName,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
        stageId: sessions.stageId,
      })
      .from(sessions)
      .where(
        and(
          isNull(sessions.recapProcessedAt),
          isNotNull(sessions.endedAt),
          gte(sessions.endedAt, new Date(now - MAX_AGE_MS)),
          lte(sessions.endedAt, new Date(now - MIN_AGE_MS)),
          // trackCount is NOT a sessions column — correlated count over played_tracks.
          sql`(select count(*) from played_tracks where played_tracks.session_id = ${sessions.id}) >= ${MIN_TRACKS_FOR_RECAP}`,
        ),
      )
      .orderBy(asc(sessions.endedAt))
      .limit(MAX_SESSIONS_PER_TICK)) as CandidateSession[];

    for (const s of candidates) {
      // CLAIM exactly once — a concurrent tick (or restart replay) loses this UPDATE and skips.
      const claimed = await db
        .update(sessions)
        .set({ recapProcessedAt: deps.now() })
        .where(and(eq(sessions.id, s.id), isNull(sessions.recapProcessedAt)))
        .returning({ id: sessions.id });
      if (claimed.length === 0) continue;

      const result = await processSessionRecap(s, deps);
      emailsSent += result.emailsSent;
      if (result.capped) {
        // Latch the rest of the UTC day: later ticks skip the send phase instead of re-claiming
        // and re-un-claiming this same session with a warn every 15 minutes.
        capExhaustedOnUtcDay = utcDay(deps.now());
        if (result.emailsSent === 0) {
          // Capped before sending ANYTHING — un-claim so it retries in the NEXT day's window
          // instead of being permanently marked processed with zero recaps sent.
          await db.update(sessions).set({ recapProcessedAt: null }).where(eq(sessions.id, s.id));
          // If its 72h eligibility runs out before that retry, the recap is LOST — say so
          // loudly now (fuse philosophy), because tomorrow's candidate query won't see it.
          if (
            s.endedAt &&
            s.endedAt.getTime() + MAX_AGE_MS - deps.now().getTime() < RETRY_RUNWAY_MS
          ) {
            logger.error(
              "❌ Capped recap session will age out before the next send window — recap lost",
              undefined,
              { sessionId: s.id, endedAt: s.endedAt.toISOString() },
            );
          }
        } else {
          // Straddled the boundary (sent ≥1, then capped) — its tail is lost, at most one session
          // per cap-exhausted day. Kept claimed to avoid re-mailing the head. Acceptable residual.
          sessionsRecapped += 1;
        }
        logger.warn("Recap sweep — marketing daily cap reached; latched off until the day rolls", {
          sessionId: s.id,
          emailsSent: result.emailsSent,
          unclaimed: result.emailsSent === 0,
        });
        break;
      }
      sessionsRecapped += 1;
    }
  } catch (error) {
    logger.error("❌ Recap sweep tick failed", error);
  }
  if (sessionsRecapped > 0 || closedZombies > 0) {
    logger.info("🌅 Recap sweep tick", { closedZombies, sessionsRecapped, emailsSent });
  }
  return { closedZombies, sessionsRecapped, emailsSent, capExhausted: latched() };
}

/** Build + send everything for one claimed session. Best-effort per recipient. */
async function processSessionRecap(
  s: CandidateSession,
  deps: RecapSweepDeps,
): Promise<{ emailsSent: number; capped: boolean }> {
  let emailsSent = 0;

  // ── Shared context ────────────────────────────────────────────────────────
  let dj: { email: string; slug: string | null; digestOptInAt: Date | null } | null = null;
  if (s.djUserId) {
    const [row] = await db
      .select({
        email: user.email,
        slug: user.slug,
        digestOptInAt: emailPreferences.digestOptInAt,
      })
      .from(user)
      .leftJoin(emailPreferences, eq(emailPreferences.userId, user.id))
      .where(eq(user.id, s.djUserId))
      .limit(1);
    dj = row ?? null;
  }

  let eventLabel: string | null = null;
  if (s.stageId) {
    const [row] = await db
      .select({ stageName: stages.name, eventName: events.name })
      .from(stages)
      .leftJoin(events, eq(events.id, stages.eventId))
      .where(eq(stages.id, s.stageId))
      .limit(1);
    eventLabel = row?.eventName ?? row?.stageName ?? null;
  }

  const dateLabel = s.startedAt.toLocaleDateString("en-GB", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const likeAgg = await db
    .select({ playedTrackId: likes.playedTrackId, n: count() })
    .from(likes)
    .where(eq(likes.sessionId, s.id))
    .groupBy(likes.playedTrackId);
  const totalLikes = likeAgg.reduce((sum, r) => sum + r.n, 0);
  if (totalLikes === 0) return { emailsSent, capped: false }; // nothing to recap

  const topIds = [...likeAgg]
    .sort((a, b) => b.n - a.n)
    .slice(0, FLOOR_TOP_N)
    .map((r) => r.playedTrackId);
  const topRows = topIds.length
    ? await db
        .select({ id: playedTracks.id, artist: playedTracks.artist, title: playedTracks.title })
        .from(playedTracks)
        .where(inArray(playedTracks.id, topIds))
    : [];
  const likesById = new Map(likeAgg.map((r) => [r.playedTrackId, r.n]));
  const floorTop = topIds.flatMap((id) => {
    const row = topRows.find((t) => t.id === id);
    return row ? [{ artist: row.artist, title: row.title, likes: likesById.get(id) ?? 0 }] : [];
  });

  const web = webBaseUrl();
  const api = apiBaseUrl();
  const recapUrl = `${web}/recap/${s.id}?ref=recap`;
  const boothUrl = dj?.slug ? `${web}/dj/${dj.slug}?ref=recap` : null;

  // ── Dancer recaps ─────────────────────────────────────────────────────────
  const recipients = await db
    .selectDistinct({ userId: clientIdentities.userId, email: user.email })
    .from(likes)
    .innerJoin(clientIdentities, eq(clientIdentities.clientId, likes.clientId))
    .innerJoin(
      emailPreferences,
      and(
        eq(emailPreferences.userId, clientIdentities.userId),
        isNotNull(emailPreferences.recapOptInAt),
      ),
    )
    .innerJoin(user, eq(user.id, clientIdentities.userId))
    .where(eq(likes.sessionId, s.id));

  // Each recipient's personal likes for the set, fetched in ONE query and bucketed by user
  // (was one query per recipient). DISTINCT ON (user, play) keeps the earliest like of a track
  // liked from two of their devices — same semantics as the old per-recipient query.
  const recipientIds = recipients.map((r) => r.userId);
  const personalRows = recipientIds.length
    ? await db
        .selectDistinctOn([clientIdentities.userId, likes.playedTrackId], {
          userId: clientIdentities.userId,
          artist: playedTracks.artist,
          title: playedTracks.title,
          likedAt: likes.createdAt,
        })
        .from(likes)
        .innerJoin(clientIdentities, eq(clientIdentities.clientId, likes.clientId))
        .innerJoin(playedTracks, eq(likes.playedTrackId, playedTracks.id))
        .where(and(eq(likes.sessionId, s.id), inArray(clientIdentities.userId, recipientIds)))
        .orderBy(clientIdentities.userId, likes.playedTrackId, asc(likes.createdAt))
    : [];
  const personalByUser = new Map<string, { artist: string; title: string; likedAt: Date }[]>();
  for (const row of personalRows) {
    const list = personalByUser.get(row.userId) ?? [];
    list.push({ artist: row.artist, title: row.title, likedAt: row.likedAt });
    personalByUser.set(row.userId, list);
  }

  const pushUserIds: string[] = [];
  for (const r of recipients) {
    try {
      const personal = personalByUser.get(r.userId) ?? [];
      if (personal.length === 0) continue;

      const token = signUnsubToken(r.userId, "recap");
      const ordered = [...personal].sort((a, b) => a.likedAt.getTime() - b.likedAt.getTime());
      const outcome = await deps.sendMarketing("recap", r.email, () =>
        deps.sendRecap({
          to: r.email,
          djName: s.djName,
          eventLabel,
          dateLabel,
          personalTracks: ordered
            .slice(0, PERSONAL_TRACKS_IN_EMAIL)
            .map(({ artist, title }) => ({ artist, title })),
          personalTotal: personal.length,
          floorTop,
          journalUrl: `${web}/my-likes?ref=recap`,
          boothUrl,
          recapUrl,
          unsubPageUrl: `${web}/unsubscribe?token=${encodeURIComponent(token)}`,
          unsubApiUrl: `${api}/api/email/unsubscribe?token=${encodeURIComponent(token)}`,
          idempotencyKey: `recap:${s.id}:${r.userId}`,
        }),
      );
      if (outcome === "capped") return { emailsSent, capped: true };
      if (outcome === "sent") {
        emailsSent += 1;
        pushUserIds.push(r.userId);
      }
    } catch (error) {
      logger.error("Recap email failed for a recipient — continuing", error);
    }
  }

  // ── DJ digest (explicit opt-in) ───────────────────────────────────────────
  if (s.djUserId && dj?.digestOptInAt && dj.email) {
    try {
      const [[trackTally], [dancerTally], [thanksTally], [followerTally]] = await Promise.all([
        db.select({ n: count() }).from(playedTracks).where(eq(playedTracks.sessionId, s.id)),
        db
          .select({ n: sql<string>`count(distinct ${likes.clientId})` })
          .from(likes)
          .where(eq(likes.sessionId, s.id)),
        db.select({ n: count() }).from(sessionThanks).where(eq(sessionThanks.sessionId, s.id)),
        db
          .select({ n: count() })
          .from(djFollows)
          .where(and(eq(djFollows.djUserId, s.djUserId), gte(djFollows.createdAt, s.startedAt))),
      ]);
      const token = signUnsubToken(s.djUserId, "digest");
      const outcome = await deps.sendMarketing("digest", dj.email, () =>
        deps.sendDigest({
          to: dj.email,
          djName: s.djName,
          eventLabel,
          dateLabel,
          trackCount: trackTally?.n ?? 0,
          totalLikes,
          uniqueDancers: Number(dancerTally?.n ?? 0),
          thanksCount: thanksTally?.n ?? 0,
          newFollowers: followerTally?.n ?? 0,
          topTracks: floorTop,
          recapUrl: dj.slug ? `${web}/dj/${dj.slug}/recap/${s.id}` : recapUrl,
          unsubPageUrl: `${web}/unsubscribe?token=${encodeURIComponent(token)}`,
          unsubApiUrl: `${api}/api/email/unsubscribe?token=${encodeURIComponent(token)}`,
          idempotencyKey: `digest:${s.id}`,
        }),
      );
      if (outcome === "capped") return { emailsSent, capped: true };
      if (outcome === "sent") emailsSent += 1;
    } catch (error) {
      logger.error("DJ digest email failed — continuing", error);
    }
  }

  // ── Push bonus (installed PWAs of emailed recipients) ─────────────────────
  try {
    if (pushUserIds.length > 0) {
      const allClientIds = await getClaimedClientIdsForUsers(pushUserIds);
      const targets = await getClientIdsPushTargets(allClientIds);
      if (targets.length > 0) {
        const payload = JSON.stringify({
          title: `Your night with ${s.djName} ⚡`,
          body: "Your Night Recap is ready — open your journal.",
          url: "/my-likes?ref=recap-push",
        });
        await Promise.allSettled(targets.map((t) => deps.sendPush(t, payload)));
      }
    }
  } catch (error) {
    logger.error("Recap push fan-out failed — continuing", error);
  }

  return { emailsSent, capped: false };
}
