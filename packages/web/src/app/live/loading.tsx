import { Radio } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
      <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center border border-slate-800 animate-pulse">
        <Radio className="w-8 h-8 text-purple-400" />
      </div>
      <div className="text-center">
        <p className="text-purple-400 font-black uppercase tracking-widest text-[10px] animate-pulse">
          Connecting to the floor...
        </p>
      </div>
    </div>
  );
}
