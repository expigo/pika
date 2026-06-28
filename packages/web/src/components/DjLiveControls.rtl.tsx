import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveStatus } from "@/lib/djLive";
import { render, screen, userEvent } from "../test/rtl";
import { DjLiveControls } from "./DjLiveControls";

// The REST client is unit-tested via the cloud routes; here we assert the controls call it.
vi.mock("@/lib/djLive", () => ({
  sendAnnouncement: vi.fn(() => Promise.resolve({ success: true })),
  cancelAnnouncement: vi.fn(() => Promise.resolve({ success: true })),
  startPoll: vi.fn(() => Promise.resolve({ success: true, pollId: 1 })),
  endPoll: vi.fn(() => Promise.resolve({ success: true })),
}));

import { cancelAnnouncement, endPoll, sendAnnouncement, startPoll } from "@/lib/djLive";

const baseStatus: LiveStatus = {
  live: true,
  sessionId: "sess-1",
  spotify: { connected: true, status: "active" },
};

// `run` mirrors the page wrapper closely enough for the call-through assertions.
const run = (fn: () => Promise<unknown>) => fn().then(() => undefined);

function setup(status: LiveStatus = baseStatus) {
  render(<DjLiveControls status={status} busy={false} run={run} />);
}

beforeEach(() => {
  vi.mocked(sendAnnouncement).mockClear();
  vi.mocked(cancelAnnouncement).mockClear();
  vi.mocked(startPoll).mockClear();
  vi.mocked(endPoll).mockClear();
});

describe("DjLiveControls — announcement (default tab)", () => {
  it("sends the typed announcement", async () => {
    setup();
    await userEvent.type(screen.getByPlaceholderText(/last song/i), "Last song!");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(sendAnnouncement).toHaveBeenCalledWith("Last song!", undefined, false);
  });

  it("disables Send for an empty message", () => {
    setup();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("clears an active announcement", async () => {
    setup({
      ...baseStatus,
      activeAnnouncement: { message: "On the floor now", timestamp: new Date().toISOString() },
    });
    expect(screen.getByText("On the floor now")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(cancelAnnouncement).toHaveBeenCalled();
  });
});

describe("DjLiveControls — poll builder (Poll tab)", () => {
  it("starts a poll with the question, options, and duration", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Poll" }));
    await userEvent.type(screen.getByLabelText("Poll question"), "Next genre?");
    await userEvent.type(screen.getByLabelText("Option 1"), "Blues");
    await userEvent.type(screen.getByLabelText("Option 2"), "Pop");
    await userEvent.click(screen.getByRole("button", { name: /start poll/i }));
    expect(startPoll).toHaveBeenCalledWith({
      question: "Next genre?",
      options: ["Blues", "Pop"],
      durationSeconds: 120,
    });
  });

  it("fills the builder from a preset", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Poll" }));
    await userEvent.click(screen.getByRole("button", { name: "Tempo Check" }));
    expect(screen.getByLabelText("Poll question")).toHaveValue("Is this speed working for you?");
  });
});

describe("DjLiveControls — active poll", () => {
  const withPoll: LiveStatus = {
    ...baseStatus,
    activePoll: {
      pollId: 7,
      question: "Next genre?",
      options: ["Blues", "Pop"],
      votes: [3, 1],
      totalVotes: 4,
      endsAt: null,
    },
  };

  it("auto-switches to the live poll and ends it", async () => {
    setup(withPoll);
    // Effect jumps to the Poll tab when a poll is live — no manual tab click.
    expect(screen.getByText("Next genre?")).toBeInTheDocument();
    expect(screen.getByText(/4 votes/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start poll/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /end poll/i }));
    expect(endPoll).toHaveBeenCalled();
  });
});

describe("DjLiveControls — tempo strip", () => {
  it("renders the aggregated tempo counts when there are votes", () => {
    setup({ ...baseStatus, tempo: { slower: 2, perfect: 5, faster: 1, total: 8 } });
    expect(screen.getByText("Tempo")).toBeInTheDocument();
    expect(screen.getByText("Perfect")).toBeInTheDocument();
  });

  it("renders no tempo strip when there are no votes", () => {
    setup({ ...baseStatus, tempo: { slower: 0, perfect: 0, faster: 0, total: 0 } });
    expect(screen.queryByText("Tempo")).not.toBeInTheDocument();
  });
});
