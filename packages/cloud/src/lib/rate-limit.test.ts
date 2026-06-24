import { describe, expect, it } from "bun:test";
import { ClientRateLimiter } from "./rate-limit";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("ClientRateLimiter", () => {
  it("allows up to max, then rejects within the window", () => {
    const rl = new ClientRateLimiter(3, 10_000);
    expect(rl.check("a")).toBe(true);
    expect(rl.check("a")).toBe(true);
    expect(rl.check("a")).toBe(true);
    expect(rl.check("a")).toBe(false);
    expect(rl.check("a")).toBe(false);
  });

  it("tracks clients independently", () => {
    const rl = new ClientRateLimiter(1, 10_000);
    expect(rl.check("a")).toBe(true);
    expect(rl.check("b")).toBe(true);
    expect(rl.check("a")).toBe(false);
  });

  it("does not count rejected attempts (no permanent lockout)", async () => {
    const rl = new ClientRateLimiter(2, 40);
    expect(rl.check("a")).toBe(true);
    expect(rl.check("a")).toBe(true);
    expect(rl.check("a")).toBe(false);
    await sleep(60);
    expect(rl.check("a")).toBe(true);
  });

  it("cleanup() drops clients whose window has fully aged out", async () => {
    const rl = new ClientRateLimiter(5, 30);
    rl.check("a");
    expect(rl.size).toBe(1);
    expect(rl.cleanup()).toBe(0); // still fresh
    await sleep(45);
    expect(rl.cleanup()).toBe(1);
    expect(rl.size).toBe(0);
  });
});
