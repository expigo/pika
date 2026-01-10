import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { trackRepository, type VirtualDJTrack } from "../db/repositories/trackRepository";

interface Props {
  onImportComplete?: () => void;
}

export function LibraryImporter({ onImportComplete }: Props) {
  const [parsedTracks, setParsedTracks] = useState<VirtualDJTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    try {
      setLoading(true);
      setError(null);
      setParsedTracks([]);

      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Xml Database",
            extensions: ["xml"],
          },
        ],
      });

      if (!selected) {
        setLoading(false);
        return;
      }

      const result = await invoke<VirtualDJTrack[]>("import_virtualdj_library", {
        xmlPath: selected,
      });

      setParsedTracks(result);
    } catch (err: any) {
      console.error("Import error:", err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (parsedTracks.length === 0) return;

    try {
      setSaving(true);
      await trackRepository.addTracks(parsedTracks);
      setParsedTracks([]);
      onImportComplete?.();
      alert(`Successfully saved ${parsedTracks.length} tracks to database!`);
    } catch (err: any) {
      console.error("Save error:", err);
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="library-importer" style={{ marginTop: "2rem" }}>
      <div style={{ display: "flex", gap: "1rem" }}>
        <button
          type="button"
          onClick={handleImport}
          disabled={loading || saving}
          className="retry-button"
          style={{
            background: "#334155",
            color: "white",
            padding: "0.5rem 1rem",
            border: "none",
            borderRadius: "6px",
            cursor: loading || saving ? "not-allowed" : "pointer",
            opacity: loading || saving ? 0.7 : 1,
          }}
        >
          {loading ? "Parsing..." : "Import VirtualDJ Database"}
        </button>

        {parsedTracks.length > 0 && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="retry-button"
            style={{
              background: "#0891b2", // Cyan color for save action
              color: "white",
              padding: "0.5rem 1rem",
              border: "none",
              borderRadius: "6px",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving to Database..." : "Save to Database"}
          </button>
        )}
      </div>

      {parsedTracks.length > 0 && !saving && (
        <div style={{ marginTop: "1rem" }}>
          ✅ Found {parsedTracks.length.toLocaleString()} tracks. Ready to save.
        </div>
      )}

      {error && (
        <div className="error-message" style={{ marginTop: "1rem" }}>
          ❌ {error}
        </div>
      )}
    </div>
  );
}
