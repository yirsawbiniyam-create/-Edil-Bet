import React from 'react';
import { Trophy } from 'lucide-react';
import { formatETB } from '../lib/gameEngine';
import { RecentWinnerRecord } from '../types';

interface LiveWinnersTickerProps {
  winners: RecentWinnerRecord[];
}

export const LiveWinnersTicker: React.FC<LiveWinnersTickerProps> = ({ winners }) => {
  const repeatedWinners = winners.length > 0 ? [...winners, ...winners] : [];

  return (
    <section
      aria-label="የቀጥታ አሸናፊዎች ማሳወቂያ"
      className="bg-slate-900/90 border border-slate-800 rounded-2xl px-4 py-2.5 flex items-center gap-3 overflow-hidden"
    >
      <div className="flex items-center gap-2 shrink-0 pr-3 border-r border-slate-800">
        <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-xs font-extrabold text-amber-400 whitespace-nowrap">
          የቀጥታ አሸናፊዎች
        </span>
      </div>

      {winners.length === 0 ? (
        <p className="text-xs text-slate-400 truncate">
          ትኩስ የጨዋታ አሸናፊዎች እዚህ በቀጥታ ይታያሉ — አሁን ይጫወቱና የመጀመሪያው አሸናፊ ይሁኑ!
        </p>
      ) : (
        <div className="flex-1 overflow-hidden">
          <div className="animate-winners-ticker items-center gap-6">
            {repeatedWinners.map((item, index) => (
              <div
                key={`${item.id}_${index}`}
                className="flex items-center gap-2 text-xs whitespace-nowrap shrink-0"
              >
                <span className="font-mono-num font-bold text-slate-200">{item.playerMask}</span>
                <span className="text-slate-500" aria-hidden="true">
                  ·
                </span>
                <span className="text-slate-400">{item.gameName}</span>
                <span className="text-slate-500" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono-num font-black text-emerald-400">
                  +{formatETB(item.payout)}
                </span>
                <span className="font-mono-num text-[11px] font-bold text-amber-400">
                  ({item.multiplier}x)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
