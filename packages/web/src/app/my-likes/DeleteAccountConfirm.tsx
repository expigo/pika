"use client";

/**
 * The two-tap delete-account pair: arm ("Delete account") → confirm ("Send confirmation
 * email?"). Shared by the account card and the zero-likes empty state; the page owns the
 * `confirming` bit so the two render sites stay in sync.
 */
export function DeleteAccountConfirm({
  confirming,
  onArm,
  onConfirm,
}: {
  confirming: boolean;
  onArm: () => void;
  onConfirm: () => void;
}) {
  return confirming ? (
    <button
      type="button"
      onClick={onConfirm}
      className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-[9px] font-black uppercase tracking-widest hover:bg-red-500/30 transition-colors"
    >
      Send confirmation email?
    </button>
  ) : (
    <button
      type="button"
      onClick={onArm}
      className="text-[9px] font-black text-slate-600 uppercase tracking-widest hover:text-red-400 transition-colors"
    >
      Delete account
    </button>
  );
}
