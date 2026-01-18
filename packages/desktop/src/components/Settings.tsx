/**
 * Settings Modal Component
 * Allows users to configure app behavior.
 * Overhauled for the "Pro" look with glassmorphism and tailwind.
 */

import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  FolderOpen,
  Settings as SettingsIcon,
  X,
  Info,
  Globe,
  Key,
} from "lucide-react";
import { useState } from "react";
import { type AppSettings, useSettings } from "../hooks/useSettings";
import { useDjSettings } from "../hooks/useDjSettings";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function Settings({ isOpen, onClose }: Props) {
  const { settings, updateSetting, resetSettings, isLoading } = useSettings();
  const { serverEnv, setServerEnv, authToken, setAuthToken, validationError, isValidating } =
    useDjSettings();
  const [isSaving, setIsSaving] = useState(false);
  const [localToken, setLocalToken] = useState(authToken);

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

  const handleBpmThreshold = async (key: "slow" | "medium", value: number) => {
    setIsSaving(true);
    try {
      const current = settings["library.bpmThresholds"];
      await updateSetting("library.bpmThresholds", {
        ...current,
        [key]: value,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[1000] animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-pika-surface-1 border border-white/5 rounded-3xl w-[520px] max-h-[85vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-pika-accent/10 flex items-center justify-center text-pika-accent border border-pika-accent/20">
              <SettingsIcon size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight leading-none">
                Settings
              </h2>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">
                App Configuration
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/5 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 pro-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-40">
              <div className="w-8 h-8 border-2 border-pika-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold text-slate-400">Synchronizing...</span>
            </div>
          ) : (
            <>
              {/* Analysis Section */}
              <Section title="Analysis Engine" icon={<SettingsIcon size={14} />}>
                <ToggleSetting
                  label="On-the-fly Analysis"
                  description="Scan tracks immediately when they start playing"
                  checked={settings["analysis.onTheFly"]}
                  onChange={(v) => handleToggle("analysis.onTheFly", v)}
                  disabled={isSaving}
                  warning="High CPU impact during live sets"
                />

                <ToggleSetting
                  label="Background Post-Process"
                  description="Analyze session history automatically after disconnect"
                  checked={settings["analysis.afterSession"]}
                  onChange={(v) => handleToggle("analysis.afterSession", v)}
                  disabled={isSaving}
                />

                <div className="flex items-center justify-between p-4 bg-slate-900/40 border border-white/5 rounded-2xl">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-200">CPU Priority</span>
                    <span className="text-[11px] text-slate-500 mt-0.5">
                      Performance vs Stability
                    </span>
                  </div>
                  <select
                    value={settings["analysis.cpuPriority"]}
                    onChange={(e) => handleSelect("analysis.cpuPriority", e.target.value)}
                    disabled={isSaving}
                    className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 focus:border-pika-accent transition-all outline-none"
                  >
                    <option value="low">Low (Safe)</option>
                    <option value="normal">Normal</option>
                    <option value="high">High (Fast)</option>
                  </select>
                </div>
              </Section>

              {/* Display Section */}
              <Section title="Interface & OS" icon={<Info size={14} />}>
                <div className="flex items-center justify-between p-4 bg-slate-900/40 border border-white/5 rounded-2xl">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-200">Display Profile</span>
                    <span className="text-[11px] text-slate-500 mt-0.5">
                      Optimize for environment & eye strain
                    </span>
                  </div>
                  <select
                    value={settings["display.profile"]}
                    onChange={(e) => handleSelect("display.profile", e.target.value)}
                    disabled={isSaving}
                    className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 focus:border-pika-accent transition-all outline-none"
                  >
                    <option value="high-contrast">High Contrast (Default)</option>
                    <option value="midnight">Midnight (Reduced Strain)</option>
                    <option value="stealth">Stealth (Low Light)</option>
                  </select>
                </div>

                <ToggleSetting
                  label="Advanced Global Metrics"
                  description="Energy, Groove, and Vibe columns in library"
                  checked={settings["display.advancedMetrics"]}
                  onChange={(v) => handleToggle("display.advancedMetrics", v)}
                  disabled={isSaving}
                />

                <ToggleSetting
                  label="Pro Onboarding Tooltips"
                  description="Show helpful tips on hover for complex features"
                  checked={settings["display.showTooltips"]}
                  onChange={(v) => handleToggle("display.showTooltips", v)}
                  disabled={isSaving}
                />
              </Section>

              {/* Library Section */}
              <Section title="VirtualDJ Integration" icon={<FolderOpen size={14} />}>
                <div className="p-5 bg-slate-950/40 border border-white/5 rounded-2xl space-y-5">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">
                      Library Path
                    </label>
                    <div className="space-y-2">
                      <div className="text-[11px] font-mono text-pika-accent truncate bg-slate-950/80 p-3 rounded-xl border border-white/5 shadow-inner">
                        {settings["library.vdjPath"] === "auto"
                          ? "Auto-detecting VirtualDJ history..."
                          : settings["library.vdjPath"]}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleBrowseVdjPath}
                          className="flex-1 px-4 py-2 bg-pika-accent hover:bg-pika-accent-light text-white text-[11px] font-black rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-pika-accent/20"
                        >
                          <FolderOpen size={14} /> Local Select
                        </button>
                        {settings["library.vdjPath"] !== "auto" && (
                          <button
                            onClick={handleResetVdjPath}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px] font-bold rounded-xl transition-all"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-white/5" />

                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">
                      BPM Classification
                    </label>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">
                            Slow Cap
                          </span>
                          <span className="text-xs font-black text-white font-mono">
                            {settings["library.bpmThresholds"].slow}{" "}
                            <span className="text-[9px] opacity-40">BPM</span>
                          </span>
                        </div>
                        <input
                          type="range"
                          min="60"
                          max="100"
                          value={settings["library.bpmThresholds"].slow}
                          onChange={(e) => handleBpmThreshold("slow", parseInt(e.target.value))}
                          className="w-full accent-pika-accent"
                        />
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">
                            Fast Start
                          </span>
                          <span className="text-xs font-black text-white font-mono">
                            {settings["library.bpmThresholds"].medium}{" "}
                            <span className="text-[9px] opacity-40">BPM</span>
                          </span>
                        </div>
                        <input
                          type="range"
                          min="100"
                          max="140"
                          value={settings["library.bpmThresholds"].medium}
                          onChange={(e) => handleBpmThreshold("medium", parseInt(e.target.value))}
                          className="w-full accent-pika-accent"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </Section>
              <Section title="Developer & Network" icon={<Globe size={14} />}>
                <div className="p-5 bg-slate-950/40 border border-white/5 rounded-2xl space-y-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">
                        Environment
                      </label>
                      <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded font-bold uppercase">
                        Requires Restart
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {(["prod", "staging", "dev"] as const).map((env) => (
                        <button
                          key={env}
                          onClick={() => setServerEnv(env)}
                          className={`py-2 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all ${
                            serverEnv === env
                              ? "bg-pika-accent text-white border-pika-accent shadow-lg shadow-pika-accent/20"
                              : "bg-slate-900 text-slate-500 border-white/5 hover:border-white/10 hover:text-white"
                          }`}
                        >
                          {env}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="h-px bg-white/5" />

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none flex items-center gap-2">
                      <Key size={12} />
                      Authentication
                    </label>
                    <div className="space-y-2">
                      <input
                        type="password"
                        value={localToken}
                        onChange={(e) => setLocalToken(e.target.value)}
                        placeholder="Paste DJ Token (pk_dj_...)"
                        className="w-full bg-slate-950/80 border border-white/5 rounded-xl px-3 py-2 text-xs font-mono text-white focus:border-pika-accent outline-none transition-all placeholder:text-slate-700"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAuthToken(localToken)}
                          disabled={isValidating || localToken === authToken}
                          className="flex-1 py-2 bg-white text-slate-950 rounded-xl text-[11px] font-black uppercase tracking-wider hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          {isValidating ? "Validating..." : "Login"}
                        </button>
                        <button
                          onClick={() => {
                            setAuthToken("");
                            setLocalToken("");
                          }}
                          className="px-4 py-2 bg-slate-800 text-slate-400 rounded-xl text-[11px] font-bold hover:text-white transition-all"
                        >
                          Clear
                        </button>
                      </div>
                      {validationError && (
                        <p className="text-[10px] text-red-500 font-bold bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                          {validationError}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-white/5 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="text-[10px] font-black text-slate-500 hover:text-red-400 uppercase tracking-widest transition-colors"
          >
            Wipe to Defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-8 py-3 bg-white hover:bg-slate-100 text-slate-950 text-xs font-black rounded-2xl transition-all shadow-xl active:scale-95"
          >
            Commit Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <span className="text-pika-accent p-1.5 bg-pika-accent/5 rounded-lg border border-pika-accent/10">
          {icon}
        </span>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
          {title}
        </h3>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
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
      onClick={() => !disabled && onChange(!checked)}
      className={`px-4 py-3 flex items-center justify-between bg-slate-900/40 border border-white/5 rounded-2xl cursor-pointer hover:bg-slate-900/60 transition-all ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <div className="flex flex-col select-none">
        <span className="text-sm font-bold text-slate-200 leading-tight">{label}</span>
        {description && <span className="text-[11px] text-slate-500 mt-0.5">{description}</span>}
        {warning && checked && (
          <div className="flex items-center gap-1.5 text-[10px] text-amber-500 font-bold mt-2 uppercase tracking-tighter bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10 w-fit">
            <AlertTriangle size={10} />
            {warning}
          </div>
        )}
      </div>

      <div
        className={`w-11 h-6 rounded-full relative transition-all duration-300 ${checked ? "bg-pika-accent" : "bg-slate-800 shadow-inner"}`}
      >
        <div
          className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-lg transition-all duration-300 ${checked ? "left-6" : "left-1"}`}
        />
      </div>
    </div>
  );
}
