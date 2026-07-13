/**
 * Message-layer unit tests (templates + throttled send orchestration) — DI only (injected
 * fetch/env/throttle fns; never mock.module). Split (2026-07) from mail.test.ts alongside the
 * mailTemplates.ts extraction; FetchCall/makeDeps are duplicated verbatim from mail.test.ts.
 */

import { describe, expect, test } from "bun:test";
import type { EmailThrottle, EmailThrottleVerdict } from "./email-throttle";
import { type MailDeps, MailThrottledError } from "./mail";
import {
  type AuthMailDeps,
  handleDeletionEmailSend,
  handleMagicLinkSend,
  handleOtpSend,
  sendDjDigestEmail,
  sendMagicLinkEmail,
  sendNightRecapEmail,
  sendSignInOtpEmail,
  sendThrottledMarketingEmail,
} from "./mailTemplates";

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function makeDeps(overrides: Partial<MailDeps> = {}): { deps: MailDeps; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const deps: MailDeps = {
    fetchImpl: ((url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return Promise.resolve(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    }) as typeof fetch,
    apiKey: () => "re_test_key",
    from: () => "Pika! <journal@pika.stream>",
    isProduction: () => false,
    ...overrides,
  };
  return { deps, calls };
}

describe("sendMagicLinkEmail", () => {
  test("puts the raw URL in text (the dev-fallback log contract)", async () => {
    const { deps, calls } = makeDeps();
    await sendMagicLinkEmail({ to: "d@e.f", url: "https://api.test/verify?token=x" }, deps);
    const body = JSON.parse(String(calls[0]?.init?.body)) as { text: string; html: string };
    expect(body.text).toContain("https://api.test/verify?token=x");
    expect(body.html).toContain("https://api.test/verify?token=x");
  });

  test("carries the Requested-at uniquifier in html AND text (Gmail trims identical bodies)", async () => {
    const { deps, calls } = makeDeps();
    await sendMagicLinkEmail({ to: "d@e.f", url: "https://api.test/verify?token=x" }, deps);
    const body = JSON.parse(String(calls[0]?.init?.body)) as { text: string; html: string };
    expect(body.html).toMatch(/Requested at .+\d{2}:\d{2}:\d{2}/);
    expect(body.text).toMatch(/Requested at .+\d{2}:\d{2}:\d{2}/);
  });
});

/** Throttle-aware auth send handlers — verdicts map to send/silent-skip/loud-throw. */
function makeAuthDeps(verdict: EmailThrottleVerdict): {
  deps: AuthMailDeps;
  sends: { sender: string; to: string; payload: string }[];
  acquired: { kind: string; email: string }[];
} {
  const sends: { sender: string; to: string; payload: string }[] = [];
  const acquired: { kind: string; email: string }[] = [];
  const throttle: EmailThrottle = {
    tryAcquire: (kind, email) => {
      acquired.push({ kind, email });
      return verdict;
    },
  };
  const deps: AuthMailDeps = {
    throttle,
    sendMagicLink: async ({ to, url }) => {
      sends.push({ sender: "magic-link", to, payload: url });
      return { delivered: true };
    },
    sendOtp: async ({ to, otp }) => {
      sends.push({ sender: "otp", to, payload: otp });
      return { delivered: true };
    },
    sendDeletion: async ({ to, url }) => {
      sends.push({ sender: "deletion", to, payload: url });
      return { delivered: true };
    },
  };
  return { deps, sends, acquired };
}

const authArgs = { email: "d@e.f", url: "https://api.test/verify?token=x" };

describe("handleMagicLinkSend / handleOtpSend / handleDeletionEmailSend", () => {
  test("ok → sends and reports 'sent'", async () => {
    const { deps, sends, acquired } = makeAuthDeps("ok");
    expect(await handleMagicLinkSend(authArgs, deps)).toBe("sent");
    expect(sends).toEqual([{ sender: "magic-link", to: "d@e.f", payload: authArgs.url }]);
    expect(acquired).toEqual([{ kind: "sign-in", email: "d@e.f" }]);
  });

  test("link and OTP share ONE 'sign-in' throttle kind (no doubled per-inbox budget)", async () => {
    const { deps, sends, acquired } = makeAuthDeps("ok");
    expect(await handleOtpSend({ email: "d@e.f", otp: "123456" }, deps)).toBe("sent");
    expect(sends).toEqual([{ sender: "otp", to: "d@e.f", payload: "123456" }]);
    expect(acquired).toEqual([{ kind: "sign-in", email: "d@e.f" }]);
  });

  test("address_limited → silent skip, nothing sent (anti-enumeration)", async () => {
    const { deps, sends } = makeAuthDeps("address_limited");
    expect(await handleMagicLinkSend(authArgs, deps)).toBe("skipped");
    expect(await handleOtpSend({ email: "d@e.f", otp: "123456" }, deps)).toBe("skipped");
    expect(sends.length).toBe(0);
  });

  test("daily_capped → throws MailThrottledError, nothing sent (loud ops signal)", async () => {
    const { deps, sends } = makeAuthDeps("daily_capped");
    expect(handleMagicLinkSend(authArgs, deps)).rejects.toThrow(MailThrottledError);
    expect(handleOtpSend({ email: "d@e.f", otp: "123456" }, deps)).rejects.toThrow(
      MailThrottledError,
    );
    expect(sends.length).toBe(0);
  });

  test("deletion handler uses its own throttle kind and the deletion sender", async () => {
    const { deps, sends, acquired } = makeAuthDeps("ok");
    expect(await handleDeletionEmailSend(authArgs, deps)).toBe("sent");
    expect(sends).toEqual([{ sender: "deletion", to: "d@e.f", payload: authArgs.url }]);
    expect(acquired).toEqual([{ kind: "account-deletion", email: "d@e.f" }]);
  });
});

describe("sendSignInOtpEmail", () => {
  test("puts the code in html AND text, with the uniquifier", async () => {
    const { deps, calls } = makeDeps();
    await sendSignInOtpEmail({ to: "d@e.f", otp: "481227" }, deps);
    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      subject: string;
      text: string;
      html: string;
    };
    expect(body.subject).toBe("Your Pika! sign-in code");
    expect(body.html).toContain("481227");
    expect(body.text).toContain("481227");
    expect(body.text).toMatch(/Requested at /);
  });
});

