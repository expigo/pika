/**
 * Seed known Events / Stages for a venue (idempotent — upsert by id).
 *
 * Usage:
 *   bun run db:seed:stages -- dj@example.com   # own the events (so they show in that DJ's picker)
 *   SEED_OWNER_EMAIL=dj@example.com bun run db:seed:stages
 *   bun run db:seed:stages                      # unowned (join-by-code only)
 *
 * The owner-scoped picker (GET /api/events) only lists events a DJ owns, so to
 * see seeded stages in the desktop picker you must pass that DJ's email. With no
 * owner, the events are still created and reachable by stage id (join-by-code /
 * QR), they just won't appear in anyone's picker.
 *
 * Edit the SEED constant below for your event. Safe to re-run.
 *
 * @file packages/cloud/scripts/seed-stages.ts
 */

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { djUsers, events, stages } from "../src/db/schema";

interface SeedStage {
  id: string;
  name: string;
}
interface SeedEvent {
  id: string;
  name: string;
  stages: SeedStage[];
}

// --- Edit for your event ----------------------------------------------------
const SEED: SeedEvent[] = [
  {
    id: "demo-event",
    name: "Pika! Demo Event",
    stages: [
      { id: "main-floor", name: "Main Floor" },
      { id: "lobby", name: "Hotel Lobby" },
    ],
  },
];
// ---------------------------------------------------------------------------

async function resolveOwnerId(): Promise<number | null> {
  const email = (process.argv[2] ?? process.env.SEED_OWNER_EMAIL)?.trim().toLowerCase();
  if (!email) {
    console.warn(
      "⚠️  No owner email given — seeding UNOWNED events. They won't appear in any DJ's picker " +
        "(owner-scoped); reachable by stage id only. Pass an email: `bun run db:seed:stages -- dj@example.com`",
    );
    return null;
  }
  const [dj] = await db.select({ id: djUsers.id }).from(djUsers).where(eq(djUsers.email, email));
  if (!dj) {
    console.warn(
      `⚠️  No DJ found for "${email}" — seeding UNOWNED. Register that DJ first to own them.`,
    );
    return null;
  }
  console.log(`👤 Owning seeded events as DJ "${email}" (id ${dj.id})`);
  return dj.id;
}

async function seed() {
  const ownerUserId = await resolveOwnerId();

  for (const ev of SEED) {
    await db
      .insert(events)
      .values({ id: ev.id, name: ev.name, ownerUserId })
      .onConflictDoUpdate({ target: events.id, set: { name: ev.name, ownerUserId } });

    for (const st of ev.stages) {
      await db
        .insert(stages)
        .values({ id: st.id, name: st.name, eventId: ev.id })
        .onConflictDoUpdate({ target: stages.id, set: { name: st.name, eventId: ev.id } });
    }
    const ids = ev.stages.map((s) => s.id).join(", ");
    console.log(`✅ Seeded event "${ev.name}" (${ev.id}) → stages: ${ids}`);
  }
  console.log("ℹ️  Stage ids above double as the QR target (/stage/{id}) and the join code.");
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Seed failed", e);
    process.exit(1);
  });
