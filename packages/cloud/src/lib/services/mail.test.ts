/**
 * Mail transport unit tests — DI only (injected fetch/env fns; never mock.module). The keyless
 * behavior split is the load-bearing contract: dev logs the link, production fails loudly.
 * Template + throttled-orchestration tests live in mailTemplates.test.ts (2026-07 split).
 */

import { describe, expect, test } from "bun:test";
import { type MailDeps, MailNotConfiguredError, MailSendError, sendEmail } from "./mail";

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

const input = { to: "a@b.c", subject: "s", html: "<p>h</p>", text: "t https://link" };

describe("sendEmail", () => {
  test("keyless outside production → logged fallback, NOT delivered, no fetch", async () => {
    const { deps, calls } = makeDeps({ apiKey: () => undefined });
    const res = await sendEmail(input, deps);
    expect(res.delivered).toBe(false);
    expect(calls.length).toBe(0);
  });

  test("keyless in production → MailNotConfiguredError (never a silent dead flow)", async () => {
    const { deps } = makeDeps({ apiKey: () => undefined, isProduction: () => true });
    expect(sendEmail(input, deps)).rejects.toThrow(MailNotConfiguredError);
  });

  test("with key → POSTs the Resend shape", async () => {
    const { deps, calls } = makeDeps();
    const res = await sendEmail(input, deps);
    expect(res.delivered).toBe(true);
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    expect(calls[0]?.init?.method).toBe("POST");
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_test_key",
    );
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      from: "Pika! <journal@pika.stream>",
      to: "a@b.c",
      subject: "s",
      html: "<p>h</p>",
      text: "t https://link",
    });
  });

  test("non-2xx → MailSendError carrying the status", async () => {
    const { deps } = makeDeps({
      fetchImpl: (() =>
        Promise.resolve(new Response("rate limited", { status: 429 }))) as typeof fetch,
    });
    try {
      await sendEmail(input, deps);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(MailSendError);
      expect((e as MailSendError).status).toBe(429);
    }
  });
});

describe("sendEmail header placement (Slice C)", () => {
  test("message headers go in the BODY; Idempotency-Key goes in the HTTP request headers", async () => {
    // The two placements are different beasts: body `headers` become MESSAGE headers
    // (List-Unsubscribe), the HTTP header drives Resend's API-level dedup. Routing the
    // idempotency key into the body would silently disable the double-send defense.
    const { deps, calls } = makeDeps();
    await sendEmail(
      {
        ...input,
        headers: { "List-Unsubscribe": "<https://api.test/u?token=t>" },
        idempotencyKey: "recap:s1:u1",
      },
      deps,
    );
    const httpHeaders = calls[0]?.init?.headers as Record<string, string>;
    expect(httpHeaders["Idempotency-Key"]).toBe("recap:s1:u1");
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body["headers"]).toEqual({ "List-Unsubscribe": "<https://api.test/u?token=t>" });
    expect(body["Idempotency-Key"]).toBeUndefined();
  });

  test("neither field is emitted when absent (transactional sends unchanged)", async () => {
    const { deps, calls } = makeDeps();
    await sendEmail(input, deps);
    const httpHeaders = calls[0]?.init?.headers as Record<string, string>;
    expect(httpHeaders["Idempotency-Key"]).toBeUndefined();
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body["headers"]).toBeUndefined();
  });
});
