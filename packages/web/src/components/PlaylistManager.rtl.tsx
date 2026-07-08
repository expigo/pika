import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render, screen, userEvent, waitFor } from "../test/rtl";

vi.mock("@/lib/djLive", () => ({
  getMyCuratedPlaylists: vi.fn(),
  importPlaylist: vi.fn(),
  updateCuratedPlaylist: vi.fn(async () => ({ success: true })),
  deleteCuratedPlaylist: vi.fn(async () => ({ success: true })),
}));

import {
  deleteCuratedPlaylist,
  getMyCuratedPlaylists,
  importPlaylist,
  updateCuratedPlaylist,
} from "@/lib/djLive";
import { PlaylistManager } from "./PlaylistManager";

/** Minimal valid Exportify CSV (the header sniff needs "Track URI"). */
const EXPORTIFY_CSV = [
  "Track URI,Track Name,Artist Name(s)",
  "spotify:track:4uLU6hMCjMI75M1A2tKUQC,Get Lucky,Daft Punk",
].join("\n");

const LISTS = [
  {
    id: 1,
    name: "Budafest 2026",
    source: "csv",
    showOnBooth: false,
    label: null,
    kind: null,
    spotifyUrl: null,
    trackCount: 320,
    featureCount: 280,
  },
  {
    id: 2,
    name: "Saturday Set",
    source: "profile",
    showOnBooth: true,
    label: "party set",
    kind: "set",
    spotifyUrl: null,
    trackCount: 40,
    featureCount: 12,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch({ "/telemetry/events": { status: 204, body: null } }));
  vi.mocked(getMyCuratedPlaylists).mockResolvedValue({ playlists: LISTS });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PlaylistManager", () => {
  it("lists playlists with PROVENANCE badges and coverage hints", async () => {
    render(<PlaylistManager />);
    expect(await screen.findByText("Budafest 2026")).toBeInTheDocument();
    expect(screen.getByText(/dj's pick/i)).toBeInTheDocument(); // csv
    expect(screen.getByText(/played live/i)).toBeInTheDocument(); // profile
    expect(screen.getByText(/320 tracks · 280 with features/i)).toBeInTheDocument();
  });

  it("promotes a playlist optimistically (the one dial) and beacons it", async () => {
    render(<PlaylistManager />);
    await screen.findByText("Budafest 2026");
    await userEvent.click(screen.getByRole("button", { name: /show on booth/i }));
    expect(await screen.findAllByRole("button", { name: /hide from booth/i })).toHaveLength(2); // both now promoted
    await waitFor(() =>
      expect(updateCuratedPlaylist).toHaveBeenCalledWith(1, { showOnBooth: true }),
    );
    // A promoted row exposes the Booth label field.
    expect(screen.getByLabelText(/label for budafest 2026/i)).toBeInTheDocument();
  });

  it("deletes a playlist (the shared corpus is server-side untouched)", async () => {
    render(<PlaylistManager />);
    await screen.findByText("Budafest 2026");
    await userEvent.click(screen.getByRole("button", { name: /remove playlist budafest 2026/i }));
    await waitFor(() => expect(deleteCuratedPlaylist).toHaveBeenCalledWith(1));
    expect(screen.queryByText("Budafest 2026")).toBeNull();
  });

  it("rejects a file that isn't an Exportify/Chosic CSV", async () => {
    render(<PlaylistManager />);
    await screen.findByText("Budafest 2026");
    const file = new File(["just,some,columns\n1,2,3"], "random.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByLabelText(/playlist csv file/i), file);
    expect(
      await screen.findByText(/doesn't look like an exportify or chosic csv/i),
    ).toBeInTheDocument();
  });

  it("nudges 'Show on Booth now' right after an import and flips the dial from the banner", async () => {
    const fresh = {
      id: 7,
      name: "Fresh Import",
      source: "csv",
      showOnBooth: false,
      label: null,
      kind: null,
      spotifyUrl: null,
      trackCount: 1,
      featureCount: 0,
    };
    vi.mocked(getMyCuratedPlaylists).mockResolvedValue({ playlists: [...LISTS, fresh] });
    vi.mocked(importPlaylist).mockResolvedValue({ playlistId: 7, trackCount: 1, featureCount: 0 });
    render(<PlaylistManager />);
    await screen.findByText("Budafest 2026");

    const file = new File([EXPORTIFY_CSV], "Fresh_Import.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByLabelText(/playlist csv file/i), file);
    await userEvent.click(await screen.findByRole("button", { name: /^import$/i }));

    // The nudge completes the loop at the moment of intent (import ≠ publish).
    const nudge = await screen.findByRole("button", { name: /show on booth now/i });
    await userEvent.click(nudge);
    await waitFor(() =>
      expect(updateCuratedPlaylist).toHaveBeenCalledWith(7, { showOnBooth: true }),
    );
    expect(await screen.findByText(/on your booth ✓/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show on booth now/i })).toBeNull();
  });

  it("shows no nudge button when the import returns no playlist id", async () => {
    vi.mocked(importPlaylist).mockResolvedValue({
      playlistId: null,
      trackCount: 1,
      featureCount: 0,
    });
    render(<PlaylistManager />);
    await screen.findByText("Budafest 2026");

    const file = new File([EXPORTIFY_CSV], "Mystery.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByLabelText(/playlist csv file/i), file);
    await userEvent.click(await screen.findByRole("button", { name: /^import$/i }));

    expect(await screen.findByText(/toggle it onto your booth below/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show on booth now/i })).toBeNull();
  });

  it("re-import of an already-promoted playlist confirms instead of nudging", async () => {
    // id 2 ("Saturday Set") is already showOnBooth in LISTS.
    vi.mocked(importPlaylist).mockResolvedValue({ playlistId: 2, trackCount: 1, featureCount: 0 });
    render(<PlaylistManager />);
    await screen.findByText("Budafest 2026");

    const file = new File([EXPORTIFY_CSV], "Saturday_Set.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByLabelText(/playlist csv file/i), file);
    await userEvent.click(await screen.findByRole("button", { name: /^import$/i }));

    expect(await screen.findByText(/on your booth ✓/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show on booth now/i })).toBeNull();
  });
});
