// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as stageApi from "../services/stageApi";
import { render, screen, userEvent } from "../test/rtl";
import { StageSelector } from "./StageSelector";

vi.mock("../services/stageApi", () => ({
  fetchDjEvents: vi.fn(() => Promise.resolve([])),
  fetchEventStages: vi.fn(() => Promise.resolve([])),
  fetchStageById: vi.fn(() => Promise.resolve(null)),
  createEvent: vi.fn(),
  createStage: vi.fn(),
}));

const api = vi.mocked(stageApi);

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchDjEvents.mockResolvedValue([]);
  api.fetchEventStages.mockResolvedValue([]);
  api.fetchStageById.mockResolvedValue(null);
});

async function expand() {
  await userEvent.click(screen.getByRole("button", { name: /broadcast to a stage/i }));
}

describe("StageSelector", () => {
  it("is collapsed by default and expands into mode tabs", async () => {
    render(<StageSelector onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^pick$/i })).not.toBeInTheDocument();
    await expand();
    expect(screen.getByRole("button", { name: /^pick$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join code/i })).toBeInTheDocument();
  });

  it("pick: emits the chosen stage after selecting event then stage", async () => {
    api.fetchDjEvents.mockResolvedValue([{ id: "e1", name: "Event 1" }]);
    api.fetchEventStages.mockResolvedValue([{ id: "s1", name: "Main Floor" }]);
    const onChange = vi.fn();
    render(<StageSelector onChange={onChange} />);
    await expand();
    await userEvent.selectOptions(await screen.findByRole("combobox"), "e1");
    await screen.findByRole("option", { name: "Main Floor" });
    const combos = screen.getAllByRole("combobox");
    await userEvent.selectOptions(combos[1], "s1");
    expect(onChange).toHaveBeenLastCalledWith({ id: "s1", name: "Main Floor" });
  });

  it("create: makes an event + stage and emits the result", async () => {
    api.createEvent.mockResolvedValue({ id: "e9", name: "New Ev" });
    api.createStage.mockResolvedValue({ id: "s9", name: "Floor X" });
    const onChange = vi.fn();
    render(<StageSelector onChange={onChange} />);
    await expand();
    await userEvent.click(screen.getByRole("button", { name: /create/i }));
    await userEvent.type(screen.getByPlaceholderText(/event name/i), "New Ev");
    await userEvent.type(screen.getByPlaceholderText(/stage name/i), "Floor X");
    await userEvent.click(screen.getByRole("button", { name: /create & select/i }));
    expect(api.createEvent).toHaveBeenCalledWith("New Ev");
    expect(api.createStage).toHaveBeenCalledWith("Floor X", "e9");
    expect(onChange).toHaveBeenLastCalledWith({ id: "s9", name: "Floor X" });
    expect(await screen.findByText(/broadcasting to: floor x/i)).toBeInTheDocument();
  });

  it("join: resolves a stage by code", async () => {
    api.fetchStageById.mockResolvedValue({ id: "s5", name: "Joined Stage" });
    const onChange = vi.fn();
    render(<StageSelector onChange={onChange} />);
    await expand();
    await userEvent.click(screen.getByRole("button", { name: /join code/i }));
    await userEvent.type(screen.getByPlaceholderText(/stage code/i), "main-floor-abc");
    await userEvent.click(screen.getByRole("button", { name: /join stage/i }));
    expect(api.fetchStageById).toHaveBeenCalledWith("main-floor-abc");
    expect(onChange).toHaveBeenLastCalledWith({ id: "s5", name: "Joined Stage" });
  });

  it("join: shows an error for an unknown code", async () => {
    api.fetchStageById.mockResolvedValue(null);
    render(<StageSelector onChange={vi.fn()} />);
    await expand();
    await userEvent.click(screen.getByRole("button", { name: /join code/i }));
    await userEvent.type(screen.getByPlaceholderText(/stage code/i), "nope");
    await userEvent.click(screen.getByRole("button", { name: /join stage/i }));
    expect(await screen.findByText(/no stage found for that code/i)).toBeInTheDocument();
  });
});
