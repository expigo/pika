/**
 * Simple store to trigger library refreshes from anywhere in the app.
 *
 * Usage:
 * - In LibraryBrowser: subscribe to `refreshTrigger` in useEffect dependency
 * - Anywhere else: call `triggerRefresh()` to reload the library
 */

import { create } from "zustand";

interface LibraryRefreshStore {
  refreshTrigger: number;
  triggerRefresh: () => void;
}

export const useLibraryRefresh = create<LibraryRefreshStore>((set) => ({
  refreshTrigger: 0,
  triggerRefresh: () => set((state) => ({ refreshTrigger: state.refreshTrigger + 1 })),
}));
