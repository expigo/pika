/**
 * Mail service unit tests — DI only (injected fetch/env fns; never mock.module). The keyless
 * behavior split is the load-bearing contract: dev logs the link, production fails loudly.
 */

import { describe, expect, test } from "bun:test";
import {
  type MailDeps,
  MailNotConfiguredError,
  MailSendError,
  sendEmail,
  sendMagicLinkEmail,
} from "./mail";

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

describe("sendMagicLinkEmail", () => {
  test("puts the raw URL in text (the dev-fallback log contract)", async () => {
    const { deps, calls } = makeDeps();
    await sendMagicLinkEmail({ to: "d@e.f", url: "https://api.test/verify?token=x" }, deps);
    const body = JSON.parse(String(calls[0]?.init?.body)) as { text: string; html: string };
    expect(body.text).toContain("https://api.test/verify?token=x");
    expect(body.html).toContain("https://api.test/verify?token=x");
  });
});
