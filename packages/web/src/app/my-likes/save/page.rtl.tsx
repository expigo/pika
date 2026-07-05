import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render, screen, userEvent } from "../../../test/rtl";

vi.mock("@/lib/authClient", () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: null, isPending: false })),
    signIn: {
      magicLink: vi.fn(async () => ({ data: {}, error: null })),
      emailOtp: vi.fn(async () => ({ data: {}, error: null })),
    },
    emailOtp: { sendVerificationOtp: vi.fn(async () => ({ data: {}, error: null })) },
  },
}));

import { authClient } from "@/lib/authClient";
import SaveJournalPage from "./page";

function stubStandalone(matches: boolean) {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches } as MediaQueryList);
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/my-likes/save");
  stubStandalone(false); // browser by default; individual tests opt into PWA mode
  vi.stubGlobal("fetch", mockFetch({ "/telemetry/events": { status: 204, body: null } }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("SaveJournalPage", () => {
  it("sends the magic link with origin-absolute callback URLs and shows the check-email state", async () => {
    render(<SaveJournalPage />);
    await userEvent.type(screen.getByLabelText(/email address/i), "dancer@x.y");
    await userEvent.click(screen.getByRole("button", { name: /send my sign-in link/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByText(/open the link on this device/i)).toBeInTheDocument();

    const call = vi.mocked(authClient.signIn.magicLink).mock.calls[0]?.[0];
    expect(call?.email).toBe("dancer@x.y");
    expect(call?.callbackURL).toMatch(/^https?:\/\/.+\/my-likes\?claimed=1$/);
    expect(call?.newUserCallbackURL).toContain("/my-likes?claimed=1&new=1");
    expect(call?.errorCallbackURL).toContain("/my-likes/save?error=link");
  });

  it("shows the expired-link message when landing with ?error=link", async () => {
    window.history.replaceState(null, "", "/my-likes/save?error=link");
    render(<SaveJournalPage />);
    expect(await screen.findByText(/expired or was already used/i)).toBeInTheDocument();
  });

  it("surfaces a send failure inline", async () => {
    vi.mocked(authClient.signIn.magicLink).mockResolvedValueOnce({
      data: null,
      error: { message: "rate limited" },
    } as never);
    render(<SaveJournalPage />);
    await userEvent.type(screen.getByLabelText(/email address/i), "dancer@x.y");
    await userEvent.click(screen.getByRole("button", { name: /send my sign-in link/i }));
    expect(await screen.findByText(/rate limited/i)).toBeInTheDocument();
  });

  it("installed PWA (standalone) defaults to the CODE flow and signs in with the typed code", async () => {
    stubStandalone(true);
    render(<SaveJournalPage />);

    await userEvent.type(screen.getByLabelText(/email address/i), "dancer@x.y");
    await userEvent.click(await screen.findByRole("button", { name: /email me a sign-in code/i }));

    expect(await screen.findByText(/enter your code/i)).toBeInTheDocument();
    expect(vi.mocked(authClient.emailOtp.sendVerificationOtp)).toHaveBeenCalledWith({
      email: "dancer@x.y",
      type: "sign-in",
    });

    await userEvent.type(screen.getByLabelText(/sign-in code/i), "481227");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(vi.mocked(authClient.signIn.emailOtp)).toHaveBeenCalledWith({
      email: "dancer@x.y",
      otp: "481227",
    });
  });

  it("carries follow intent + ticked consent through EVERY callback URL (Slice C)", async () => {
    // The magic link may open on another device — the query string is the only channel that
    // survives; dropping a param here silently loses the follow/consent.
    window.history.replaceState(null, "", "/my-likes/save?follow=dj-nova&source=interstitial");
    render(<SaveJournalPage />);
    expect(await screen.findByText(/we'll follow the dj for you/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /night recaps/i }));
    await userEvent.type(screen.getByLabelText(/email address/i), "dancer@x.y");
    await userEvent.click(screen.getByRole("button", { name: /send my sign-in link/i }));

    const call = vi.mocked(authClient.signIn.magicLink).mock.calls[0]?.[0];
    for (const url of [call?.callbackURL, call?.newUserCallbackURL, call?.errorCallbackURL]) {
      expect(url).toContain("follow=dj-nova");
      expect(url).toContain("source=interstitial");
      expect(url).toContain("consent=1");
    }
    expect(call?.callbackURL).toContain("claimed=1");
  });

  it("the signed-in early redirect FORWARDS intent params instead of dropping them", async () => {
    const { useRouter } = await import("next/navigation");
    const replace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace,
      back: vi.fn(),
      prefetch: vi.fn(),
    } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(authClient.useSession).mockReturnValue({
      data: { user: { id: "u1" } },
      isPending: false,
    } as unknown as ReturnType<typeof authClient.useSession>);
    window.history.replaceState(null, "", "/my-likes/save?follow=dj-nova&source=live");

    render(<SaveJournalPage />);
    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/my-likes?follow=dj-nova&source=live");
    });
  });

  it("browser mode offers the code toggle; wrong code shows an inline error", async () => {
    vi.mocked(authClient.signIn.emailOtp).mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid OTP" },
    } as never);
    render(<SaveJournalPage />);

    // Toggle from the default link mode into code mode.
    await userEvent.click(
      screen.getByRole("button", { name: /using the installed app\? get a code instead/i }),
    );
    await userEvent.type(screen.getByLabelText(/email address/i), "dancer@x.y");
    await userEvent.click(screen.getByRole("button", { name: /email me a sign-in code/i }));

    await userEvent.type(await screen.findByLabelText(/sign-in code/i), "000000");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText(/invalid otp/i)).toBeInTheDocument();
    // Recovery affordance for expired/exhausted codes.
    expect(screen.getByRole("button", { name: /send a new code/i })).toBeInTheDocument();
  });
});
