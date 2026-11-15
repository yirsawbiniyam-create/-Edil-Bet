import React, { useMemo } from 'react';
import { BarChart3, TrendingUp } from 'lucide-react';
import { ScheduledMatch } from '../lib/footballSchedule';
import { useLanguage } from '../lib/i18n';
import { FootballMarketKey, FootballPopularityRecord } from '../types';

interface FootballMostBetProps {
  matches: ScheduledMatch[];
  popularity: FootballPopularityRecord[];
  selectedPicksByMatch: Record<string, FootballMarketKey>;
  disabled?: boolean;
  onQuickPick: (match: ScheduledMatch, market: FootballMarketKey) => void;
  onOpenMarkets?: (match: ScheduledMatch) => void;
  onOpenStats?: (match: ScheduledMatch) => void;
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
  onOpenMarkets,
  onOpenStats,
}) => {
  const { bi } = useLanguage();

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
        favoriteLabel = bi('አቻ (X)', 'Draw (X)');
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
  }, [matches, popularity, bi]);

  const hasLiveBets = rankedMatches.some((item) => item.totalBets > 0);

  if (rankedMatches.length === 0) return null;

  return (
    <section
      aria-labelledby="most-bet-heading"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs"
    >
      {/* Green Sportsbook Bar */}
      <div className="bg-[#0E8A38] text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#9AD84B] shrink-0" />
          <h3 id="most-bet-heading" className="text-sm font-extrabold tracking-tight">
            {bi(
              'በብዛት የተወራረዱባቸው እና የድል ዕድል (Win Probability)',
              'Most-Bet Teams & Win Probability',
            )}
          </h3>
        </div>
        <span className="text-[11px] font-medium text-emerald-100">
          {hasLiveBets
            ? bi('ቀጥታ የፋየርስቶር ብዛት', 'Live bettor volume')
            : bi('ከኦዶች የተሰላ ዕድል %', 'Odds-implied %')}
        </span>
      </div>

      <div className="p-3.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 bg-[#F8FAFC]">
        {rankedMatches.map((item) => {
          const { match, totalBets, homeProb, drawProb, awayProb, favoriteLabel, favoriteProb } =
            item;
          const activeMarket = selectedPicksByMatch[match.id];
          const isLiveLocked = match.isLive && (match.liveMinute ?? 0) >= 86;

          return (
            <article
              key={match.id}
              className="bg-white border border-slate-200 hover:border-[#0E8A38]/50 rounded-lg p-3.5 flex flex-col justify-between gap-2.5 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-1.5 text-[11px] text-slate-500">
                  <span className="font-bold text-[#0E8A38] truncate max-w-[55%]">
                    {match.leagueLabel}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono-num font-bold text-slate-700">
                      {totalBets > 0
                        ? `${totalBets} ${bi('ውርርድ', 'bets')}`
                        : match.kickoffLabel}
                    </span>
                    {onOpenStats && (
                      <button
                        type="button"
                        onClick={() => onOpenStats(match)}
                        title={bi('H2H, Form እና Standings ስታትስ', 'Match Stats (H2H · Form · Table)')}
                        className="px-1.5 py-1 rounded bg-slate-100 hover:bg-[#EAF3ED] border border-slate-200 text-[#0E8A38] text-[10px] font-black inline-flex items-center gap-1 cursor-pointer transition"
                      >
                        <BarChart3 className="w-3 h-3" />
                        <span>Stats</span>
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    disabled={disabled || isLiveLocked}
                    onClick={() => onOpenMarkets?.(match)}
                    className="w-full text-left group cursor-pointer disabled:cursor-not-allowed"
                  >
                    <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 group-hover:text-[#0E8A38] truncate transition-colors">
                      {match.home} vs {match.away}
                    </h4>
                  </button>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {bi('ከፍተኛ የድል ዕድል', 'Top Win Chance')}:{' '}
                    <strong className="text-[#0E8A38]">
                      {favoriteLabel} ({favoriteProb}%)
                    </strong>
                  </p>
                </div>

                {/* 3-Way Win Probability Bar */}
                <div className="space-y-1">
                  <div
                    className="w-full h-2 rounded-full overflow-hidden bg-slate-200 flex"
                    aria-label={`${match.home} ${homeProb}%, Draw ${drawProb}%, ${match.away} ${awayProb}%`}
                  >
                    <div
                      className="h-full bg-[#0E8A38] transition-all duration-200"
                      style={{ width: `${homeProb}%` }}
                    />
                    <div
                      className="h-full bg-slate-400 transition-all duration-200"
                      style={{ width: `${drawProb}%` }}
                    />
                    <div
                      className="h-full bg-amber-500 transition-all duration-200"
                      style={{ width: `${awayProb}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono-num text-slate-600">
                    <span>
                      {match.homeCode} <strong className="text-[#0E8A38]">{homeProb}%</strong>
                    </span>
                    <span>
                      X <strong className="text-slate-700">{drawProb}%</strong>
                    </span>
                    <span>
                      {match.awayCode} <strong className="text-amber-700">{awayProb}%</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* 1-Click Quick Pick Buttons */}
              <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-100">
                {(
                  [
                    ['1', match.homeCode, homeProb],
                    ['X', bi('አቻ', 'Draw'), drawProb],
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
                      className={`py-1.5 px-2 min-h-[40px] rounded-md text-[11px] font-bold flex flex-col items-center justify-center transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                        isSelected
                          ? 'bg-[#0E8A38] text-white font-extrabold'
                          : 'bg-[#E5E7EB] hover:bg-slate-300 text-slate-900'
                      }`}
                    >
                      <span className="truncate max-w-full">{shortName}</span>
                      <span
                        className={`font-mono-num ${
                          isSelected ? 'text-[#9AD84B]' : 'text-[#0E8A38]'
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
