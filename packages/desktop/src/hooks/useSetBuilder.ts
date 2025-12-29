import { create } from "zustand";
import { arrayMove } from "@dnd-kit/sortable";
import type { Track } from "../db/repositories/trackRepository";

interface SetStore {
    activeSet: Track[];
    addTrack: (track: Track) => void;
    removeTrack: (id: number) => void;
    reorderTracks: (oldIndex: number, newIndex: number) => void;
    clearSet: () => void;
}

export const useSetStore = create<SetStore>((set) => ({
    activeSet: [],

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

    clearSet: () => set({ activeSet: [] }),
}));

// Derived calculations
export function getSetStats(tracks: Track[]) {
    const totalTracks = tracks.length;

    // Calculate average energy
    const tracksWithEnergy = tracks.filter((t) => t.energy !== null);
    const avgEnergy =
        tracksWithEnergy.length > 0
            ? tracksWithEnergy.reduce((sum, t) => sum + (t.energy ?? 0), 0) /
            tracksWithEnergy.length
            : 0;

    // Calculate average BPM
    const tracksWithBpm = tracks.filter((t) => t.bpm !== null);
    const avgBpm =
        tracksWithBpm.length > 0
            ? tracksWithBpm.reduce((sum, t) => sum + (t.bpm ?? 0), 0) /
            tracksWithBpm.length
            : 0;

    return {
        totalTracks,
        avgEnergy: Math.round(avgEnergy),
        avgBpm: Math.round(avgBpm * 10) / 10,
    };
}
