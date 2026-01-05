import { useState, useEffect } from "react";
import { Save, FolderOpen, Trash2, X, FileText, Clock, Music } from "lucide-react";
import { useSetStore } from "../hooks/useSetBuilder";
import type { SavedSet } from "../db/repositories/savedSetRepository";

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
        deleteSavedSet
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
        } catch (e) {
            console.error("Failed to save set:", e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdate = async () => {
        if (!currentSetId) return;

        setIsSaving(true);
        try {
            await updateCurrentSet();
        } catch (e) {
            console.error("Failed to update set:", e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleLoad = async (setId: number) => {
        await loadSet(setId);
        setShowLoadModal(false);
    };

    const handleDelete = async (e: React.MouseEvent, set: SavedSet) => {
        e.stopPropagation();
        if (confirm(`Delete "${set.name}"? This cannot be undone.`)) {
            await deleteSavedSet(set.id);
        }
    };

    const hasUnsavedChanges = activeSet.length > 0;

    return (
        <>
            {/* Action Buttons */}
            <div style={styles.buttonGroup}>
                {/* Save As New */}
                <button
                    type="button"
                    onClick={() => {
                        setSaveName(currentSetName || "");
                        setShowSaveModal(true);
                    }}
                    disabled={activeSet.length === 0}
                    style={{
                        ...styles.button,
                        opacity: activeSet.length === 0 ? 0.5 : 1,
                    }}
                    title="Save as new set"
                >
                    <Save size={14} />
                    Save
                </button>

                {/* Update Existing */}
                {currentSetId && (
                    <button
                        type="button"
                        onClick={handleUpdate}
                        disabled={isSaving}
                        style={styles.button}
                        title={`Update "${currentSetName}"`}
                    >
                        <Save size={14} />
                        Update
                    </button>
                )}

                {/* Load */}
                <button
                    type="button"
                    onClick={() => setShowLoadModal(true)}
                    style={styles.button}
                    title="Load saved set"
                >
                    <FolderOpen size={14} />
                    Load
                </button>
            </div>

            {/* Current Set Info */}
            {currentSetName && (
                <div style={styles.currentSetBadge}>
                    <FileText size={12} />
                    <span>{currentSetName}</span>
                </div>
            )}

            {/* Save Modal */}
            {showSaveModal && (
                <div style={styles.modalOverlay} onClick={() => setShowSaveModal(false)}>
                    <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div style={styles.modalHeader}>
                            <h3 style={styles.modalTitle}>
                                <Save size={18} />
                                Save Set
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowSaveModal(false)}
                                style={styles.closeButton}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div style={styles.modalBody}>
                            <label style={styles.label}>Set Name</label>
                            <input
                                type="text"
                                value={saveName}
                                onChange={(e) => setSaveName(e.target.value)}
                                placeholder="e.g., Friday Night Warmup"
                                style={styles.input}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSave();
                                    if (e.key === "Escape") setShowSaveModal(false);
                                }}
                            />
                            <p style={styles.hint}>
                                {activeSet.length} tracks will be saved
                            </p>
                        </div>
                        <div style={styles.modalFooter}>
                            <button
                                type="button"
                                onClick={() => setShowSaveModal(false)}
                                style={styles.cancelButton}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={!saveName.trim() || isSaving}
                                style={{
                                    ...styles.primaryButton,
                                    opacity: !saveName.trim() || isSaving ? 0.5 : 1,
                                }}
                            >
                                {isSaving ? "Saving..." : "Save Set"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Load Modal */}
            {showLoadModal && (
                <div style={styles.modalOverlay} onClick={() => setShowLoadModal(false)}>
                    <div style={{ ...styles.modal, ...styles.loadModal }} onClick={(e) => e.stopPropagation()}>
                        <div style={styles.modalHeader}>
                            <h3 style={styles.modalTitle}>
                                <FolderOpen size={18} />
                                Load Saved Set
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowLoadModal(false)}
                                style={styles.closeButton}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div style={styles.modalBody}>
                            {savedSets.length === 0 ? (
                                <div style={styles.emptyState}>
                                    <FileText size={32} style={{ opacity: 0.4 }} />
                                    <p>No saved sets yet</p>
                                </div>
                            ) : (
                                <div style={styles.setList}>
                                    {savedSets.map((set) => (
                                        <div
                                            key={set.id}
                                            onClick={() => handleLoad(set.id)}
                                            style={{
                                                ...styles.setItem,
                                                background: set.id === currentSetId ? "rgba(59, 130, 246, 0.2)" : "transparent",
                                            }}
                                        >
                                            <div style={styles.setInfo}>
                                                <span style={styles.setName}>{set.name}</span>
                                                <div style={styles.setMeta}>
                                                    <span style={styles.metaItem}>
                                                        <Music size={12} />
                                                        {set.trackCount} tracks
                                                    </span>
                                                    <span style={styles.metaItem}>
                                                        <Clock size={12} />
                                                        {formatRelativeTime(set.updatedAt)}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => handleDelete(e, set)}
                                                style={styles.deleteButton}
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
                            <div style={styles.warningBanner}>
                                ⚠️ Loading will replace your current {activeSet.length} tracks
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
    buttonGroup: {
        display: "flex",
        gap: "0.5rem",
    },
    button: {
        display: "flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.35rem 0.6rem",
        background: "rgba(255, 255, 255, 0.1)",
        border: "1px solid rgba(255, 255, 255, 0.2)",
        borderRadius: "6px",
        color: "#e2e8f0",
        fontSize: "0.75rem",
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.15s",
    },
    currentSetBadge: {
        display: "flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.25rem 0.5rem",
        background: "rgba(34, 197, 94, 0.15)",
        border: "1px solid rgba(34, 197, 94, 0.3)",
        borderRadius: "4px",
        color: "#22c55e",
        fontSize: "0.7rem",
        fontWeight: 500,
    },
    modalOverlay: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
    },
    modal: {
        background: "#1e293b",
        borderRadius: "12px",
        border: "1px solid #334155",
        width: "100%",
        maxWidth: "400px",
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)",
    },
    loadModal: {
        maxWidth: "480px",
        maxHeight: "70vh",
        display: "flex",
        flexDirection: "column",
    },
    modalHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "1rem",
        borderBottom: "1px solid #334155",
    },
    modalTitle: {
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        margin: 0,
        fontSize: "1rem",
        fontWeight: 600,
        color: "#e2e8f0",
    },
    closeButton: {
        background: "transparent",
        border: "none",
        color: "#64748b",
        cursor: "pointer",
        padding: "0.25rem",
        display: "flex",
    },
    modalBody: {
        padding: "1rem",
        overflow: "auto",
    },
    modalFooter: {
        display: "flex",
        justifyContent: "flex-end",
        gap: "0.5rem",
        padding: "1rem",
        borderTop: "1px solid #334155",
    },
    label: {
        display: "block",
        marginBottom: "0.5rem",
        fontSize: "0.85rem",
        fontWeight: 500,
        color: "#94a3b8",
    },
    input: {
        width: "100%",
        padding: "0.6rem 0.8rem",
        background: "#0f172a",
        border: "1px solid #334155",
        borderRadius: "6px",
        color: "#e2e8f0",
        fontSize: "0.9rem",
        outline: "none",
    },
    hint: {
        marginTop: "0.5rem",
        fontSize: "0.75rem",
        color: "#64748b",
    },
    cancelButton: {
        padding: "0.5rem 1rem",
        background: "transparent",
        border: "1px solid #475569",
        borderRadius: "6px",
        color: "#94a3b8",
        fontSize: "0.85rem",
        cursor: "pointer",
    },
    primaryButton: {
        padding: "0.5rem 1rem",
        background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
        border: "none",
        borderRadius: "6px",
        color: "#fff",
        fontSize: "0.85rem",
        fontWeight: 600,
        cursor: "pointer",
    },
    emptyState: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        color: "#64748b",
        gap: "0.5rem",
    },
    setList: {
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
    },
    setItem: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.75rem",
        borderRadius: "8px",
        border: "1px solid #334155",
        cursor: "pointer",
        transition: "all 0.15s",
    },
    setInfo: {
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
    },
    setName: {
        fontWeight: 600,
        color: "#e2e8f0",
        fontSize: "0.9rem",
    },
    setMeta: {
        display: "flex",
        gap: "0.75rem",
    },
    metaItem: {
        display: "flex",
        alignItems: "center",
        gap: "0.25rem",
        fontSize: "0.75rem",
        color: "#64748b",
    },
    deleteButton: {
        padding: "0.4rem",
        background: "transparent",
        border: "none",
        color: "#ef4444",
        cursor: "pointer",
        opacity: 0.6,
        transition: "opacity 0.15s",
    },
    warningBanner: {
        padding: "0.75rem 1rem",
        background: "rgba(234, 179, 8, 0.1)",
        borderTop: "1px solid rgba(234, 179, 8, 0.3)",
        color: "#eab308",
        fontSize: "0.8rem",
        textAlign: "center",
    },
};
