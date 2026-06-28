import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveListener } from "@/hooks/useLiveListener";
import { mockLiveListener, render, screen, stubClipboard, userEvent } from "../test/rtl";
import { LivePlayer } from "./LivePlayer";

// The data hook is unit-tested elsewhere; here we drive LivePlayer off a stub.
vi.mock("@/hooks/useLiveListener", () => ({ useLiveListener: vi.fn() }));
// usePushNotifications (barrel) — LivePlayer only reads permissionState/isSupported.
vi.mock("@/hooks/live", () => ({
  usePushNotifications: () => ({
    permissionState: "default",
    isSubscribing: false,
    subscribe: vi.fn(),
    isSupported: true,
  }),
}));
// Canvas overlay — irrelevant to assertions and unfriendly to happy-dom.
vi.mock("./SocialSignalsLayer", () => ({ SocialSignalsLayer: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const asMock = vi.mocked(useLiveListener);

function setup(overrides: Record<string, unknown> = {}) {
  asMock.mockReturnValue(
    mockLiveListener(overrides) as unknown as ReturnType<typeof useLiveListener>,
  );
}

const TRACK = { artist: "Daft Punk", title: "Get Lucky", bpm: 116 };

beforeEach(() => {
  asMock.mockReset();
});

describe("LivePlayer — render states", () => {
  it("shows the tuning/scanning state when connected with no DJ or track", () => {
    setup({ status: "connected", currentTrack: null, djName: null });
    render(<LivePlayer />);
    expect(screen.getByText("TUNING FREQUENCIES")).toBeInTheDocument();
    expect(screen.getByText(/scanning for broadcast/i)).toBeInTheDocument();
  });

  it("renders the now-playing track with artist + BPM when live", () => {
    setup({ status: "connected", currentTrack: TRACK, djName: "DJ Nova" });
    render(<LivePlayer />);
    expect(screen.getByText("Get Lucky")).toBeInTheDocument();
    expect(screen.getByText("Daft Punk")).toBeInTheDocument();
    expect(screen.getByText(/116 BPM/i)).toBeInTheDocument();
  });

  it("hides the last track and shows 'Between songs' when paused (Track D privacy)", () => {
    setup({ status: "connected", currentTrack: TRACK, djName: "DJ Nova", isPaused: true });
    render(<LivePlayer />);
    expect(screen.getByText(/between songs/i)).toBeInTheDocument();
    expect(screen.queryByText("Get Lucky")).not.toBeInTheDocument();
  });

  it("shows the session-ended state with a recap link for a targeted session", () => {
    setup({ status: "connected", currentTrack: null, djName: null, sessionEnded: true });
    render(<LivePlayer targetSessionId="sess-42" />);
    expect(screen.getByText(/session ended/i)).toBeInTheDocument();
    const recap = screen.getByRole("link", { name: /view full recap/i });
    expect(recap).toHaveAttribute("href", "/recap/sess-42");
  });
});

describe("LivePlayer — Spotify metadata (B1)", () => {
  const SPOTIFY_TRACK = {
    ...TRACK,
    albumArtUrl: "https://i.scdn.co/image/getlucky",
    spotifyUrl: "https://open.spotify.com/track/getlucky",
  };

  it("renders the album cover and a 'Listen on Spotify' link when present", () => {
    setup({ status: "connected", currentTrack: SPOTIFY_TRACK, djName: "DJ Nova" });
    render(<LivePlayer />);
    expect(screen.getByAltText("Get Lucky cover")).toHaveAttribute(
      "src",
      "https://i.scdn.co/image/getlucky",
    );
    const link = screen.getByRole("link", { name: /listen to get lucky on spotify/i });
    expect(link).toHaveAttribute("href", "https://open.spotify.com/track/getlucky");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("falls back to the placeholder and shows no Spotify link for a non-Spotify (VDJ) track", () => {
    setup({ status: "connected", currentTrack: TRACK, djName: "DJ Nova" });
    render(<LivePlayer />);
    expect(screen.queryByAltText(/cover/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /on spotify/i })).not.toBeInTheDocument();
  });
});

describe("LivePlayer — like interaction", () => {
  it("calls sendLike when liking the current track", async () => {
    const sendLike = vi.fn(() => true);
    setup({ status: "connected", currentTrack: TRACK, hasLiked: () => false, sendLike });
    render(<LivePlayer />);
    await userEvent.click(screen.getByRole("button", { name: /like this track/i }));
    expect(sendLike).toHaveBeenCalledWith(TRACK);
  });

  it("calls removeLike when un-liking an already-liked track", async () => {
    const removeLike = vi.fn();
    setup({ status: "connected", currentTrack: TRACK, hasLiked: () => true, removeLike });
    render(<LivePlayer />);
    await userEvent.click(screen.getByRole("button", { name: /unlike this track/i }));
    expect(removeLike).toHaveBeenCalledWith(TRACK);
  });
});

describe("LivePlayer — tempo voting", () => {
  it("sends the chosen tempo preference", async () => {
    const sendTempoRequest = vi.fn();
    setup({ status: "connected", currentTrack: TRACK, sendTempoRequest });
    render(<LivePlayer />);
    await userEvent.click(screen.getByRole("button", { name: /vote for tempo: faster/i }));
    expect(sendTempoRequest).toHaveBeenCalledWith("faster");
  });

  it("marks the active tempo vote as pressed", () => {
    setup({ status: "connected", currentTrack: TRACK, tempoVote: "perfect" });
    render(<LivePlayer />);
    expect(screen.getByRole("button", { name: /vote for tempo: perfect/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("LivePlayer — polls", () => {
  const poll = {
    question: "Next genre?",
    options: ["Blues", "Contemporary"],
    votes: [3, 1],
    totalVotes: 4,
    userChoice: null,
    endsAt: null,
  };

  it("submits a vote when an option is tapped", async () => {
    const voteOnPoll = vi.fn();
    setup({
      status: "connected",
      currentTrack: TRACK,
      activePoll: poll,
      hasVotedOnPoll: false,
      voteOnPoll,
    });
    render(<LivePlayer />);
    await userEvent.click(screen.getByRole("button", { name: "Blues" }));
    expect(voteOnPoll).toHaveBeenCalledWith(0);
  });

  it("shows results with the user's choice highlighted after voting", () => {
    setup({
      status: "connected",
      currentTrack: TRACK,
      activePoll: { ...poll, userChoice: 0 },
      hasVotedOnPoll: true,
    });
    render(<LivePlayer />);
    expect(screen.getByText("YOUR VOTE")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument(); // 3 of 4 votes
  });
});

describe("LivePlayer — announcement", () => {
  it("renders the announcement and dismisses it", async () => {
    const dismissAnnouncement = vi.fn();
    setup({
      status: "connected",
      currentTrack: TRACK,
      announcement: {
        message: "Last song in 10!",
        djName: "DJ Nova",
        timestamp: new Date().toISOString(),
      },
      dismissAnnouncement,
    });
    render(<LivePlayer />);
    expect(screen.getByText("Last song in 10!")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(dismissAnnouncement).toHaveBeenCalled();
  });
});

describe("LivePlayer — share + stage", () => {
  it("opens the QR modal and copies the invite link", async () => {
    const writeText = stubClipboard();
    setup({ status: "connected", currentTrack: TRACK, djName: "DJ Nova" });
    render(<LivePlayer />);
    await userEvent.click(screen.getByRole("button", { name: /share session/i }));
    expect(screen.getByText(/share the vibe/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /copy invitation link/i }));
    expect(writeText).toHaveBeenCalled();
  });

  it("shows the stage badge once the stage resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ name: "Ballroom", eventName: "Open Champs" }), {
            status: 200,
          }),
        ),
      ),
    );
    setup({ status: "connected", currentTrack: TRACK, djName: "DJ Nova" });
    render(<LivePlayer targetStageId="stage-1" />);
    expect(await screen.findByText(/Ballroom · Open Champs/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
