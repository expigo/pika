import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { render, screen } from "../../test/rtl";
import { OfflineStatus } from "./OfflineStatus";

vi.mock("../../hooks/useOnlineStatus", () => ({ useOnlineStatus: vi.fn() }));
const online = vi.mocked(useOnlineStatus);

beforeEach(() => online.mockReset());

describe("OfflineStatus", () => {
  it("renders nothing when online, idle and nothing pending", () => {
    online.mockReturnValue(true);
    const { container } = render(<OfflineStatus pendingCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the offline queue count when offline", () => {
    online.mockReturnValue(false);
    render(<OfflineStatus pendingCount={3} />);
    expect(screen.getByText(/offline • 3 queued/i)).toBeInTheDocument();
  });

  it("shows a saving indicator while persisting", () => {
    online.mockReturnValue(true);
    render(<OfflineStatus pendingCount={0} isSaving />);
    expect(screen.getByText(/saving/i)).toBeInTheDocument();
  });

  it("shows syncing when back online with pending likes", () => {
    online.mockReturnValue(true);
    render(<OfflineStatus pendingCount={2} />);
    expect(screen.getByText(/syncing likes/i)).toBeInTheDocument();
  });
});
