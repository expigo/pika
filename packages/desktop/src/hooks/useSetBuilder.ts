import { arrayMove } from "@dnd-kit/sortable";
import { create } from "zustand";
import { type SavedSet, savedSetRepository } from "../db/repositories/savedSetRepository";
import { type Track, trackRepository } from "../db/repositories/trackRepository";

interface SetStore {
  // Current working set
  activeSet: Track[];
  currentSetId: number | null; // ID if loaded from saved set
  currentSetName: string | null;

  // Saved sets list
  savedSets: SavedSet[];

  // Actions for current set
  addTrack: (track: Track) => void;
  removeTrack: (id: number) => void;
  reorderTracks: (oldIndex: number, newIndex: number) => void;
  clearSet: () => void;
  refreshTracks: () => Promise<void>; // Refresh track data from DB

  // Actions for save/load
  loadSavedSets: () => Promise<void>;
  loadSet: (setId: number) => Promise<void>;
  saveCurrentSet: (name: string) => Promise<number>;
  updateCurrentSet: () => Promise<void>;
  deleteSavedSet: (setId: number) => Promise<void>;
}

export const useSetStore = create<SetStore>((set, get) => ({
  activeSet: [],
  currentSetId: null,
  currentSetName: null,
  savedSets: [],

  addTrack: (track) =>
    set((state) => {
      // Prevent duplicates based on ID
      if (state.activeSet.some((t) => t.id === track.id)) {
        return state;
      }
      return { activeSet: [...state.activeSet, track] };
    }),

  removeTrack: (id) =>
    set((state) => ({
      activeSet: state.activeSet.filter((t) => t.id !== id),
    })),

  reorderTracks: (oldIndex, newIndex) =>
    set((state) => ({
      activeSet: arrayMove(state.activeSet, oldIndex, newIndex),
    })),

  clearSet: () =>
    set({
      activeSet: [],
      currentSetId: null,
      currentSetName: null,
    }),

  // Refresh track data from database (e.g., after analysis)
  refreshTracks: async () => {
    const { activeSet } = get();
    if (activeSet.length === 0) return;

    try {
      const trackIds = activeSet.map((t) => t.id);
      const freshTracks: Track[] = [];

      for (const id of trackIds) {
        const track = await trackRepository.getTrackById(id);
        if (track) {
          freshTracks.push(track);
        }
      }

      set({ activeSet: freshTracks });
    } catch (e) {
      console.error("Failed to refresh tracks:", e);
    }
  },

  // Load list of saved sets
  loadSavedSets: async () => {
    try {
      const sets = await savedSetRepository.getAllSets();
      set({ savedSets: sets });
    } catch (e) {
      console.error("Failed to load saved sets:", e);
    }
  },

  // Load a specific saved set
  loadSet: async (setId: number) => {
    try {
      const savedSet = await savedSetRepository.getSetWithTracks(setId);
      if (savedSet) {
        set({
          activeSet: savedSet.tracks,
          currentSetId: savedSet.id,
          currentSetName: savedSet.name,
        });
      }
    } catch (e) {
      console.error("Failed to load set:", e);
    }
  },

  // Save current set as new
  saveCurrentSet: async (name: string) => {
    const { activeSet } = get();
    const trackIds = activeSet.map((t) => t.id);

    const newSetId = await savedSetRepository.saveSet(name, trackIds);

    // Update state
    set({
      currentSetId: newSetId,
      currentSetName: name,
    });

    // Refresh saved sets list
    await get().loadSavedSets();

    return newSetId;
  },

  // Update existing set with current tracks
  updateCurrentSet: async () => {
    const { activeSet, currentSetId } = get();
    if (!currentSetId) return;

    const trackIds = activeSet.map((t) => t.id);
    await savedSetRepository.updateSetTracks(currentSetId, trackIds);

    // Refresh saved sets list
    await get().loadSavedSets();
  },

  // Delete a saved set
  deleteSavedSet: async (setId: number) => {
    const { currentSetId } = get();

    await savedSetRepository.deleteSet(setId);

    // If we deleted the currently loaded set, clear the reference
    if (currentSetId === setId) {
      set({
        currentSetId: null,
        currentSetName: null,
      });
    }

    // Refresh saved sets list
    await get().loadSavedSets();
  },
}));

// Derived calculations
export function getSetStats(tracks: Track[]) {
  const totalTracks = tracks.length;

  // Calculate average energy
  const tracksWithEnergy = tracks.filter((t) => t.energy !== null);
  const avgEnergy =
    tracksWithEnergy.length > 0
      ? tracksWithEnergy.reduce((sum, t) => sum + (t.energy ?? 0), 0) / tracksWithEnergy.length
      : 0;

  // Calculate average BPM
  const tracksWithBpm = tracks.filter((t) => t.bpm !== null);
  const avgBpm =
    tracksWithBpm.length > 0
      ? tracksWithBpm.reduce((sum, t) => sum + (t.bpm ?? 0), 0) / tracksWithBpm.length
      : 0;

  // Calculate total duration
  const tracksWithDuration = tracks.filter((t) => t.duration !== null);
  const totalDuration = tracksWithDuration.reduce((sum, t) => sum + (t.duration ?? 0), 0);

  return {
    totalTracks,
    avgEnergy: Math.round(avgEnergy),
    avgBpm: Math.round(avgBpm * 10) / 10,
    totalDuration,
  };
}