// ============================================================================
// Marketing email (Slice C)
// ============================================================================

const recapInput = {
  to: "dancer@x.y",
  djName: "DJ <Nova> & Co",
  eventLabel: "Westie Wednesday",
  dateLabel: "Friday, Jul 4",
  personalTracks: [{ artist: "Daft Punk", title: "Get <Lucky>" }],
  personalTotal: 7,
  floorTop: [{ artist: "A", title: "B", likes: 12 }],
  journalUrl: "https://web.test/my-likes?ref=recap",
  boothUrl: "https://web.test/dj/dj-nova?ref=recap",
  recapUrl: "https://web.test/recap/s1?ref=recap",
  unsubPageUrl: "https://web.test/unsubscribe?token=T",
  unsubApiUrl: "https://api.test/api/email/unsubscribe?token=T",
  idempotencyKey: "recap:s1:u1",
};

describe("sendNightRecapEmail / sendDjDigestEmail", () => {
  test("recap: renders html+text, escapes user strings, carries RFC 8058 headers + key", async () => {
    const { deps, calls } = makeDeps();
    await sendNightRecapEmail(recapInput, deps);
    const httpHeaders = calls[0]?.init?.headers as Record<string, string>;
    expect(httpHeaders["Idempotency-Key"]).toBe("recap:s1:u1");
    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      subject: string;
      html: string;
      text: string;
      headers: Record<string, string>;
    };
    expect(body.subject).toBe("Your night with DJ <Nova> & Co ⚡");
    expect(body.headers["List-Unsubscribe"]).toBe(
      "<https://api.test/api/email/unsubscribe?token=T>",
    );
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    // User strings are escaped in HTML (never raw <, &) and readable in text.
    expect(body.html).toContain("DJ &lt;Nova&gt; &amp; Co");
    expect(body.html).toContain("Get &lt;Lucky&gt;");
    expect(body.html).not.toContain("Get <Lucky>");
    expect(body.text).toContain("Get <Lucky> — Daft Punk");
    expect(body.text).toContain("…and 6 more in your journal.");
    expect(body.text).toContain("Unsubscribe: https://web.test/unsubscribe?token=T");
    expect(body.html).toContain(recapInput.journalUrl);
    expect(body.html).toContain(recapInput.boothUrl);
  });

  test("digest: stats + top tracks + consent footer, its own idempotency key", async () => {
    const { deps, calls } = makeDeps();
    await sendDjDigestEmail(
      {
        to: "dj@x.y",
        djName: "DJ Nova",
        eventLabel: null,
        dateLabel: "Friday, Jul 4",
        trackCount: 42,
        totalLikes: 130,
        uniqueDancers: 27,
        thanksCount: 9,
        newFollowers: 4,
        topTracks: [{ artist: "A", title: "B", likes: 12 }],
        recapUrl: "https://web.test/dj/dj-nova/recap/s1",
        unsubPageUrl: "https://web.test/unsubscribe?token=D",
        unsubApiUrl: "https://api.test/api/email/unsubscribe?token=D",
        idempotencyKey: "digest:s1",
      },
      deps,
    );
    const httpHeaders = calls[0]?.init?.headers as Record<string, string>;
    expect(httpHeaders["Idempotency-Key"]).toBe("digest:s1");
    const body = JSON.parse(String(calls[0]?.init?.body)) as { html: string; text: string };
    expect(body.text).toContain("Likes: 130");
    expect(body.text).toContain("Thank-yous: 9");
    expect(body.text).toContain("New followers: 4");
    expect(body.html).toContain("set digests in your Booth");
  });
});

describe("sendThrottledMarketingEmail", () => {
  const throttleWith = (verdict: EmailThrottleVerdict): EmailThrottle => ({
    tryAcquire: () => verdict,
  });

  test("ok → sends", async () => {
    let sent = 0;
    const out = await sendThrottledMarketingEmail(
      "recap",
      "a@b.c",
      async () => {
        sent += 1;
        return { delivered: true };
      },
      throttleWith("ok"),
    );
    expect(out).toBe("sent");
    expect(sent).toBe(1);
  });

  test("address_limited → skips silently; daily_capped → 'capped' WITHOUT throwing", async () => {
    // Marketing is best-effort by contract — unlike the transactional path, a capped batch
    // must stop, not explode the sweep.
    let sent = 0;
    const send = async () => {
      sent += 1;
      return { delivered: true };
    };
    expect(
      await sendThrottledMarketingEmail("recap", "a@b.c", send, throttleWith("address_limited")),
    ).toBe("skipped");
    expect(
      await sendThrottledMarketingEmail("digest", "a@b.c", send, throttleWith("daily_capped")),
    ).toBe("capped");
    expect(sent).toBe(0);
  });
});
