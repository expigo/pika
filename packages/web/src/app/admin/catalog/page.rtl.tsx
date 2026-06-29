import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "../../../test/rtl";
import AdminCatalogPage from "./page";

vi.mock("@/lib/admin", () => ({
  getCatalog: vi.fn(),
  getCatalogSongs: vi.fn(),
  getCatalogSong: vi.fn(),
}));

import * as admin from "@/lib/admin";

const catalog = {
  totals: { tracks: 1703, features: 1703, djs: 2, overlap: 212 },
  coverage: { tempo: 1690, genres: 799 },
  perDj: [
    { djName: "DJ Pikachu", count: 1146 },
    { djName: "DJ Two", count: 769 },
  ],
  tempo: [
    { bucket: 90, count: 495 },
    { bucket: 100, count: 361 },
  ],
  keys: [
    { key: 0, count: 183 },
    { key: 9, count: 140 },
  ],
  energy: [{ bucket: 0.5, count: 300 }],
  topOverlap: [
    { name: "BIRDS OF A FEATHER", artists: "Billie Eilish", djCount: 2, popularity: 95 },
  ],
  generatedAt: "2026-06-29T20:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(admin.getCatalog).mockResolvedValue(catalog);
  vi.mocked(admin.getCatalogSongs).mockResolvedValue({ total: 0, limit: 25, offset: 0, songs: [] });
});

describe("AdminCatalogPage", () => {
  it("renders totals, coverage, per-DJ counts and the cross-DJ overlap list", async () => {
    render(<AdminCatalogPage />);

    expect(await screen.findAllByText("1703")).toHaveLength(2); // unique tracks + features cards
    expect(screen.getByText("212")).toBeInTheDocument(); // overlap
    expect(screen.getByText(/99% tempo · 47% genres/)).toBeInTheDocument(); // coverage %
    expect(screen.getByText("DJ Pikachu")).toBeInTheDocument();
    expect(screen.getByText(/Billie Eilish – BIRDS OF A FEATHER/)).toBeInTheDocument();
    expect(screen.getByText("2 DJs")).toBeInTheDocument();

    // Bars must have a concrete pixel height (regression guard: the old code used an unresolved
    // percentage height → empty plots). Tallest tempo bar (495 = max) fills the 144px chart.
    expect(screen.getByTitle("90: 495").style.height).toBe("144px");
    expect(screen.getByTitle("100: 361").style.height).toBe("105px");
  });

  it("shows a friendly error when the load fails", async () => {
    vi.mocked(admin.getCatalog).mockRejectedValue(new Error("boom"));
    render(<AdminCatalogPage />);
    expect(await screen.findByText(/couldn't load catalog/i)).toBeInTheDocument();
  });
});
