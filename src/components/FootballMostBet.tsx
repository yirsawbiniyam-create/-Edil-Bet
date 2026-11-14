import React, { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { ScheduledMatch } from '../lib/footballSchedule';
import { FootballMarketKey, FootballPopularityRecord } from '../types';

interface FootballMostBetProps {
  matches: ScheduledMatch[];
  popularity: FootballPopularityRecord[];
  selectedPicksByMatch: Record<string, FootballMarketKey>;
  disabled?: boolean;
  onQuickPick: (match: ScheduledMatch, market: FootballMarketKey) => void;
}

interface RankedMatchInsight {
  match: ScheduledMatch;
  totalBets: number;
  homeBets: number;
  drawBets: number;
  awayBets: number;
  homeProb: number;
  drawProb: number;
  awayProb: number;
  favoriteLabel: string;
  favoriteProb: number;
}

export function computeWinProbabilities(match: ScheduledMatch): {
  homeProb: number;
  drawProb: number;
  awayProb: number;
} {
  const p1 = 1 / Math.max(1.05, match.odds['1']);
  const px = 1 / Math.max(1.05, match.odds.X);
  const p2 = 1 / Math.max(1.05, match.odds['2']);
  const total = p1 + px + p2;
  const homeProb = Math.round((p1 / total) * 100);
  const drawProb = Math.round((px / total) * 100);
  const awayProb = Math.max(1, 100 - homeProb - drawProb);
  return { homeProb, drawProb, awayProb };
}

export const FootballMostBet: React.FC<FootballMostBetProps> = ({
  matches,
  popularity,
  selectedPicksByMatch,
  disabled = false,
  onQuickPick,
}) => {
  const rankedMatches = useMemo<RankedMatchInsight[]>(() => {
    const popById = new Map<string, FootballPopularityRecord>();
    for (const item of popularity) {
      popById.set(item.matchId, item);
    }

    const items: RankedMatchInsight[] = matches.map((match) => {
      const pop = popById.get(match.id);
      const { homeProb, drawProb, awayProb } = computeWinProbabilities(match);

      let favoriteLabel = match.home;
      let favoriteProb = homeProb;
      if (awayProb > favoriteProb) {
        favoriteLabel = match.away;
        favoriteProb = awayProb;
      }
      if (drawProb > favoriteProb) {
        favoriteLabel = 'አቻ (X)';
        favoriteProb = drawProb;
      }

      return {
        match,
        totalBets: pop?.totalBets || 0,
        homeBets: pop?.homeBets || 0,
        drawBets: pop?.drawBets || 0,
        awayBets: pop?.awayBets || 0,
        homeProb,
        drawProb,
        awayProb,
        favoriteLabel,
        favoriteProb,
      };
    });

    items.sort((a, b) => {
      if (b.totalBets !== a.totalBets) return b.totalBets - a.totalBets;
      const aFeatured = a.match.featured ? 1 : 0;
      const bFeatured = b.match.featured ? 1 : 0;
      if (bFeatured !== aFeatured) return bFeatured - aFeatured;
      if (a.match.isLive !== b.match.isLive) return a.match.isLive ? -1 : 1;
      return b.favoriteProb - a.favoriteProb;
    });

    return items.slice(0, 6);
  }, [matches, popularity]);

  const hasLiveBets = rankedMatches.some((item) => item.totalBets > 0);

  if (rankedMatches.length === 0) return null;

  return (
    <section aria-labelledby="most-bet-heading" className="space-y-3.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-amber-400">
            <TrendingUp className="w-5 h-5 shrink-0" />
            <h3
              id="most-bet-heading"
              className="text-base sm:text-lg font-black text-white"
              style={{ textWrap: 'balance' }}
            >
              በብዛት የተወራረዱባቸው ቡድኖች እና የድል ዕድል · Most-Bet Teams &amp; Win Probability
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {hasLiveBets
              ? 'በተጫዋቾች በብዛት የተመረጡ ጨዋታዎች ከፋየርስቶር እና የእያንዳንዱ ቡድን የድል ዕድል (%)'
              : 'ተመራጭ ጨዋታዎች እና ከኦዶች የተሰላ የእያንዳንዱ ቡድን የድል ዕድል (%) — ሲቆርጡ ብዛቱ በቀጥታ ይዘምናል'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {rankedMatches.map((item) => {
          const { match, totalBets, homeProb, drawProb, awayProb, favoriteLabel, favoriteProb } =
            item;
          const activeMarket = selectedPicksByMatch[match.id];
          const isLiveLocked = match.isLive && (match.liveMinute ?? 0) >= 86;

          return (
            <article
              key={match.id}
              className="bg-slate-900/95 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col justify-between gap-3 transition-colors"
            >
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-slate-400">
                  <span className="font-bold text-emerald-400 truncate max-w-[60%]">
                    {match.leagueLabel}
                  </span>
                  <span className="font-mono-num font-bold text-amber-400">
                    {totalBets > 0 ? `${totalBets} ውርርድ` : match.kickoffLabel}
                  </span>
                </div>

                <div>
                  <h4 className="text-sm font-black text-white truncate">
                    {match.home} vs {match.away}
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    ከፍተኛ የድል ዕድል:{' '}
                    <strong className="text-emerald-400">
                      {favoriteLabel} ({favoriteProb}%)
                    </strong>
                  </p>
                </div>

                {/* 3-Way Win Probability Bar */}
                <div className="space-y-1.5">
                  <div
                    className="w-full h-2.5 rounded-full overflow-hidden bg-slate-950 flex"
                    aria-label={`${match.home} ${homeProb}%, አቻ ${drawProb}%, ${match.away} ${awayProb}%`}
                  >
                    <div
                      className="h-full bg-emerald-500 transition-all duration-200"
                      style={{ width: `${homeProb}%` }}
                    />
                    <div
                      className="h-full bg-slate-600 transition-all duration-200"
                      style={{ width: `${drawProb}%` }}
                    />
                    <div
                      className="h-full bg-amber-500 transition-all duration-200"
                      style={{ width: `${awayProb}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono-num text-slate-300">
                    <span>
                      {match.homeCode} <strong className="text-emerald-400">{homeProb}%</strong>
                    </span>
                    <span>
                      X <strong className="text-slate-300">{drawProb}%</strong>
                    </span>
                    <span>
                      {match.awayCode} <strong className="text-amber-400">{awayProb}%</strong>
                    </span>
                  </div>

                  {totalBets > 0 && (
                    <p className="text-[11px] font-mono-num text-slate-400">
                      የተጫዋቾች ምርጫ: {match.homeCode} ({item.homeBets}) · X ({item.drawBets}) ·{' '}
                      {match.awayCode} ({item.awayBets})
                    </p>
                  )}
                </div>
              </div>

              {/* 1-Click Quick Pick Buttons */}
              <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-800/80">
                {(
                  [
                    ['1', match.homeCode, homeProb],
                    ['X', 'አቻ', drawProb],
                    ['2', match.awayCode, awayProb],
                  ] as const
                ).map(([mkt, shortName, prob]) => {
                  const isSelected = activeMarket === mkt;
                  return (
                    <button
                      key={mkt}
                      type="button"
                      disabled={disabled || isLiveLocked}
                      onClick={() => onQuickPick(match, mkt)}
                      className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex flex-col items-center transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                        isSelected
                          ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-black'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-600 text-slate-200'
                      }`}
                    >
                      <span className="truncate max-w-full">{shortName}</span>
                      <span
                        className={`font-mono-num ${
                          isSelected ? 'text-slate-950' : 'text-amber-400'
                        }`}
                      >
                        {prob}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
