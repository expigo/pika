import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./apiClient", () => ({ apiFetch: vi.fn() }));
vi.mock("../hooks/useDjSettings", () => ({
  getConfiguredUrls: () => ({ apiUrl: "https://api.pika.stream" }),
}));

import { apiFetch } from "./apiClient";
import { fetchDjEvents, fetchEventStages } from "./stageApi";

const mockApiFetch = vi.mocked(apiFetch);
const jsonRes = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response;

beforeEach(() => mockApiFetch.mockReset());

describe("fetchDjEvents", () => {
  it("returns the events array on success and hits the right URL", async () => {
    mockApiFetch.mockResolvedValue(jsonRes({ events: [{ id: "e1", name: "WCS" }] }));
    const events = await fetchDjEvents();
    expect(events).toEqual([{ id: "e1", name: "WCS" }]);
    expect(mockApiFetch).toHaveBeenCalledWith("https://api.pika.stream/api/events");
  });

  it("returns [] on a non-ok response (e.g. 401 unauthenticated)", async () => {
    mockApiFetch.mockResolvedValue(jsonRes({}, false));
    expect(await fetchDjEvents()).toEqual([]);
  });

  it("returns [] when the response can't be parsed (malformed/failure)", async () => {
    // ok:true but no json() → throws inside the try → exercises the catch → [].
    mockApiFetch.mockResolvedValue({ ok: true } as unknown as Response);
    expect(await fetchDjEvents()).toEqual([]);
  });

  it("tolerates a missing events field", async () => {
    mockApiFetch.mockResolvedValue(jsonRes({}));
    expect(await fetchDjEvents()).toEqual([]);
  });
});

describe("fetchEventStages", () => {
  it("returns the stages array and hits the scoped URL", async () => {
    mockApiFetch.mockResolvedValue(jsonRes({ stages: [{ id: "s1", name: "Main" }] }));
    const stages = await fetchEventStages("e1");
    expect(stages).toEqual([{ id: "s1", name: "Main" }]);
    expect(mockApiFetch).toHaveBeenCalledWith("https://api.pika.stream/api/events/e1/stages");
  });

  it("returns [] on a non-ok response", async () => {
    mockApiFetch.mockResolvedValue(jsonRes({}, false));
    expect(await fetchEventStages("e1")).toEqual([]);
  });
});
