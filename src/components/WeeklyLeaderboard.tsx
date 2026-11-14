import React, { useMemo } from 'react';
import { Award, Crown, Medal, Trophy } from 'lucide-react';
import { formatETB } from '../lib/gameEngine';
import { WeeklyLeaderboardEntry } from '../types';

interface WeeklyLeaderboardProps {
  entries: WeeklyLeaderboardEntry[];
  currentUid: string;
}

export const WeeklyLeaderboard: React.FC<WeeklyLeaderboardProps> = ({
  entries,
  currentUid,
}) => {
  const ranked = useMemo(
    () =>
      [...entries].sort((a, b) => {
        if (b.totalWinnings !== a.totalWinnings) return b.totalWinnings - a.totalWinnings;
        if (b.winsCount !== a.winsCount) return b.winsCount - a.winsCount;
        return b.biggestWin - a.biggestWin;
      }),
    [entries],
  );

  const top10 = ranked.slice(0, 10);
  const leaderWinnings = ranked[0]?.totalWinnings || 0;
  const totalPoolWon = useMemo(
    () => ranked.reduce((sum, item) => sum + item.totalWinnings, 0),
    [ranked],
  );

  const myIndex = ranked.findIndex((item) => item.uid === currentUid);
  const myEntry = myIndex >= 0 ? ranked[myIndex] : null;
  const gapToFirst =
    myEntry && leaderWinnings > myEntry.totalWinnings
      ? Number((leaderWinnings - myEntry.totalWinnings).toFixed(2))
      : 0;

  return (
    <section
      aria-labelledby="weekly-leaderboard-heading"
      className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Crown className="w-6 h-6" />
          </div>
          <div>
            <h2
              id="weekly-leaderboard-heading"
              className="text-lg sm:text-xl font-black text-white"
              style={{ textWrap: 'balance' }}
            >
              የሳምንቱ አሸናፊዎች ሰንጠረዥ · Weekly Leaderboard
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              በዚህ ሳምንት ከፍተኛ ጠቅላላ ድል (Total Winnings) ያስመዘገቡ ተጫዋቾች ደረጃ
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span>
            ተወዳዳሪዎች: <strong className="font-mono-num text-white">{ranked.length}</strong>
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span>
            የሳምንቱ ጠቅላላ ሽልማት:{' '}
            <strong className="font-mono-num text-emerald-400">{formatETB(totalPoolWon)}</strong>
          </span>
        </div>
      </div>

      {/* Current Player Standing Summary */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        {myEntry ? (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center font-mono-num font-black text-sm text-emerald-400 shrink-0">
                #{myIndex + 1}
              </div>
              <div>
                <p className="text-xs sm:text-sm font-extrabold text-white">
                  የእርስዎ የሳምንቱ ደረጃ: {myIndex + 1}ኛ ከ{ranked.length} ተጫዋቾች
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {myIndex === 0
                    ? 'በአሁኑ ጊዜ የሳምንቱ 1ኛ አሸናፊ ነዎት!'
                    : `1ኛ ደረጃን ለመያዝ ተጨማሪ ${formatETB(gapToFirst)} ድል ያስፈልግዎታል`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-5 text-right">
              <div>
                <span className="block text-[11px] text-slate-400">የድል ብዛት</span>
                <strong className="font-mono-num text-sm font-black text-white">
                  {myEntry.winsCount} ጊዜ
                </strong>
              </div>
              <div>
                <span className="block text-[11px] text-slate-400">ጠቅላላ ድልዎ</span>
                <strong className="font-mono-num text-base font-black text-amber-400">
                  {formatETB(myEntry.totalWinnings)}
                </strong>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 text-xs sm:text-sm text-slate-300">
            <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
            <span>
              ገና በዚህ ሳምንት ሰንጠረዥ ውስጥ አልገቡም — ዳይስ፣ ሳንቲም ወይም እግር ኳስ አሸንፈው 1ኛ ደረጃን ይያዙ!
            </span>
          </div>
        )}
      </div>

      {top10.length === 0 ? (
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
          <p className="text-sm font-bold text-white">
            የዚህ ሳምንት ውድድር ገና አዲስ ነው
          </p>
          <p className="text-xs text-slate-400">
            ከላይ ባሉት ጨዋታዎች ወይም በእግር ኳስ ቤቲንግ የመጀመሪያውን ድል በማስመዝገብ የሳምንቱን ሰንጠረዥ ይምሩ።
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Top 3 Highlight Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {top10.slice(0, 3).map((entry, idx) => {
              const isMe = entry.uid === currentUid;
              const rankNum = idx + 1;
              const pctOfLeader =
                leaderWinnings > 0
                  ? Math.max(8, Math.round((entry.totalWinnings / leaderWinnings) * 100))
                  : 100;

              return (
                <article
                  key={entry.id}
                  className={`rounded-2xl p-4 border flex flex-col justify-between gap-3 ${
                    isMe
                      ? 'bg-emerald-950/35 border-emerald-500/60'
                      : rankNum === 1
                        ? 'bg-amber-950/25 border-amber-500/45'
                        : 'bg-slate-950/85 border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                          rankNum === 1
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                            : rankNum === 2
                              ? 'bg-slate-700/40 border-slate-600 text-slate-200'
                              : 'bg-orange-500/15 border-orange-500/35 text-orange-300'
                        }`}
                      >
                        {rankNum === 1 ? (
                          <Crown className="w-4 h-4" />
                        ) : rankNum === 2 ? (
                          <Medal className="w-4 h-4" />
                        ) : (
                          <Award className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-400">
                          {rankNum}ኛ ደረጃ
                          {isMe ? ' · እርስዎ' : ''}
                        </p>
                        <p className="font-mono-num text-sm font-black text-white truncate">
                          {entry.playerMask}
                        </p>
                      </div>
                    </div>

                    <span className="font-mono-num text-xs font-bold text-slate-400 shrink-0">
                      {entry.winsCount} ድል
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] text-slate-400">ጠቅላላ ድል</span>
                      <strong className="font-mono-num text-base font-black text-emerald-400">
                        {formatETB(entry.totalWinnings)}
                      </strong>
                    </div>

                    <div
                      className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden"
                      aria-hidden="true"
                    >
                      <div
                        className={`h-full transition-all duration-200 ${
                          rankNum === 1 ? 'bg-amber-400' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${pctOfLeader}%` }}
                      />
                    </div>

                    <p className="text-[11px] text-slate-400 truncate">
                      ትልቁ ድል: <span className="font-mono-num text-slate-200">{formatETB(entry.biggestWin)}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{entry.lastGameName}</span>
                    </p>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Full Ranked Table (Ranks 1 - 10) */}
          <div className="overflow-x-auto border border-slate-800 rounded-2xl bg-slate-950/70">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400">
                  <th className="py-2.5 px-3.5">ደረጃ</th>
                  <th className="py-2.5 px-3.5">ተጫዋች</th>
                  <th className="py-2.5 px-3.5">የመጨረሻ ጨዋታ</th>
                  <th className="py-2.5 px-3.5 text-right">የድል ብዛት</th>
                  <th className="py-2.5 px-3.5 text-right">ትልቁ ድል</th>
                  <th className="py-2.5 px-3.5 text-right">ጠቅላላ ድል</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs sm:text-sm">
                {top10.map((entry, idx) => {
                  const isMe = entry.uid === currentUid;
                  const rankNum = idx + 1;
                  return (
                    <tr
                      key={entry.id}
                      className={
                        isMe
                          ? 'bg-emerald-500/10 text-white'
                          : 'hover:bg-slate-900/70 text-slate-200'
                      }
                    >
                      <td className="py-3 px-3.5 font-mono-num font-black whitespace-nowrap">
                        <span
                          className={
                            rankNum === 1
                              ? 'text-amber-400'
                              : rankNum === 2
                                ? 'text-slate-200'
                                : rankNum === 3
                                  ? 'text-orange-300'
                                  : 'text-slate-400'
                          }
                        >
                          #{rankNum}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 font-mono-num font-bold whitespace-nowrap">
                        <span>{entry.playerMask}</span>
                        {isMe && (
                          <span className="ml-1.5 text-[11px] font-sans font-extrabold text-emerald-400">
                            (እርስዎ)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-xs text-slate-400 max-w-[160px] truncate">
                        {entry.lastGameName}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono-num font-semibold text-slate-300 whitespace-nowrap">
                        {entry.winsCount}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono-num text-slate-300 whitespace-nowrap">
                        {formatETB(entry.biggestWin)}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono-num font-black text-emerald-400 whitespace-nowrap">
                        {formatETB(entry.totalWinnings)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
