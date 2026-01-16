/**
 * Settings Modal Component
 * Allows users to configure app behavior.
 */

import { open } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, FolderOpen, Settings as SettingsIcon, X } from "lucide-react";
import { useState } from "react";
import { type AppSettings, useSettings } from "../hooks/useSettings";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function Settings({ isOpen, onClose }: Props) {
  const { settings, updateSetting, resetSettings, isLoading } = useSettings();
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleToggle = async (key: keyof AppSettings, value: boolean) => {
    setIsSaving(true);
    try {
      await updateSetting(key, value);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelect = async (key: keyof AppSettings, value: string) => {
    setIsSaving(true);
    try {
      await updateSetting(key, value as AppSettings[typeof key]);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (confirm("Reset all settings to defaults?")) {
      await resetSettings();
    }
  };

  const handleBrowseVdjPath = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Select VirtualDJ history.txt",
        filters: [{ name: "Text Files", extensions: ["txt"] }],
      });
      if (selected && typeof selected === "string") {
        setIsSaving(true);
        await updateSetting("library.vdjPath", selected);
        setIsSaving(false);
      }
    } catch (e) {
      console.error("Error selecting VDJ path:", e);
    }
  };

  const handleResetVdjPath = async () => {
    setIsSaving(true);
    await updateSetting("library.vdjPath", "auto");
    setIsSaving(false);
  };

  return (
    <div
      className="settings-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        className="settings-modal"
        style={{
          background: "#1e293b",
          borderRadius: "12px",
          width: "480px",
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.5rem",
            borderBottom: "1px solid #334155",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <SettingsIcon size={20} />
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Settings</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "0.25rem",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "1.5rem" }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "2rem", opacity: 0.6 }}>
              Loading settings...
            </div>
          ) : (
            <>
              {/* Analysis Section */}
              <Section title="🎵 Analysis">
                <ToggleSetting
                  label="Enable on-the-fly analysis"
                  description="Analyze tracks as they play"
                  checked={settings["analysis.onTheFly"]}
                  onChange={(v) => handleToggle("analysis.onTheFly", v)}
                  disabled={isSaving}
                  warning="May impact VDJ performance during live sets"
                />

                <ToggleSetting
                  label="Analyze new tracks after session"
                  description="Automatically analyze tracks that were played without BPM"
                  checked={settings["analysis.afterSession"]}
                  onChange={(v) => handleToggle("analysis.afterSession", v)}
                  disabled={isSaving}
                />

                <SelectSetting
                  label="CPU Priority"
                  description="Lower priority reduces impact on VDJ"
                  value={settings["analysis.cpuPriority"]}
                  options={[
                    { value: "low", label: "Low (Safe)" },
                    { value: "normal", label: "Normal" },
                    { value: "high", label: "High (Fast)" },
                  ]}
                  onChange={(v) => handleSelect("analysis.cpuPriority", v)}
                  disabled={isSaving}
                />
              </Section>

              {/* Display Section */}
              <Section title="📊 Display">
                <ToggleSetting
                  label="Show advanced metrics"
                  description="Display energy, danceability, brightness in library"
                  checked={settings["display.advancedMetrics"]}
                  onChange={(v) => handleToggle("display.advancedMetrics", v)}
                  disabled={isSaving}
                />
              </Section>

              {/* Library Section */}
              <Section title="📁 Library">
                <div
                  style={{
                    padding: "0.75rem",
                    background: "#0f172a",
                    borderRadius: "8px",
                  }}
                >
                  <div style={{ fontWeight: 500, marginBottom: "0.5rem" }}>
                    VirtualDJ Database Path
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      opacity: 0.6,
                      marginBottom: "0.75rem",
                      wordBreak: "break-all",
                    }}
                  >
                    {settings["library.vdjPath"] === "auto"
                      ? "Auto-detect (default)"
                      : settings["library.vdjPath"]}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={handleBrowseVdjPath}
                      disabled={isSaving}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        padding: "0.5rem 0.75rem",
                        background: "#3b82f6",
                        border: "none",
                        borderRadius: "6px",
                        color: "white",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                      }}
                    >
                      <FolderOpen size={14} />
                      Browse
                    </button>
                    {settings["library.vdjPath"] !== "auto" && (
                      <button
                        type="button"
                        onClick={handleResetVdjPath}
                        disabled={isSaving}
                        style={{
                          padding: "0.5rem 0.75rem",
                          background: "transparent",
                          border: "1px solid #475569",
                          borderRadius: "6px",
                          color: "#94a3b8",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        Reset to Auto
                      </button>
                    )}
                  </div>
                </div>
              </Section>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "1rem 1.5rem",
            borderTop: "1px solid #334155",
          }}
        >
          <button
            type="button"
            onClick={handleReset}
            style={{
              padding: "0.5rem 1rem",
              background: "transparent",
              border: "1px solid #475569",
              borderRadius: "6px",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Reset to Defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.5rem 1.5rem",
              background: "#3b82f6",
              border: "none",
              borderRadius: "6px",
              color: "white",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h3
        style={{
          margin: "0 0 1rem 0",
          fontSize: "1rem",
          fontWeight: 600,
          color: "#e2e8f0",
        }}
      >
        {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>{children}</div>
    </div>
  );
}

interface ToggleSettingProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  warning?: string;
}

function ToggleSetting({
  label,
  description,
  checked,
  onChange,
  disabled,
  warning,
}: ToggleSettingProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: "0.75rem",
        background: "#0f172a",
        borderRadius: "8px",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500 }}>{label}</div>
        {description && (
          <div style={{ fontSize: "0.75rem", opacity: 0.6, marginTop: "0.25rem" }}>
            {description}
          </div>
        )}
        {warning && checked && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              fontSize: "0.75rem",
              color: "#f59e0b",
              marginTop: "0.5rem",
            }}
          >
            <AlertTriangle size={12} />
            {warning}
          </div>
        )}
      </div>
      <label
        style={{
          position: "relative",
          display: "inline-block",
          width: "44px",
          height: "24px",
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          style={{
            opacity: 0,
            width: 0,
            height: 0,
          }}
        />
        <span
          style={{
            position: "absolute",
            cursor: disabled ? "not-allowed" : "pointer",
            inset: 0,
            background: checked ? "#22c55e" : "#475569",
            borderRadius: "24px",
            transition: "background 0.2s",
          }}
        >
          <span
            style={{
              position: "absolute",
              content: "",
              height: "18px",
              width: "18px",
              left: checked ? "23px" : "3px",
              bottom: "3px",
              background: "white",
              borderRadius: "50%",
              transition: "left 0.2s",
            }}
          />
        </span>
      </label>
    </div>
  );
}

interface SelectSettingProps {
  label: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

function SelectSetting({
  label,
  description,
  value,
  options,
  onChange,
  disabled,
}: SelectSettingProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: "0.75rem",
        background: "#0f172a",
        borderRadius: "8px",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500 }}>{label}</div>
        {description && (
          <div style={{ fontSize: "0.75rem", opacity: 0.6, marginTop: "0.25rem" }}>
            {description}
          </div>
        )}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          padding: "0.5rem",
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: "6px",
          color: "white",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
