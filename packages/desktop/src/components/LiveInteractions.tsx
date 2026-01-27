import { BarChart2, Clock, Megaphone, X, MessageSquare, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { ActivePoll } from "./LivePerformanceMode";
import { POLL_PRESETS } from "./PollPresets";
import type { PlayWithTrack } from "../db/repositories/sessionRepository";
import { useEffect, useState } from "react";

export interface EndedPoll {
  id: number;
  question: string;
  options: string[];
  votes: number[];
  totalVotes: number;
  winner: string;
  winnerPercent: number;
}

export interface Announcement {
  message: string;
  endsAt?: string;
}

// Poll countdown timer component
export function PollCountdown({ endsAt }: { endsAt: string }) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const endTime = new Date(endsAt).getTime();
    const updateCountdown = () => {
      const remaining = Math.max(0, endTime - Date.now());
      setTimeLeft(remaining);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (timeLeft <= 0) return <span className="text-amber-500 font-bold">⏰ Closing...</span>;

  const seconds = Math.floor(timeLeft / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return (
    <span className="text-pika-purple font-mono flex items-center gap-1.5 px-2 py-0.5 bg-pika-purple/10 rounded-md border border-pika-purple/20">
      <Clock size={12} />
      {minutes > 0 ? `${minutes}:${remainingSeconds.toString().padStart(2, "0")}` : `${seconds}s`}
    </span>
  );
}

interface Props {
  // Global State
  activePoll: ActivePoll | null;
  endedPoll: EndedPoll | null;
  activeAnnouncement: Announcement | null;

  // Modals Visibility
  showNoteModal: boolean;
  showPollModal: boolean;
  showAnnouncementModal: boolean;
  showQrModal: boolean;

  // Modal Setters (for closing)
  onCloseNoteModal: () => void;
  onClosePollModal: () => void;
  onCloseAnnouncementModal: () => void;
  onCloseQrModal: () => void;

  // Interaction Data
  noteText: string;
  setNoteText: (val: string) => void;
  onSaveNote: () => void;

  pollQuestion: string;
  setPollQuestion: (val: string) => void;
  pollOptions: string[];
  setPollOptions: (val: string[]) => void;
  onStartPoll: (question: string, options: string[], duration?: number) => void;
  onEndPoll: () => void;

  announcementText: string;
  setAnnouncementText: (val: string) => void;
  onSendAnnouncement: (message: string, duration?: number, push?: boolean) => void;
  onCancelAnnouncement: () => void;
  onClearEndedPoll: () => void;

  // Context
  currentPlay: PlayWithTrack | null;
  qrUrl: string;
  domainText: string;
}

export function LiveInteractions({
  activePoll,
  endedPoll,
  activeAnnouncement,
  showNoteModal,
  showPollModal,
  showAnnouncementModal,
  showQrModal,
  onCloseNoteModal,
  onClosePollModal,
  onCloseAnnouncementModal,
  onCloseQrModal,
  noteText,
  setNoteText,
  onSaveNote,
  pollQuestion,
  setPollQuestion,
  pollOptions,
  setPollOptions,
  onStartPoll,
  onEndPoll,
  announcementText,
  setAnnouncementText,
  onSendAnnouncement,
  onCancelAnnouncement,
  onClearEndedPoll,
  currentPlay,
  qrUrl,
  domainText,
}: Props) {
  // Local state for durations since they are only used during creation
  const [pollDuration, setPollDuration] = useState<number | null>(null);
  const [announcementDuration, setAnnouncementDuration] = useState<number | null>(null);
  const [sendPush, setSendPush] = useState(false);

  return (
    <>
      {/* Active Poll Results Display Overlay */}
      {activePoll && (
        <div className="fixed top-24 right-10 bg-slate-950/80 border border-white/5 rounded-[2rem] p-8 w-[380px] shadow-[0_40px_100px_rgba(0,0,0,0.8)] backdrop-blur-3xl z-40">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-pika-purple/20 rounded-xl flex items-center justify-center border border-pika-purple/30">
                <BarChart2 className="text-pika-purple" size={20} />
              </div>
              <span className="font-[1000] text-xl text-white tracking-tight">
                {activePoll.question}
              </span>
            </div>
          </div>

          <div className="space-y-6">
            {activePoll.options.map((option, idx) => {
              const votes = activePoll.votes[idx] ?? 0;
              const percentage =
                activePoll.totalVotes > 0 ? Math.round((votes / activePoll.totalVotes) * 100) : 0;
              return (
                <div key={idx} className="space-y-3">
                  <div className="flex justify-between text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                    <span>{option}</span>
                    <span className="text-slate-300">
                      {votes} ({percentage}%)
                    </span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <div
                      className="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all duration-700 rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex items-center justify-between">
            {activePoll.endsAt && <PollCountdown endsAt={activePoll.endsAt} />}
            <button
              type="button"
              onClick={onEndPoll}
              className="px-6 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl font-bold transition-all text-xs uppercase tracking-widest"
            >
              End Poll
            </button>
          </div>
        </div>
      )}

      {/* Ended Poll Results Display Overlay */}
      {endedPoll && (
        <div className="fixed top-24 right-10 bg-slate-900/95 border border-emerald-500/50 rounded-2xl p-6 w-[350px] shadow-[0_0_40px_rgba(16,185,129,0.2)] backdrop-blur-xl z-40">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <BarChart2 className="text-emerald-500" size={20} />
              <span className="font-bold text-lg text-white">{endedPoll.question}</span>
            </div>
            <span className="text-emerald-500 font-bold">🎉 Ended!</span>
          </div>

          <div className="space-y-3">
            {endedPoll.options.map((option, idx) => {
              const votes = endedPoll.votes[idx] ?? 0;
              const percentage =
                endedPoll.totalVotes > 0 ? Math.round((votes / endedPoll.totalVotes) * 100) : 0;
              const isWinner = option === endedPoll.winner;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-sm font-bold uppercase tracking-wider text-slate-400">
                    <span className={isWinner ? "text-emerald-400" : ""}>{option}</span>
                    <span>
                      {votes} ({percentage}%)
                    </span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${isWinner ? "bg-emerald-500" : "bg-slate-600"}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onClearEndedPoll}
            className="w-full mt-6 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-white/10 rounded-lg font-bold transition-all text-sm px-2"
          >
            Clear Poll
          </button>
        </div>
      )}

      {/* Note Modal */}
      {showNoteModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10001] backdrop-blur-sm"
          onClick={onCloseNoteModal}
        >
          <div
            className="bg-slate-900 border border-white/10 rounded-2xl p-8 w-full max-w-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-2">
              <MessageSquare className="text-pika-purple" size={24} />
              <h3 className="text-2xl font-black text-white">Private Note</h3>
            </div>
            <p className="text-slate-500 font-medium mb-6">
              Annotate "{currentPlay?.title}" for your logbook
            </p>

            <textarea
              className="w-full h-40 bg-black border border-white/10 rounded-xl p-4 text-white font-medium focus:border-pika-purple outline-none transition-all resize-none"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="e.g. Great energy, tricky transition..."
              autoFocus
            />

            <div className="flex justify-end gap-4 mt-6">
              <button
                type="button"
                onClick={onCloseNoteModal}
                className="px-6 py-3 border border-white/10 text-slate-400 rounded-xl font-bold hover:bg-white/5 transition-all text-sm px-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSaveNote}
                className="px-8 py-3 bg-pika-purple text-white rounded-xl font-bold border border-white/10 shadow-lg hover:brightness-110 active:scale-95 transition-all text-sm px-2"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQrModal && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[10001] backdrop-blur-md"
          onClick={onCloseQrModal}
        >
          <div
            className="bg-slate-900 border border-white/10 rounded-[2rem] p-12 flex flex-col items-center text-center shadow-2xl max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-3xl font-black text-white mb-2">Join the Dance! 🕺💃</h3>
            <p className="text-slate-400 font-bold tracking-tight mb-8 uppercase text-sm">
              Scan to vote & send love
            </p>

            <div className="bg-white p-6 rounded-3xl mb-8 shadow-[0_0_50px_rgba(255,255,255,0.1)]">
              <QRCodeSVG value={qrUrl} size={300} level="H" />
            </div>

            <div className="bg-black/50 border border-white/5 px-6 py-3 rounded-xl mb-8">
              <span className="font-mono text-xl text-pika-purple font-black">{domainText}</span>
            </div>

            <button
              type="button"
              onClick={onCloseQrModal}
              className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black text-lg transition-all active:scale-95 px-2"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Poll Creation Modal */}
      {showPollModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10001] backdrop-blur-sm"
          onClick={onClosePollModal}
        >
          <div
            className="bg-slate-900 border border-pika-purple/30 rounded-2xl p-8 w-full max-w-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-black text-white mb-1">📊 Create Poll</h3>
            <p className="text-slate-500 font-medium mb-6 uppercase text-xs tracking-widest">
              Ask the crowd anything or use a preset
            </p>

            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide items-center">
              <button
                type="button"
                onClick={() => {
                  setPollQuestion("");
                  setPollOptions(["", ""]);
                  setPollDuration(null);
                }}
                className="p-2 bg-slate-800 hover:bg-red-500/20 border border-white/10 hover:border-red-500 rounded-xl text-slate-400 hover:text-red-500 transition-all flex-shrink-0"
                title="Clear"
              >
                <Trash2 size={16} />
              </button>
              <div className="w-px h-6 bg-white/10 mx-1 flex-shrink-0" />
              {POLL_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setPollQuestion(preset.question);
                    setPollOptions(preset.options);
                    if (preset.duration) setPollDuration(preset.duration);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-pika-purple/20 border border-white/10 hover:border-pika-purple text-slate-300 hover:text-white rounded-xl text-xs font-bold whitespace-nowrap transition-all"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <input
              className="w-full bg-black border border-white/10 rounded-xl p-4 text-white font-bold text-xl focus:border-pika-purple outline-none transition-all mb-4"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="What's the vibe?"
              autoFocus
            />

            <div className="space-y-3 mb-6">
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="flex-1 bg-black border border-white/10 rounded-lg px-4 py-2 text-white font-medium focus:border-pika-purple outline-none transition-all"
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...pollOptions];
                      newOpts[i] = e.target.value;
                      setPollOptions(newOpts);
                    }}
                    placeholder={`Option ${i + 1}`}
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))}
                      className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 4 && (
                <button
                  type="button"
                  onClick={() => setPollOptions([...pollOptions, ""])}
                  className="text-pika-purple text-xs font-black uppercase tracking-widest hover:text-white transition-all"
                >
                  + Add Option
                </button>
              )}
            </div>

            <div className="mb-6">
              <label className="text-slate-500 text-xs font-black uppercase tracking-widest mb-3 block">
                Duration (optional)
              </label>
              <div className="flex gap-2">
                {[
                  { label: "1m", value: 60 },
                  { label: "2m", value: 120 },
                  { label: "5m", value: 300 },
                  { label: "None", value: null },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setPollDuration(opt.value)}
                    className={`flex-1 py-2 rounded-lg font-bold text-xs border transition-all ${
                      pollDuration === opt.value
                        ? "bg-pika-purple border-pika-purple text-white shadow-lg"
                        : "bg-slate-800 border-white/5 text-slate-400 hover:border-white/10"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={onClosePollModal}
                className="px-6 py-2 text-slate-400 font-bold text-sm px-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  onStartPoll(
                    pollQuestion,
                    pollOptions.filter((o) => o.trim()),
                    pollDuration ?? undefined,
                  )
                }
                disabled={!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2}
                className="px-8 py-3 bg-pika-purple text-white rounded-xl font-bold shadow-lg disabled:opacity-50 transition-all text-sm px-2"
              >
                Start Poll
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Announcement Modal */}
      {showAnnouncementModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10001] backdrop-blur-sm"
          onClick={onCloseAnnouncementModal}
        >
          <div
            className="bg-slate-900 border border-orange-500/30 rounded-2xl p-8 w-full max-w-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-black text-white mb-1">📢 Announcement</h3>
            <p className="text-slate-500 font-medium mb-6 uppercase text-xs tracking-widest">
              Broadcast to all dancers
            </p>

            <textarea
              className="w-full h-32 bg-black border border-white/10 rounded-xl p-4 text-white font-bold text-lg focus:border-orange-500 outline-none transition-all mb-2 resize-none"
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value.slice(0, 200))}
              placeholder="e.g. Next workshop starts in 5 mins!"
              autoFocus
            />

            <div className="mb-6">
              <label className="text-slate-500 text-xs font-black uppercase tracking-widest mb-3 block">
                Duration (optional)
              </label>
              <div className="flex gap-2">
                {[
                  { label: "5m", value: 300 },
                  { label: "15m", value: 900 },
                  { label: "30m", value: 1800 },
                  { label: "None", value: null },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setAnnouncementDuration(opt.value)}
                    className={`flex-1 py-2 rounded-lg font-bold text-xs border transition-all ${
                      announcementDuration === opt.value
                        ? "bg-orange-500 border-orange-500 text-white shadow-lg"
                        : "bg-slate-800 border-white/5 text-slate-400 hover:border-white/10"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between mb-8">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={sendPush}
                    onChange={(e) => setSendPush(e.target.checked)}
                  />
                  <div
                    className={`block w-12 h-6 rounded-full transition-all border ${
                      sendPush
                        ? "bg-orange-500 border-orange-400"
                        : "bg-black border-white/10 group-hover:border-white/20"
                    }`}
                  />
                  <div
                    className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${
                      sendPush ? "translate-x-6" : ""
                    }`}
                  />
                </div>
                <div className="flex flex-col">
                  <span
                    className={`text-sm font-black transition-colors ${
                      sendPush ? "text-white" : "text-slate-500"
                    }`}
                  >
                    Send Push Notification?
                  </span>
                  <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">
                    Alert mobile users (11/10 feel)
                  </span>
                </div>
              </label>

              <div className="text-right text-[10px] font-black tracking-widest text-slate-600 uppercase">
                {announcementText.length}/200
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={onCloseAnnouncementModal}
                className="px-6 py-2 text-slate-400 font-bold text-sm px-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  onSendAnnouncement(announcementText, announcementDuration ?? undefined, sendPush)
                }
                disabled={!announcementText.trim()}
                className="px-8 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl font-bold shadow-lg disabled:opacity-50 transition-all text-sm px-2"
              >
                Broadcast
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Announcement Display (Overlay) */}
      {activeAnnouncement && (
        <div className="fixed top-24 left-10 bg-orange-600 border border-white/20 rounded-[2rem] px-8 py-5 flex items-center gap-6 shadow-[0_40px_100px_rgba(234,88,12,0.4)] animate-bounce-subtle z-40 max-w-md group">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center border border-white/30 shrink-0">
            <Megaphone className="text-white" size={32} />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-[10px] font-[1000] text-orange-200 uppercase tracking-[0.3em] mb-1">
              ANNOUNCEMENT
            </span>
            <p className="text-2xl font-black text-white leading-tight break-words">
              {activeAnnouncement.message}
            </p>
          </div>
          <button
            onClick={onCancelAnnouncement}
            className="ml-2 w-10 h-10 flex items-center justify-center bg-black/10 hover:bg-black/20 text-white rounded-full transition-all border border-white/10 active:scale-90"
            title="Dismiss Announcement"
          >
            <X size={20} strokeWidth={3} />
          </button>
        </div>
      )}
    </>
  );
}
