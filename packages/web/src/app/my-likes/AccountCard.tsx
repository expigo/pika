"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProCard } from "@/components/ui/ProCard";
import { DeleteAccountConfirm } from "./DeleteAccountConfirm";
import { formatDate } from "./journal-utils";
import type { ClaimedDevice, FollowedDj } from "./types";

interface AccountCardProps {
  email: string;
  claimedCount: number;
  devices: ClaimedDevice[];
  /** This device's id, read once by the page — replaces render-time localStorage reads. */
  currentClientId: string | null;
  follows: FollowedDj[];
  prefs: { recapEmails: boolean } | null;
  /** Page-owned: the delete two-tap is shared with the zero-likes empty state. */
  confirmingDelete: boolean;
  onSignOut: () => void;
  onArmDelete: () => void;
  onDeleteAccount: () => void;
  onUnlinkDevice: (clientId: string) => Promise<void>;
  onToggleRecapEmails: () => void;
  onUnfollow: (slug: string | null) => void;
}

/** ACCOUNT CARD (Slice B) — the durable anchor behind this device's journal. */
export function AccountCard({
  email,
  claimedCount,
  devices,
  currentClientId,
  follows,
  prefs,
  confirmingDelete,
  onSignOut,
  onArmDelete,
  onDeleteAccount,
  onUnlinkDevice,
  onToggleRecapEmails,
  onUnfollow,
}: AccountCardProps) {
  // Per-device unlink (other devices only — this device's detach is "Sign out": the signed-in
  // auto-claim would silently re-claim it on the next visit). Nothing is destroyed: the device
  // reverts to anonymous history and can re-claim any time.
  const [confirmingUnlinkId, setConfirmingUnlinkId] = useState<string | null>(null);
  const unlinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armUnlink = useCallback((clientId: string) => {
    if (unlinkTimer.current) clearTimeout(unlinkTimer.current);
    setConfirmingUnlinkId(clientId);
    unlinkTimer.current = setTimeout(() => setConfirmingUnlinkId(null), 4000);
  }, []);
  useEffect(
    () => () => {
      if (unlinkTimer.current) clearTimeout(unlinkTimer.current);
    },
    [],
  );

  const confirmUnlink = (clientId: string) => {
    if (unlinkTimer.current) clearTimeout(unlinkTimer.current);
    setConfirmingUnlinkId(null);
    void onUnlinkDevice(clientId);
  };

  return (
    <ProCard className="mb-8 p-6" glow glowColor="purple-500">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-[9px] font-black text-purple-400 uppercase tracking-[0.3em] mb-1">
            Journal account
          </p>
          <p className="text-xs font-black text-white truncate">{email}</p>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter mt-1">
            Synced across your devices
            {claimedCount > 1 ? ` · ${claimedCount} devices linked` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-white hover:bg-white/[0.06] transition-all"
        >
          Sign out
        </button>
      </div>

      {/* LINKED DEVICES — labels captured at claim time; unlink returns a device to
          anonymous history (this device's detach is Sign out, not unlink) */}
      {devices.length > 0 && (
        <ul className="mt-4 pt-4 border-t border-white/[0.04] space-y-2">
          {devices.map((device) => {
            const isThisDevice = device.clientId === currentClientId;
            return (
              <li
                key={device.clientId}
                className="flex items-center justify-between gap-4 flex-wrap"
              >
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  <span className="text-slate-300">{device.label ?? "Device"}</span>
                  {" · linked "}
                  {formatDate(device.claimedAt)}
                </p>
                {isThisDevice ? (
                  <span className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[8px] font-black uppercase tracking-widest">
                    This device
                  </span>
                ) : confirmingUnlinkId === device.clientId ? (
                  <button
                    type="button"
                    onClick={() => confirmUnlink(device.clientId)}
                    aria-label={`Confirm unlinking ${device.label ?? "device"}`}
                    className="px-3 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-[9px] font-black uppercase tracking-widest hover:bg-red-500/30 transition-colors"
                  >
                    Unlink?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => armUnlink(device.clientId)}
                    aria-label={`Unlink ${device.label ?? "device"}`}
                    className="text-[9px] font-black text-slate-600 uppercase tracking-widest hover:text-red-400 transition-colors"
                  >
                    Unlink
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* YOUR DJs (Slice C) — followed DJs; each row links to the Booth */}
      {follows.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/[0.04]">
          <p className="text-[9px] font-black text-purple-400 uppercase tracking-[0.3em] mb-2">
            Your DJs
          </p>
          <ul className="space-y-2">
            {follows.map((f) => (
              <li
                key={f.slug ?? f.djName}
                className="flex items-center justify-between gap-4 flex-wrap"
              >
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest min-w-0">
                  {f.slug ? (
                    <Link
                      href={`/dj/${f.slug}`}
                      className="text-slate-300 hover:text-white transition-colors"
                    >
                      {f.djName}
                    </Link>
                  ) : (
                    <span className="text-slate-300">{f.djName}</span>
                  )}
                  {f.nextGig && (
                    <span className="ml-2 px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[8px] font-black normal-case">
                      Next gig {formatDate(f.nextGig)}
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => onUnfollow(f.slug)}
                  aria-label={`Unfollow ${f.djName}`}
                  className="text-[9px] font-black text-slate-600 uppercase tracking-widest hover:text-red-400 transition-colors"
                >
                  Unfollow
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* EMAIL PREFERENCES (Slice C) — explicit marketing consent, toggleable anytime */}
      {prefs && (
        <div className="mt-4 pt-4 border-t border-white/[0.04] flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
            Night recap emails — your loved songs, the morning after
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.recapEmails}
            aria-label="Night recap emails"
            onClick={onToggleRecapEmails}
            className={`px-3 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-colors ${
              prefs.recapEmails
                ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                : "bg-white/[0.03] border-white/10 text-slate-500 hover:text-slate-300"
            }`}
          >
            {prefs.recapEmails ? "On" : "Off"}
          </button>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-white/[0.04] flex items-center justify-between gap-4 flex-wrap">
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
          Deleting unlinks your devices — likes stay anonymous on each
        </p>
        <DeleteAccountConfirm
          confirming={confirmingDelete}
          onArm={onArmDelete}
          onConfirm={onDeleteAccount}
        />
      </div>
    </ProCard>
  );
}
