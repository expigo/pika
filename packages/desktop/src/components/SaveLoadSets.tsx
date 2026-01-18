import { Clock, FileText, FolderOpen, Music, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { SavedSet } from "../db/repositories/savedSetRepository";
import { useSetStore } from "../hooks/useSetBuilder";
import { toast } from "sonner";

// Format relative time
function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString();
}

export function SaveLoadSets() {
  const {
    activeSet,
    currentSetId,
    currentSetName,
    savedSets,
    loadSavedSets,
    loadSet,
    saveCurrentSet,
    updateCurrentSet,
    deleteSavedSet,
  } = useSetStore();

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Load saved sets on mount
  useEffect(() => {
    loadSavedSets();
  }, [loadSavedSets]);

  const handleSave = async () => {
    if (!saveName.trim()) return;

    setIsSaving(true);
    try {
      await saveCurrentSet(saveName.trim());
      setShowSaveModal(false);
      setSaveName("");
      toast.success("Set saved successfully");
    } catch (e) {
      console.error("Failed to save set:", e);
      toast.error("Failed to save set");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!currentSetId) return;

    setIsSaving(true);
    try {
      await updateCurrentSet();
      toast.success("Set updated successfully");
    } catch (e) {
      console.error("Failed to update set:", e);
      toast.error("Failed to update set");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoad = async (setId: number) => {
    await loadSet(setId);
    setShowLoadModal(false);
    toast.info("Set loaded");
  };

  const handleDelete = async (e: React.MouseEvent, set: SavedSet) => {
    e.stopPropagation();
    if (confirm(`Delete "${set.name}"? This cannot be undone.`)) {
      try {
        await deleteSavedSet(set.id);
        toast.info("Set deleted");
      } catch (e) {
        toast.error("Failed to delete set");
      }
    }
  };

  const hasUnsavedChanges = activeSet.length > 0;

  return (
    <>
      <div className="flex gap-1.5 items-center">
        {/* Save As New */}
        <button
          type="button"
          onClick={() => {
            setSaveName(currentSetName || "");
            setShowSaveModal(true);
          }}
          disabled={activeSet.length === 0}
          className="pro-btn pro-btn-secondary !p-1.5"
          title="Save as new set"
        >
          <Save size={12} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Save</span>
        </button>

        {/* Update Existing */}
        {currentSetId && (
          <button
            type="button"
            onClick={handleUpdate}
            disabled={isSaving}
            className="pro-btn pro-btn-secondary !p-1.5"
            title={`Update "${currentSetName}"`}
          >
            <Save size={12} className="text-pika-accent" />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Sync</span>
          </button>
        )}

        {/* Load */}
        <button
          type="button"
          onClick={() => setShowLoadModal(true)}
          className="pro-btn pro-btn-secondary !p-1.5 font-bold"
          title="Load saved set"
        >
          <FolderOpen size={12} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Open</span>
        </button>
      </div>

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSaveModal(false)}
          />
          <div className="relative w-full max-w-sm bg-pika-surface-1 border border-pika-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-4 border-b border-pika-border">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100">
                <Save size={16} className="text-pika-accent" />
                Archive Set
              </h3>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="text-slate-500 hover:text-slate-200 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Set Specification
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. Midnight Underground Phase 1"
                  className="w-full bg-slate-950 border border-pika-border rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-pika-accent/50 transition-colors"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") setShowSaveModal(false);
                  }}
                />
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-pika-accent/5 border border-pika-accent/10 rounded-lg">
                <Music size={12} className="text-pika-accent" />
                <span className="text-[11px] text-slate-400">
                  <span className="font-bold text-slate-200">{activeSet.length}</span> tracks will
                  be committed to the archive.
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 bg-slate-900/50 border-t border-pika-border">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors"
              >
                Abort
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!saveName.trim() || isSaving}
                className="pro-btn-primary px-5 py-2 text-xs font-bold disabled:opacity-50"
              >
                {isSaving ? "Persisting..." : "Commit Set"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Modal */}
      {showLoadModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowLoadModal(false)}
          />
          <div className="relative w-full max-w-md bg-pika-surface-1 border border-pika-border rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-4 border-b border-pika-border shrink-0">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100">
                <FolderOpen size={16} className="text-pika-accent" />
                Retrieve Archive
              </h3>
              <button
                type="button"
                onClick={() => setShowLoadModal(false)}
                className="text-slate-500 hover:text-slate-200 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {savedSets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-600 gap-3 opacity-40">
                  <FileText size={48} strokeWidth={1} />
                  <p className="text-sm font-medium uppercase tracking-widest">No archives found</p>
                </div>
              ) : (
                <div className="grid gap-1">
                  {savedSets.map((set) => (
                    <div
                      key={set.id}
                      onClick={() => handleLoad(set.id)}
                      className={`group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                        set.id === currentSetId
                          ? "bg-pika-accent/10 border-pika-accent/30 shadow-[0_0_20px_rgba(var(--pika-accent-rgb),0.05)]"
                          : "bg-transparent border-transparent hover:bg-slate-900/50 hover:border-slate-800"
                      }`}
                    >
                      <div className="flex flex-col gap-1 min-w-0">
                        <span
                          className={`text-sm font-bold truncate ${set.id === currentSetId ? "text-pika-accent" : "text-slate-200"}`}
                        >
                          {set.name}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1 text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                            <Music size={10} />
                            {set.trackCount} Tracks
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                            <Clock size={10} />
                            {formatRelativeTime(set.updatedAt)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, set)}
                        className="p-2 text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all transform hover:scale-110"
                        title="Delete set"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {hasUnsavedChanges && savedSets.length > 0 && (
              <div className="p-3 bg-amber-500/5 border-t border-amber-500/20 text-[10px] font-bold text-amber-500/80 text-center uppercase tracking-widest leading-relaxed">
                Caution: Loading will overwrite active crate session ({activeSet.length} tracks)
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
