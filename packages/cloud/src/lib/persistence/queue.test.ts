import { describe, expect, it } from "bun:test";
import {
  cleanupSessionQueue,
  enqueuePersistence,
  getSessionQueueCount,
  SessionQueue,
} from "./queue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("SessionQueue", () => {
  it("runs tasks serially in FIFO order", async () => {
    const q = new SessionQueue("s");
    const order: number[] = [];
    const d1 = deferred();

    const p1 = q.enqueue(async () => {
      await d1.promise;
      order.push(1);
    });
    const p2 = q.enqueue(async () => {
      order.push(2);
    });

    // task2 must not run until task1 finishes
    await tick();
    expect(order).toEqual([]);

    d1.resolve();
    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
  });

  it("isolates a failing task — the next still runs", async () => {
    const q = new SessionQueue("s");
    const ran: number[] = [];

    const p1 = q.enqueue(async () => {
      throw new Error("boom");
    });
    const p2 = q.enqueue(async () => {
      ran.push(2);
    });

    await expect(p1).rejects.toThrow("boom");
    await p2;
    expect(ran).toEqual([2]);
  });

  it("drops (but resolves) tasks past maxDepth", async () => {
    const q = new SessionQueue("s", 2); // at most 2 pending
    const d1 = deferred();
    const ran = { t2: false, t3: false, overflow: false };

    const p1 = q.enqueue(async () => {
      await d1.promise;
    }); // starts processing, blocks
    const p2 = q.enqueue(async () => {
      ran.t2 = true;
    }); // queued (depth 1)
    const p3 = q.enqueue(async () => {
      ran.t3 = true;
    }); // queued (depth 2)
    const pOver = q.enqueue(async () => {
      ran.overflow = true;
    }); // depth == maxDepth → dropped

    // a dropped task resolves immediately and never runs
    await pOver;
    expect(ran.overflow).toBe(false);

    d1.resolve();
    await Promise.all([p1, p2, p3]);
    expect(ran.t2).toBe(true);
    expect(ran.t3).toBe(true);
    expect(ran.overflow).toBe(false);
  });

  it("after close(), drops new tasks and fires onCloseDrained once drained", async () => {
    const d1 = deferred();
    let drained = 0;
    const q = new SessionQueue("s", 10, () => {
      drained++;
    });

    const p1 = q.enqueue(async () => {
      await d1.promise;
    });
    q.close();

    let lateRan = false;
    const pLate = q.enqueue(async () => {
      lateRan = true;
    });
    await pLate; // dropped + resolved
    expect(lateRan).toBe(false);
    expect(drained).toBe(0); // still draining task1

    d1.resolve();
    await p1;
    await tick();
    expect(drained).toBe(1);
  });
});

describe("enqueuePersistence / cleanupSessionQueue", () => {
  it("cleanup removes an idle queue immediately", async () => {
    const before = getSessionQueueCount();
    await enqueuePersistence("cleanup-idle", async () => {});
    expect(getSessionQueueCount()).toBe(before + 1);

    cleanupSessionQueue("cleanup-idle");
    expect(getSessionQueueCount()).toBe(before);
  });

  it("cleanup on a busy queue defers removal and spawns no second queue", async () => {
    const before = getSessionQueueCount();
    const d1 = deferred();
    const sid = "cleanup-busy";

    const p1 = enqueuePersistence(sid, async () => {
      await d1.promise;
    });
    expect(getSessionQueueCount()).toBe(before + 1);

    // Cleanup while busy → closed, NOT deleted.
    cleanupSessionQueue(sid);
    expect(getSessionQueueCount()).toBe(before + 1);

    // A late persist must reuse the (closed) queue, not create a 2nd one.
    let lateRan = false;
    await enqueuePersistence(sid, async () => {
      lateRan = true;
    });
    expect(getSessionQueueCount()).toBe(before + 1);
    expect(lateRan).toBe(false);

    // Drain → self-removes from the map.
    d1.resolve();
    await p1;
    await tick();
    expect(getSessionQueueCount()).toBe(before);
  });
});
