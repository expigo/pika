"use client";

import { Heart, Radio } from "lucide-react";
import Link from "next/link";
import { ProCard } from "@/components/ui/ProCard";

interface EmptyStateProps {
  /** Signed-in account email, or null when signed out (hides the account controls). */
  email: string | null;
  /** Page-owned: the delete two-tap is shared with the account card. */
  confirmingDelete: boolean;
  onSignOut: () => void;
  onArmDelete: () => void;
  onDeleteAccount: () => void;
}

/** Zero-likes empty state — keeps sign-out + GDPR deletion reachable when signed in. */
export function EmptyState({
  email,
  confirmingDelete,
  onSignOut,
  onArmDelete,
  onDeleteAccount,
}: EmptyStateProps) {
  return (
    <div className="h-[100dvh] w-full bg-slate-950 flex flex-col items-center justify-center p-4 overflow-hidden">
      <ProCard className="max-w-md w-full p-12 text-center" glow align="center">
        <div className="w-20 h-20 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl">
          <Heart className="w-8 h-8 text-slate-700" />
        </div>
        <h1 className="text-2xl font-black text-white mb-4 italic uppercase tracking-tighter">
          The Pages are Blank
        </h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest leading-relaxed mb-10">
          You haven't liked any songs yet. Head to the floor and start syncing!
        </p>
        <Link
          href="/live"
          className="inline-flex items-center gap-3 px-8 py-4 bg-white text-slate-950 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-xl"
        >
          <Radio className="w-4 h-4" />
          Find a Room
        </Link>
        {/* Account controls must stay reachable at zero likes (sign-out + GDPR deletion). */}
        {email !== null && (
          <div className="mt-10 pt-6 border-t border-white/[0.04] space-y-3">
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
              Signed in as <span className="text-slate-400">{email}</span>
            </p>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={onSignOut}
                className="text-[9px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
              >
                Sign out
              </button>
              {confirmingDelete ? (
                <button
                  type="button"
                  onClick={onDeleteAccount}
                  className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-[9px] font-black uppercase tracking-widest hover:bg-red-500/30 transition-colors"
                >
                  Send confirmation email?
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onArmDelete}
                  className="text-[9px] font-black text-slate-600 uppercase tracking-widest hover:text-red-400 transition-colors"
                >
                  Delete account
                </button>
              )}
            </div>
          </div>
        )}
      </ProCard>
    </div>
  );
}
