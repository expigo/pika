import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessionRepository } from "../../db/repositories/sessionRepository";
import { clearTrackTimestamps } from "./playDedup";
import { recordPlay } from "./recordPlay";
import * as stateHelpers from "./stateHelpers";
import { findOrCreateTrack } from "./trackPersistence";

// Real `./playDedup` is used (its absolute-interval state IS under test); everything else mocked.
vi.mock("../../db/repositories/sessionRepository", () => ({
  sessionRepository: { addPlay: vi.fn() },
}));
vi.mock("./trackPersistence", () => ({ findOrCreateTrack: vi.fn() }));
vi.mock("./stateHelpers", () => ({
  getDbSessionId: vi.fn(),
  hasProcessedTrackKey: vi.fn(() => false),
  addProcessedTrackKey: vi.fn(),
}));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockAddPlay = vi.mocked(sessionRepository.addPlay);
const mockFind = vi.mocked(findOrCreateTrack);
const mockGetSession = vi.mocked(stateHelpers.getDbSessionId);
const mockHasKey = vi.mocked(stateHelpers.hasProcessedTrackKey);

const dbTrack = {
  id: 5,
  bpm: 120,
  key: null,
  energy: null,
  danceability: null,
  brightness: null,
  acousticness: null,
  groove: null,
  spotifyUrl: null,
  spotifyAlbumArtUrl: null,
  spotifyMatchConfidence: null,
  spotifyMatchSource: null,
};
const track = { artist: "A", title: "T", filePath: "/x.mp3" } as any;

describe("recordPlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTrackTimestamps(); // reset the real absolute-interval state between tests
    mockHasKey.mockReturnValue(false);
    mockGetSession.mockReturnValue(1);
    mockFind.mockResolvedValue(dbTrack as any);
    mockAddPlay.mockResolvedValue({ id: 99 } as any);
  });

  it("returns null (records nothing) when there is no active DB session", async () => {
    mockGetSession.mockReturnValue(null);
    expect(await recordPlay(track)).toBeNull();
    expect(mockAddPlay).not.toHaveBeenCalled();
  });

  it("records a play and returns the play id + track info", async () => {
    const res = await recordPlay(track);
    expect(res).toEqual({ playId: 99, trackInfo: dbTrack });
    expect(mockAddPlay).toHaveBeenCalledWith(1, 5, expect.any(Number));
  });

  it("dedupes the same track within the 2-minute absolute interval (real playDedup)", async () => {
    await recordPlay(track); // first → records + stamps the absolute-interval Map
    const second = await recordPlay(track); // same track immediately → deduped
    expect(second).toBeNull();
    expect(mockAddPlay).toHaveBeenCalledTimes(1);
  });

  it("dedupes when the 60s window key was already processed", async () => {
    mockHasKey.mockReturnValue(true);
    expect(await recordPlay(track)).toBeNull();
    expect(mockAddPlay).not.toHaveBeenCalled();
  });
});
