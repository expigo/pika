// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDjSettings } from "../hooks/useDjSettings";
import { useLiveSession } from "../hooks/useLiveSession";
import { useVdjHistory } from "../hooks/useVdjHistory";
import { liveSessionStub, render, screen, userEvent } from "../test/rtl";
import { LiveControl } from "./LiveControl";

vi.mock("../hooks/useLiveSession", () => ({ useLiveSession: vi.fn() }));
vi.mock("../hooks/useDjSettings", () => ({ useDjSettings: vi.fn() }));
vi.mock("../hooks/useVdjHistory", () => ({ useVdjHistory: vi.fn() }));
vi.mock("../config", () => ({
  getLocalIp: vi.fn(() => Promise.resolve(null)),
  getListenerUrl: vi.fn(() => "http://test/live/sess-1"),
  getStageListenerUrl: vi.fn(() => "http://test/stage/stage-1"),
  getRecapUrl: vi.fn(() => "http://test/recap/sess-1"),
}));
vi.mock("../hooks/live/connectionManager", () => ({
  detectInitialTrack: vi.fn(() => Promise.resolve(null)),
  createDatabaseSession: vi.fn(() => Promise.resolve(1)),
}));
vi.mock("../hooks/live/trackBroadcast", () => ({ generateSessionId: vi.fn(() => "new-id") }));
vi.mock("qrcode.react", () => ({ QRCodeSVG: () => null }));
vi.mock("../services/stageApi", () => ({
  fetchDjEvents: vi.fn(() => Promise.resolve([])),
  fetchEventStages: vi.fn(() => Promise.resolve([])),
  fetchStageById: vi.fn(() => Promise.resolve(null)),
  createEvent: vi.fn(),
  createStage: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const liveMock = vi.mocked(useLiveSession);
const djMock = vi.mocked(useDjSettings);
const vdjMock = vi.mocked(useVdjHistory);

function setup(live: Record<string, unknown> = {}, dj: Record<string, unknown> = {}) {
  liveMock.mockReturnValue(liveSessionStub(live) as ReturnType<typeof useLiveSession>);
  djMock.mockReturnValue({
    djName: "DJ Test",
    setDjName: vi.fn(),
    hasSetDjName: true,
    isAuthenticated: true,
    ...dj,
  } as unknown as ReturnType<typeof useDjSettings>);
  vdjMock.mockReturnValue({
    detectSession: vi.fn(() => Promise.resolve(null)),
    importTracks: vi.fn(() => Promise.resolve(0)),
  } as unknown as ReturnType<typeof useVdjHistory>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LiveControl", () => {
  it("opens the Start Session modal from GO LIVE when a DJ name is set", async () => {
    setup({ isSessionActive: false, status: "offline" });
    render(<LiveControl />);
    await userEvent.click(screen.getByRole("button", { name: /go live/i }));
    expect(await screen.findByText(/start new session/i)).toBeInTheDocument();
  });

  it("prompts for a DJ name before going live when none is set", async () => {
    const setDjName = vi.fn();
    setup(
      { isSessionActive: false },
      { hasSetDjName: false, isAuthenticated: false, djName: "", setDjName },
    );
    render(<LiveControl />);
    await userEvent.click(screen.getByRole("button", { name: /go live/i }));
    expect(screen.getByText(/what's your dj name/i)).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(/dj smooth/i), "DJ New");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(setDjName).toHaveBeenCalledWith("DJ New");
  });

  it("shows LIVE state with listener count and a stage-aware QR modal", async () => {
    setup({
      isSessionActive: true,
      isCloudConnected: true,
      sessionId: "sess-1",
      currentStageId: "stage-1",
      currentStageName: "Main Floor",
      listenerCount: 7,
    });
    render(<LiveControl />);
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Main Floor")).toBeInTheDocument(); // stage badge
    await userEvent.click(screen.getByRole("button", { name: /show qr code/i }));
    expect(screen.getByText(/scan to listener/i)).toBeInTheDocument();
    expect(screen.getByText(/broadcasting to: main floor/i)).toBeInTheDocument();
  });

  it("shows SYNCING + OFFLINE when the cloud is disconnected mid-session", () => {
    setup({ isSessionActive: true, isCloudConnected: false, sessionId: "sess-1" });
    render(<LiveControl />);
    expect(screen.getByText("SYNCING")).toBeInTheDocument();
    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
  });
});
