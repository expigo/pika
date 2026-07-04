import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render, screen, userEvent } from "../../../test/rtl";

vi.mock("@/lib/authClient", () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: null, isPending: false })),
    signIn: { magicLink: vi.fn(async () => ({ data: {}, error: null })) },
  },
}));

import { authClient } from "@/lib/authClient";
import SaveJournalPage from "./page";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/my-likes/save");
  vi.stubGlobal("fetch", mockFetch({ "/telemetry/events": { status: 204, body: null } }));
});
afterEach(() => {
  vi.unstubAllGlobals();
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
});
