/**
 * TemplateManager Component
 * UI for managing set templates (save/load/edit/delete)
 */

import { Check, Copy, LayoutTemplate, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { type SetTemplate, templateRepository } from "../db/repositories/templateRepository";

interface Props {
  onClose: () => void;
  /** Called when user selects a template to apply */
  onApplyTemplate?: (template: SetTemplate) => void;
  /** Current set data for "Save as Template" functionality */
  currentSetTracks?: Array<{
    position: number;
    bpm: number | null;
    energy: number | null;
  }>;
}

export function TemplateManager({ onClose, onApplyTemplate, currentSetTracks }: Props) {
  const [templates, setTemplates] = useState<SetTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<SetTemplate | null>(null);

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    const result = await templateRepository.getAllTemplates();
    setTemplates(result);
    setLoading(false);
  };

  const handleSaveAsTemplate = async () => {
    if (!newTemplateName.trim() || !currentSetTracks?.length) return;
    setSaving(true);
    await templateRepository.createTemplateFromSet(
      newTemplateName.trim(),
      currentSetTracks.map((t, i) => ({ ...t, position: i + 1 })),
    );
    setNewTemplateName("");
    await loadTemplates();
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    await templateRepository.deleteTemplate(id);
    await loadTemplates();
    if (selectedTemplate?.id === id) {
      setSelectedTemplate(null);
    }
  };

  const handleDuplicate = async (template: SetTemplate) => {
    await templateRepository.duplicateTemplate(template.id, `${template.name} (Copy)`);
    await loadTemplates();
  };

  const handleApply = (template: SetTemplate) => {
    onApplyTemplate?.(template);
    onClose();
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            <LayoutTemplate size={18} />
            Set Templates
          </div>
          <button type="button" onClick={onClose} style={styles.closeButton}>
            <X size={18} />
          </button>
        </div>

        {/* Save Current Set as Template */}
        {currentSetTracks && currentSetTracks.length > 0 && (
          <div style={styles.saveSection}>
            <label style={styles.label}>Save Current Set as Template</label>
            <div style={styles.saveRow}>
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Template name..."
                style={styles.input}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveAsTemplate();
                }}
              />
              <button
                type="button"
                onClick={handleSaveAsTemplate}
                disabled={saving || !newTemplateName.trim()}
                style={{
                  ...styles.saveButton,
                  opacity: saving || !newTemplateName.trim() ? 0.5 : 1,
                }}
              >
                <Plus size={14} />
                Save
              </button>
            </div>
            <p style={styles.hint}>Saves {currentSetTracks.length} slots with BPM/energy targets</p>
          </div>
        )}

        {/* Template List */}
        <div style={styles.listSection}>
          <label style={styles.label}>Your Templates</label>
          {loading ? (
            <div style={styles.loading}>Loading...</div>
          ) : templates.length === 0 ? (
            <div style={styles.empty}>No templates yet. Save your first set!</div>
          ) : (
            <div style={styles.templateList}>
              {templates.map((template) => (
                <div
                  key={template.id}
                  style={{
                    ...styles.templateItem,
                    ...(selectedTemplate?.id === template.id ? styles.templateItemSelected : {}),
                  }}
                  onClick={() => setSelectedTemplate(template)}
                >
                  <div style={styles.templateInfo}>
                    <div style={styles.templateName}>{template.name}</div>
                    <div style={styles.templateMeta}>
                      {template.slots.length} slots • {formatDate(template.updatedAt)}
                    </div>
                  </div>
                  <div style={styles.templateActions}>
                    {onApplyTemplate && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApply(template);
                        }}
                        style={styles.applyButton}
                        title="Apply template"
                      >
                        <Check size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicate(template);
                      }}
                      style={styles.iconButton}
                      title="Duplicate"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(template.id);
                      }}
                      style={styles.deleteButton}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Template Details */}
        {selectedTemplate && (
          <div style={styles.detailsSection}>
            <label style={styles.label}>Template Slots</label>
            <div style={styles.slotList}>
              {selectedTemplate.slots.map((slot, i) => (
                <div key={slot.position || i} style={styles.slotItem}>
                  <span style={styles.slotPosition}>{slot.position || i + 1}</span>
                  <span style={styles.slotInfo}>
                    BPM: {slot.targetBpmMin ?? "?"}-{slot.targetBpmMax ?? "?"} • Energy:{" "}
                    {slot.targetEnergy ?? "?"}
                  </span>
                  {slot.notes && <span style={styles.slotNotes}>{slot.notes}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "#1e293b",
    borderRadius: "12px",
    border: "1px solid #334155",
    width: "520px",
    maxWidth: "90vw",
    maxHeight: "80vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1rem",
    borderBottom: "1px solid #334155",
    flexShrink: 0,
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontWeight: 600,
    fontSize: "1rem",
  },
  closeButton: {
    background: "transparent",
    border: "none",
    color: "#94a3b8",
    cursor: "pointer",
    padding: "4px",
    display: "flex",
  },
  saveSection: {
    padding: "1rem",
    borderBottom: "1px solid #334155",
    background: "#0f172a",
    flexShrink: 0,
  },
  label: {
    display: "block",
    marginBottom: "8px",
    color: "#94a3b8",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  saveRow: {
    display: "flex",
    gap: "8px",
  },
  input: {
    flex: 1,
    padding: "8px 12px",
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "6px",
    color: "#e2e8f0",
    fontSize: "0.85rem",
    outline: "none",
  },
  saveButton: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "8px 14px",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    border: "none",
    borderRadius: "6px",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "0.8rem",
  },
  hint: {
    marginTop: "6px",
    color: "#64748b",
    fontSize: "0.75rem",
  },
  listSection: {
    padding: "1rem",
    flex: 1,
    overflow: "auto",
  },
  loading: {
    color: "#64748b",
    fontSize: "0.85rem",
    textAlign: "center",
    padding: "2rem",
  },
  empty: {
    color: "#64748b",
    fontSize: "0.85rem",
    textAlign: "center",
    padding: "2rem",
    fontStyle: "italic",
  },
  templateList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  templateItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    background: "#0f172a",
    borderRadius: "8px",
    border: "1px solid #334155",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  templateItemSelected: {
    borderColor: "#6366f1",
    background: "rgba(99, 102, 241, 0.1)",
  },
  templateInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  templateName: {
    fontWeight: 500,
    fontSize: "0.9rem",
  },
  templateMeta: {
    color: "#64748b",
    fontSize: "0.75rem",
  },
  templateActions: {
    display: "flex",
    gap: "4px",
  },
  iconButton: {
    padding: "6px",
    background: "transparent",
    border: "1px solid #475569",
    borderRadius: "4px",
    color: "#94a3b8",
    cursor: "pointer",
    display: "flex",
  },
  applyButton: {
    padding: "6px 10px",
    background: "rgba(34, 197, 94, 0.2)",
    border: "1px solid rgba(34, 197, 94, 0.4)",
    borderRadius: "4px",
    color: "#22c55e",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "0.75rem",
    fontWeight: 600,
  },
  deleteButton: {
    padding: "6px",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "4px",
    color: "#ef4444",
    cursor: "pointer",
    display: "flex",
  },
  detailsSection: {
    padding: "1rem",
    borderTop: "1px solid #334155",
    background: "#0f172a",
    maxHeight: "200px",
    overflow: "auto",
    flexShrink: 0,
  },
  slotList: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  slotItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 8px",
    background: "#1e293b",
    borderRadius: "4px",
    fontSize: "0.8rem",
  },
  slotPosition: {
    width: "24px",
    height: "24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#334155",
    borderRadius: "4px",
    fontWeight: 600,
    fontSize: "0.75rem",
  },
  slotInfo: {
    color: "#94a3b8",
    flex: 1,
  },
  slotNotes: {
    color: "#64748b",
    fontSize: "0.7rem",
    fontStyle: "italic",
  },
};
