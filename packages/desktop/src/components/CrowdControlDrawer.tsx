import { BarChart2, Clock, Megaphone, Users, X } from "lucide-react";
import { type ActivePoll } from "./LivePerformanceMode";
import { type EndedPoll } from "./LiveInteractions";

interface Props {
  show: boolean;
  onClose: () => void;
  activeAnnouncement: { message: string; endsAt?: string } | null;
  activePoll: ActivePoll | null;
  endedPoll: EndedPoll | null;
  onNewAnnouncement: () => void;
  onCancelAnnouncement: () => void;
  onNewPoll: () => void;
  onEndPoll: () => void;
  onClearEndedPoll: () => void;
  renderCountdown: (endsAt: string) => React.ReactNode;
}

export function CrowdControlDrawer({
  show,
  onClose,
  activeAnnouncement,
  activePoll,
  endedPoll,
  onNewAnnouncement,
  onCancelAnnouncement,
  onNewPoll,
  onEndPoll,
  onClearEndedPoll,
  renderCountdown,
}: Props) {
  if (!show) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[50]" onClick={onClose} />

      {/* Drawer Panel */}
      <div className="fixed top-0 right-0 h-full w-[400px] bg-slate-900 border-l border-white/10 shadow-2xl z-[51] flex flex-col transition-transform duration-300 transform translate-x-0">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <h3 className="text-xl font-black text-white flex items-center gap-2">
            <Users size={20} className="text-pika-purple" />
            Crowd Control
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-xl text-slate-400 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Announcement Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Megaphone size={14} />
                Announcement
              </h4>
            </div>

            {activeAnnouncement ? (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4 space-y-4">
                <p className="text-white font-bold italic">"{activeAnnouncement.message}"</p>
                {activeAnnouncement.endsAt && (
                  <div className="flex items-center gap-2 text-orange-400 font-mono text-sm">
                    <Clock size={14} />
                    {renderCountdown(activeAnnouncement.endsAt)}
                  </div>
                )}
                <button
                  type="button"
                  onClick={onCancelAnnouncement}
                  className="w-full py-2 bg-orange-500 text-white rounded-lg font-bold text-sm shadow-lg hover:brightness-110 px-2"
                >
                  Cancel Announcement
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onNewAnnouncement}
                className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-bold border border-white/5 flex flex-col items-center gap-2 transition-all px-2"
              >
                <Megaphone size={24} className="opacity-50" />
                <span>New Announcement</span>
              </button>
            )}
          </div>

          {/* Poll Section */}
          <div className="space-y-4">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <BarChart2 size={14} />
              Live Poll
            </h4>

            {activePoll ? (
              <div className="bg-pika-purple/10 border border-pika-purple/30 rounded-2xl p-4 space-y-4">
                <p className="text-white font-bold italic">"{activePoll.question}"</p>
                <div className="flex items-center justify-between text-pika-purple font-bold text-xs uppercase">
                  <span className="flex items-center gap-1.5">
                    <Users size={12} />
                    {activePoll.totalVotes} votes
                  </span>
                  {activePoll.endsAt && (
                    <span className="flex items-center gap-1.5">
                      <Clock size={12} />
                      {renderCountdown(activePoll.endsAt)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onEndPoll}
                  className="w-full py-2 bg-pika-purple text-white rounded-lg font-bold text-sm shadow-lg hover:brightness-110 px-2"
                >
                  End Poll
                </button>
              </div>
            ) : endedPoll ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-500 font-black text-[10px] uppercase tracking-widest">
                    Recent Result
                  </span>
                  <span className="text-emerald-500">🏆</span>
                </div>
                <p className="text-white font-black italic">"{endedPoll.question}"</p>
                <div className="space-y-2">
                  {endedPoll.options.map((opt, i) => {
                    const isWinner = opt === endedPoll.winner;
                    return (
                      <div
                        key={i}
                        className={`flex justify-between text-xs font-bold ${isWinner ? "text-emerald-400" : "text-slate-500"}`}
                      >
                        <span>
                          {isWinner && "🏆 "}
                          {opt}
                        </span>
                        <span>{endedPoll.votes[i]}</span>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={onClearEndedPoll}
                  className="w-full py-2 bg-slate-800 text-slate-400 rounded-lg font-bold text-xs hover:text-white transition-all px-2"
                >
                  Dismiss Results
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onNewPoll}
                className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-bold border border-white/5 flex flex-col items-center gap-2 transition-all px-2"
              >
                <BarChart2 size={24} className="opacity-50" />
                <span>Start New Poll</span>
              </button>
            )}
          </div>
        </div>

        <div className="p-6 bg-slate-950/50 border-t border-white/5 text-center">
          <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em]">
            Pika! Crowd Control v0.1
          </p>
        </div>
      </div>
    </>
  );
}
