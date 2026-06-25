// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_UPDATED_EVENT } from "../services/settingsService";
import { render, screen, userEvent } from "../test/rtl";
import { useDjSettings } from "./useDjSettings";

// Two independent consumers of the hook, mirroring the real app (Settings +
// LiveControl both mount useDjSettings).
function Consumer({ id }: { id: string }) {
  const { djName, setDjName } = useDjSettings();
  return (
    <div>
      <span data-testid={`${id}-name`}>{djName}</span>
      <button type="button" onClick={() => setDjName(`set-by-${id}`)}>
        {id}-set
      </button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  // Bust settingsService's module-level cache between tests.
  window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));
});

describe("useDjSettings cross-instance sync", () => {
  it("propagates a change to sibling instances without a render-phase setState", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <>
          <Consumer id="a" />
          <Consumer id="b" />
        </>,
      );

      await userEvent.click(screen.getByRole("button", { name: "a-set" }));

      // The setter persists + broadcasts, so BOTH instances reflect the new name.
      expect(screen.getByTestId("a-name")).toHaveTextContent("set-by-a");
      expect(screen.getByTestId("b-name")).toHaveTextContent("set-by-a");

      // Regression guard: saveSettings must not run inside a setState updater, or
      // its synchronous event dispatch setStates a sibling component mid-render.
      const offending = errorSpy.mock.calls.find((c) =>
        String(c[0]).includes("while rendering a different component"),
      );
      expect(offending).toBeUndefined();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
