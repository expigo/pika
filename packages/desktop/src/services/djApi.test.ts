import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./apiClient", () => ({ apiFetch: vi.fn() }));
vi.mock("./settingsService", () => ({
  getConfiguredUrls: () => ({ apiUrl: "https://api.pika.stream" }),
}));

import { apiFetch } from "./apiClient";
import { syncSessionPlaylist, unsyncSessionPlaylist } from "./djApi";
import { PlaylistApiError } from "./spotifyPlaylist";

const mockApiFetch = vi.mocked(apiFetch);
const okRes = () => ({ ok: true, json: async () => ({ success: true }) }) as unknown as Response;
const errRes = (status: number, error = "nope") =>
  ({ ok: false, status, json: async () => ({ error }) }) as unknown as Response;

beforeEach(() => mockApiFetch.mockReset());

describe("syncSessionPlaylist", () => {
  it("POSTs the playlist to the scoped session URL", async () => {
    mockApiFetch.mockResolvedValue(okRes());
    await syncSessionPlaylist("pika_1", { spotifyPlaylistId: "abc", spotifyPlaylistUrl: "u" });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "https://api.pika.stream/api/dj/me/sessions/pika_1/playlist",
      {
        method: "POST",
        body: JSON.stringify({ spotifyPlaylistId: "abc", spotifyPlaylistUrl: "u" }),
      },
    );
  });

  it("throws a PlaylistApiError carrying the status on a non-2xx (404 = not a cloud session)", async () => {
    mockApiFetch.mockResolvedValue(errRes(404, "Session not found"));
    await expect(syncSessionPlaylist("pika_x", { spotifyPlaylistId: "abc" })).rejects.toBeInstanceOf(
      PlaylistApiError,
    );
    await expect(
      syncSessionPlaylist("pika_x", { spotifyPlaylistId: "abc" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("unsyncSessionPlaylist", () => {
  it("DELETEs the scoped session URL with no body", async () => {
    mockApiFetch.mockResolvedValue(okRes());
    await unsyncSessionPlaylist("pika_1");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "https://api.pika.stream/api/dj/me/sessions/pika_1/playlist",
      { method: "DELETE" },
    );
  });
});
