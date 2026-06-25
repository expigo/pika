// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { DetectedSession } from "../hooks/useVdjHistory";
import { render, screen, userEvent } from "../test/rtl";
import { StartSessionModal } from "./StartSessionModal";

// StageSelector (rendered inside) hits the stage API on expand; keep it inert.
vi.mock("../services/stageApi", () => ({
  fetchDjEvents: vi.fn(() => Promise.resolve([])),
  fetchEventStages: vi.fn(() => Promise.resolve([])),
  fetchStageById: vi.fn(() => Promise.resolve(null)),
  createEvent: vi.fn(),
  createStage: vi.fn(),
}));

const TRACK = { artist: "Daft Punk", title: "Get Lucky" };

function renderModal(props: Partial<Parameters<typeof StartSessionModal>[0]> = {}) {
  const onStart = vi.fn();
  const onCancel = vi.fn();
  render(
    <StartSessionModal
      currentTrack={TRACK}
      detectedSession={null}
      overlap={null}
      defaultName="Default Set"
      onStart={onStart}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onStart, onCancel };
}

describe("StartSessionModal", () => {
  it("emits the default name and includes the current track on Go Live", async () => {
    const { onStart } = renderModal();
    expect(screen.getByDisplayValue("Default Set")).toBeInTheDocument();
    expect(screen.getByText("Start with this track")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /go live/i }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Default Set",
        includeCurrentTrack: true,
        importEarlier: null,
        stageId: undefined,
        stageName: undefined,
      }),
    );
  });

  it("excludes the current track when its toggle is turned off", async () => {
    const { onStart } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: /start with this track/i }));
    await userEvent.click(screen.getByRole("button", { name: /go live/i }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ includeCurrentTrack: false }));
  });

  it("never includes a current track when none is playing", async () => {
    const { onStart } = renderModal({ currentTrack: null });
    expect(screen.queryByText("Start with this track")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /go live/i }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ includeCurrentTrack: false }));
  });

  it("emits an edited set title", async () => {
    const { onStart } = renderModal();
    const input = screen.getByDisplayValue("Default Set");
    await userEvent.clear(input);
    await userEvent.type(input, "Friday Social");
    await userEvent.click(screen.getByRole("button", { name: /go live/i }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ name: "Friday Social" }));
  });

  it("backfills an earlier set when opted in", async () => {
    const detectedSession: DetectedSession = {
      tracks: [
        { artist: "A1", title: "T1", file_path: "/1.mp3", timestamp: 1000 },
        { artist: "A2", title: "T2", file_path: "/2.mp3", timestamp: 2000 },
      ],
      startTime: new Date(Date.now() - 3_600_000),
      endTime: new Date(Date.now() - 1_800_000),
      autoDetected: true,
      sessionGap: 1_800_000,
    };
    const { onStart } = renderModal({ currentTrack: null, detectedSession });
    await userEvent.click(screen.getByRole("button", { name: /add my earlier set/i }));
    await userEvent.click(screen.getByRole("button", { name: /go live/i }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        importEarlier: { tracks: detectedSession.tracks, startIndex: 0 },
      }),
    );
  });

  it("cancels", async () => {
    const { onCancel } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
