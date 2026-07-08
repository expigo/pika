import { describe, expect, it } from "vitest";
import type { DjSignatureData } from "@/lib/djLive";
import { render, screen } from "../test/rtl";
import { SignatureCard } from "./SignatureCard";

const SIG: DjSignatureData = {
  contexts: { live: 3, imported: 2, liveTracks: 9, importedTracks: 32 },
  distinctTracks: 50,
  featuredTracks: 41,
  coverage: 0.82,
  tempo: { min: 78, p25: 90, median: 100, p75: 110, max: 120 },
  energy: { p25: 0.4, median: 0.55, p75: 0.7 },
  danceability: { p25: 0.5, median: 0.6, p75: 0.72 },
  valence: { p25: 0.3, median: 0.45, p75: 0.6 },
  acousticness: { p25: 0.1, median: 0.2, p75: 0.35 },
  eras: [
    { decade: "2010s", share: 0.6 },
    { decade: "1990s", share: 0.25 },
  ],
};

/** A ≤60s stale pre-D.1 cached payload: no per-source counts, no acousticness. */
const STALE_SIG: DjSignatureData = {
  ...SIG,
  contexts: { live: 3, imported: 2 },
  acousticness: undefined,
};

describe("SignatureCard", () => {
  it("renders RANGES (never single numbers), era chips and the radar band ring", () => {
    render(<SignatureCard signature={SIG} />);
    expect(screen.getByText(/90–110 BPM core/i)).toBeInTheDocument();
    expect(screen.getByText(/78–120 full range/i)).toBeInTheDocument();
    expect(screen.getByText(/2010s · 60%/i)).toBeInTheDocument();
    expect(screen.getByText(/40–70%/)).toBeInTheDocument(); // energy band
    expect(screen.getByText(/10–35%/)).toBeInTheDocument(); // acoustic band row
    expect(screen.getByTestId("signature-radar")).toBeInTheDocument();
  });

  it("always shows the LOAD-BEARING denominator with per-context track counts", () => {
    render(<SignatureCard signature={SIG} />);
    expect(
      screen.getByText(
        /based on 3 live sets \(9 tracks\) · 2 imported playlists \(32 tracks\) · 82% feature coverage/i,
      ),
    ).toBeInTheDocument();
  });

  it("falls back to the pre-D.1 denominator and hides the radar on a stale cached payload", () => {
    render(<SignatureCard signature={STALE_SIG} />);
    expect(
      screen.getByText(
        /based on 3 live sets · 2 imported playlists · 41 tracks · 82% feature coverage/i,
      ),
    ).toBeInTheDocument();
    // No acousticness → no 4th axis → no radar (never a fake zero axis).
    expect(screen.queryByTestId("signature-radar")).toBeNull();
  });

  it("labels the manager preview variant", () => {
    render(<SignatureCard signature={SIG} preview />);
    expect(screen.getByText(/signature \(preview\)\./i)).toBeInTheDocument();
  });
});
