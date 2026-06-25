// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "../test/rtl";
import { LiveInteractions } from "./LiveInteractions";

vi.mock("qrcode.react", () => ({ QRCodeSVG: () => null }));

// Every prop is required; build inert defaults and override per test.
function defaults() {
  return {
    activePoll: null,
    endedPoll: null,
    activeAnnouncement: null,
    showNoteModal: false,
    showPollModal: false,
    showAnnouncementModal: false,
    showQrModal: false,
    onCloseNoteModal: vi.fn(),
    onClosePollModal: vi.fn(),
    onCloseAnnouncementModal: vi.fn(),
    onCloseQrModal: vi.fn(),
    noteText: "",
    setNoteText: vi.fn(),
    onSaveNote: vi.fn(),
    pollQuestion: "",
    setPollQuestion: vi.fn(),
    pollOptions: ["", ""],
    setPollOptions: vi.fn(),
    onStartPoll: vi.fn(),
    onEndPoll: vi.fn(),
    announcementText: "",
    setAnnouncementText: vi.fn(),
    onSendAnnouncement: vi.fn(),
    onCancelAnnouncement: vi.fn(),
    onClearEndedPoll: vi.fn(),
    currentPlay: null,
    qrUrl: "http://test/live/s",
    domainText: "pika.stream",
  };
}

describe("LiveInteractions", () => {
  it("starts a poll with the entered question and options", async () => {
    const onStartPoll = vi.fn();
    render(
      <LiveInteractions
        {...defaults()}
        showPollModal
        pollQuestion="Best genre?"
        pollOptions={["Blues", "WCS"]}
        onStartPoll={onStartPoll}
      />,
    );
    expect(screen.getByText(/create poll/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /start poll/i }));
    expect(onStartPoll).toHaveBeenCalledWith("Best genre?", ["Blues", "WCS"], undefined);
  });

  it("disables Start Poll until a question and two options exist", () => {
    render(
      <LiveInteractions {...defaults()} showPollModal pollQuestion="" pollOptions={["", ""]} />,
    );
    expect(screen.getByRole("button", { name: /start poll/i })).toBeDisabled();
  });

  it("broadcasts an announcement, including the push flag", async () => {
    const onSendAnnouncement = vi.fn();
    render(
      <LiveInteractions
        {...defaults()}
        showAnnouncementModal
        announcementText="Workshop in 5"
        onSendAnnouncement={onSendAnnouncement}
      />,
    );
    await userEvent.click(screen.getByRole("checkbox")); // enable push
    await userEvent.click(screen.getByRole("button", { name: /broadcast/i }));
    expect(onSendAnnouncement).toHaveBeenCalledWith("Workshop in 5", undefined, true);
  });

  it("shows the QR modal with copyable share links and domain", () => {
    render(
      <LiveInteractions
        {...defaults()}
        showQrModal
        stageUrl="http://test/stage/s"
        stageName="Main Floor"
        sessionUrl="http://test/live/s"
      />,
    );
    expect(screen.getByText(/join the dance/i)).toBeInTheDocument();
    expect(screen.getByText("pika.stream")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy stage/i })).toBeInTheDocument();
  });

  it("dismisses an active announcement overlay", async () => {
    const onCancelAnnouncement = vi.fn();
    render(
      <LiveInteractions
        {...defaults()}
        activeAnnouncement={{ message: "Hi all" }}
        onCancelAnnouncement={onCancelAnnouncement}
      />,
    );
    expect(screen.getByText("Hi all")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /dismiss announcement/i }));
    expect(onCancelAnnouncement).toHaveBeenCalled();
  });
});
