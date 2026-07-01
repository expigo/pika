// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "../test/rtl";
import { OfflineQueueIndicator } from "./OfflineQueueIndicator";

const useLiveStore = vi.fn();
const count = vi.fn();
vi.mock("../hooks/useLiveSession", () => ({
  useLiveStore: (selector: (s: { status: string }) => unknown) => useLiveStore(selector),
}));
vi.mock("../db/repositories/offlineQueueRepository", () => ({
  offlineQueueRepository: { count: () => count() },
}));

/** Drive the store selector with a fixed status. */
function withStatus(status: string) {
  useLiveStore.mockImplementation((selector: (s: { status: string }) => unknown) =>
    selector({ status }),
  );
}

beforeEach(() => {
  useLiveStore.mockReset();
  count.mockReset();
  count.mockResolvedValue(0);
});

describe("OfflineQueueIndicator", () => {
  it("renders nothing when offline", () => {
    withStatus("offline");
    const { container } = render(<OfflineQueueIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when live and fully synced", () => {
    withStatus("live");
    const { container } = render(<OfflineQueueIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the syncing badge with the pending count", async () => {
    withStatus("connecting");
    count.mockResolvedValue(3);
    render(<OfflineQueueIndicator />);
    expect(await screen.findByTitle(/3 updates pending sync/i)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows the reconnecting indicator when connecting with an empty queue", async () => {
    withStatus("connecting");
    render(<OfflineQueueIndicator />);
    expect(await screen.findByTitle(/reconnecting/i)).toBeInTheDocument();
  });

  it("shows the synced-cloud indicator when connected with an empty queue", async () => {
    withStatus("connected");
    render(<OfflineQueueIndicator />);
    expect(await screen.findByTitle("Connected")).toBeInTheDocument();
  });
});
