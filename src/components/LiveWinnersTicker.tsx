import React from 'react';
import { Trophy } from 'lucide-react';
import { formatETB } from '../lib/gameEngine';
import { useLanguage } from '../lib/i18n';
import { RecentWinnerRecord } from '../types';

interface LiveWinnersTickerProps {
  winners: RecentWinnerRecord[];
}

export const LiveWinnersTicker: React.FC<LiveWinnersTickerProps> = ({ winners }) => {
  const { bi } = useLanguage();
  const repeatedWinners = winners.length > 0 ? [...winners, ...winners] : [];

  return (
    <section
      aria-label={bi('የቀጥታ አሸናፊዎች ማሳወቂያ', 'Live winners feed')}
      className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 flex items-center gap-3 overflow-hidden shadow-xs"
    >
      <div className="flex items-center gap-1.5 shrink-0 pr-3 border-r border-slate-200">
        <Trophy className="w-4 h-4 text-[#0E8A38] shrink-0" />
        <span className="text-xs font-extrabold text-[#0E8A38] whitespace-nowrap">
          {bi('የቀጥታ አሸናፊዎች', 'Recent Winners')}
        </span>
      </div>

      {winners.length === 0 ? (
        <p className="text-xs text-slate-600 truncate">
          {bi(
            'ትኩስ የጨዋታ አሸናፊዎች እዚህ በቀጥታ ይታያሉ — አሁን ይጫወቱና የመጀመሪያው አሸናፊ ይሁኑ!',
            'Live match and game payouts appear here in real time — place your ticket to lead the board.',
          )}
        </p>
      ) : (
        <div className="flex-1 overflow-hidden">
          <div className="animate-winners-ticker items-center gap-6">
            {repeatedWinners.map((item, index) => (
              <div
                key={`${item.id}_${index}`}
                className="flex items-center gap-2 text-xs whitespace-nowrap shrink-0"
              >
                <span className="font-mono-num font-bold text-slate-800">{item.playerMask}</span>
                <span className="text-slate-400" aria-hidden="true">
                  ·
                </span>
                <span className="text-slate-600">{item.gameName}</span>
                <span className="text-slate-400" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono-num font-black text-[#0E8A38]">
                  +{formatETB(item.payout)}
                </span>
                <span className="font-mono-num text-[11px] font-bold text-amber-700">
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
