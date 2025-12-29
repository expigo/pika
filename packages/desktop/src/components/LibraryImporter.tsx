import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

// Matches the Rust struct
interface VirtualDJTrack {
    file_path: string;
    artist?: string;
    title?: string;
    bpm?: string;
    key?: string;
}

export function LibraryImporter() {
    const [count, setCount] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleImport = async () => {
        try {
            setLoading(true);
            setError(null);
            setCount(null);

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

            // selected is string when multiple is false
            const result = await invoke<VirtualDJTrack[]>("import_virtualdj_library", {
                xmlPath: selected,
            });

            setCount(result.length);
        } catch (err: any) {
            console.error("Import error:", err);
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="library-importer" style={{ marginTop: "2rem" }}>
            <button
                type="button"
                onClick={handleImport}
                disabled={loading}
                className="retry-button" // Styling reuse
                style={{
                    background: "#334155",
                    color: "white",
                    padding: "0.5rem 1rem",
                    border: "none",
                    borderRadius: "6px",
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.7 : 1,
                }}
            >
                {loading ? "Parsing..." : "Import VirtualDJ Database"}
            </button>

            {count !== null && (
                <div style={{ marginTop: "1rem" }}>✅ Found {count.toLocaleString()} tracks</div>
            )}

            {error && <div className="error-message" style={{ marginTop: "1rem" }}>❌ {error}</div>}
        </div>
    );
}
