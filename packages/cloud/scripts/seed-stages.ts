/**
 * Seed known Events / Stages for a venue (idempotent — upsert by id).
 *
 * Usage: bun run packages/cloud/scripts/seed-stages.ts
 * Edit the SEED constant below for your event. Safe to re-run.
 *
 * @file packages/cloud/scripts/seed-stages.ts
 */

import { db } from "../src/db";
import { events, stages } from "../src/db/schema";

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

async function seed() {
  for (const ev of SEED) {
    await db
      .insert(events)
      .values({ id: ev.id, name: ev.name })
      .onConflictDoUpdate({ target: events.id, set: { name: ev.name } });

    for (const st of ev.stages) {
      await db
        .insert(stages)
        .values({ id: st.id, name: st.name, eventId: ev.id })
        .onConflictDoUpdate({ target: stages.id, set: { name: st.name, eventId: ev.id } });
    }
    console.log(`✅ Seeded event "${ev.name}" (${ev.id}) with ${ev.stages.length} stage(s)`);
  }
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Seed failed", e);
    process.exit(1);
  });
