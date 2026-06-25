// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, stubClipboard, userEvent } from "../test/rtl";
import { QrShareLinks } from "./QrShareLinks";

const STAGE = "https://pika.stream/stage/main-floor-ab12";
const SESSION = "https://pika.stream/live/sess-1";

describe("QrShareLinks", () => {
  let clipboard: ReturnType<typeof stubClipboard>;
  beforeEach(() => {
    clipboard = stubClipboard();
  });

  it("shows both the stage and session rows with their URLs", () => {
    render(<QrShareLinks stageUrl={STAGE} stageName="Main Floor" sessionUrl={SESSION} />);
    expect(screen.getByText(/Stage · Main Floor/)).toBeInTheDocument();
    expect(screen.getByText("This set")).toBeInTheDocument();
    expect(screen.getByText(STAGE)).toBeInTheDocument();
    expect(screen.getByText(SESSION)).toBeInTheDocument();
  });

  it("copies the stage link when its copy button is clicked", async () => {
    render(<QrShareLinks stageUrl={STAGE} stageName="Main Floor" sessionUrl={SESSION} />);
    await userEvent.click(screen.getByRole("button", { name: /copy stage/i }));
    expect(clipboard).toHaveBeenCalledWith(STAGE);
  });

  it("renders only the session row for a stage-less session", () => {
    render(<QrShareLinks sessionUrl={SESSION} />);
    expect(screen.getByText("This set")).toBeInTheDocument();
    expect(screen.queryByText(/Stage ·/)).not.toBeInTheDocument();
  });
});
