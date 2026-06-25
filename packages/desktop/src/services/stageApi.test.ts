import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./apiClient", () => ({ apiFetch: vi.fn() }));
vi.mock("../hooks/useDjSettings", () => ({
  getConfiguredUrls: () => ({ apiUrl: "https://api.pika.stream" }),
}));

import { apiFetch } from "./apiClient";
import {
  createEvent,
  createStage,
  fetchDjEvents,
  fetchEventStages,
  fetchStageById,
} from "./stageApi";

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

describe("createEvent", () => {
  it("POSTs the name and returns {id,name} on 201", async () => {
    mockApiFetch.mockResolvedValue(jsonRes({ id: "ev-1", name: "WCS", ownerUserId: 7 }));
    const ev = await createEvent("WCS");
    expect(ev).toEqual({ id: "ev-1", name: "WCS" });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "https://api.pika.stream/api/events",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "WCS" }) }),
    );
  });

  it("returns null on a non-ok response", async () => {
    mockApiFetch.mockResolvedValue(jsonRes({ error: "x" }, false));
    expect(await createEvent("WCS")).toBeNull();
  });

  it("returns null on a malformed body", async () => {
    mockApiFetch.mockResolvedValue({ ok: true } as unknown as Response);
    expect(await createEvent("WCS")).toBeNull();
  });
});

describe("createStage", () => {
  it("POSTs name+eventId and returns {id,name} on 201", async () => {
    mockApiFetch.mockResolvedValue(jsonRes({ id: "st-1", name: "Main", eventId: "ev-1" }));
    const st = await createStage("Main", "ev-1");
    expect(st).toEqual({ id: "st-1", name: "Main" });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "https://api.pika.stream/api/stages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Main", eventId: "ev-1" }),
      }),
    );
  });

  it("returns null on failure", async () => {
    mockApiFetch.mockResolvedValue(jsonRes({}, false));
    expect(await createStage("Main", "ev-1")).toBeNull();
  });
});

describe("fetchStageById (join code)", () => {
  it("resolves an existing stage to {id,name}", async () => {
    mockApiFetch.mockResolvedValue(jsonRes({ id: "main-floor-ab12", name: "Main Floor" }));
    const st = await fetchStageById("main-floor-ab12");
    expect(st).toEqual({ id: "main-floor-ab12", name: "Main Floor" });
    expect(mockApiFetch).toHaveBeenCalledWith("https://api.pika.stream/api/stages/main-floor-ab12");
  });

  it("returns null for an unknown code (404)", async () => {
    mockApiFetch.mockResolvedValue(jsonRes({ error: "Stage not found" }, false));
    expect(await fetchStageById("nope")).toBeNull();
  });
});
