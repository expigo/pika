import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePushNotifications } from "@/hooks/live";
import { render, screen, userEvent } from "../../test/rtl";
import { NotificationToggle } from "./NotificationToggle";

vi.mock("@/hooks/live", () => ({ usePushNotifications: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const push = vi.mocked(usePushNotifications);

function state(overrides: Partial<ReturnType<typeof usePushNotifications>> = {}) {
  push.mockReturnValue({
    permissionState: "default",
    isSubscribing: false,
    subscribe: vi.fn(() => Promise.resolve(true)),
    isSupported: true,
    ...overrides,
  } as ReturnType<typeof usePushNotifications>);
}

beforeEach(() => push.mockReset());

describe("NotificationToggle", () => {
  it("confirms when notifications are already granted", () => {
    state({ permissionState: "granted" });
    render(<NotificationToggle />);
    expect(screen.getByText(/notifications enabled/i)).toBeInTheDocument();
  });

  it("renders nothing when push is unsupported", () => {
    state({ isSupported: false });
    const { container } = render(<NotificationToggle />);
    expect(container).toBeEmptyDOMElement();
  });

  it("subscribes when the enable button is pressed", async () => {
    const subscribe = vi.fn(() => Promise.resolve(true));
    state({ permissionState: "default", subscribe });
    render(<NotificationToggle />);
    await userEvent.click(screen.getByRole("button", { name: /enable notifications/i }));
    expect(subscribe).toHaveBeenCalled();
  });

  it("shows a blocked state when permission is denied", () => {
    state({ permissionState: "denied" });
    render(<NotificationToggle />);
    expect(screen.getByRole("button", { name: /notifications blocked/i })).toBeDisabled();
    expect(screen.getByText(/you have blocked notifications/i)).toBeInTheDocument();
  });
});
