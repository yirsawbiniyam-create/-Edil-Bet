import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  ExternalLink,
  History,
  LayoutGrid,
  RefreshCw,
  Table2,
  TrendingUp,
  X,
} from 'lucide-react';
import { ScheduledMatch } from '../lib/footballSchedule';
import { useLanguage } from '../lib/i18n';
import { fetchMatchStats, MatchStatsResponse, TeamFormItem } from '../lib/matchStats';

type StatsTab = 'h2h' | 'form' | 'standings';

interface MatchStatsModalProps {
  match: ScheduledMatch;
  onClose: () => void;
  onOpenMarkets?: () => void;
}

const FormResultBadge: React.FC<{ result: 'W' | 'D' | 'L'; size?: 'sm' | 'md' }> = ({
  result,
  size = 'md',
}) => {
  const colorClass =
    result === 'W'
      ? 'bg-[#0E8A38] text-white border-[#0B732E]'
      : result === 'D'
        ? 'bg-slate-500 text-white border-slate-600'
        : 'bg-rose-600 text-white border-rose-700';

  const dimClass = size === 'sm' ? 'w-6 h-6 text-[11px]' : 'w-7 h-7 text-xs';

  return (
    <span
      className={`${dimClass} ${colorClass} border rounded font-mono-num font-black inline-flex items-center justify-center shrink-0`}
    >
      {result}
    </span>
  );
};

const StatsTeamAvatar: React.FC<{ code: string; logo?: string; name: string }> = ({
  code,
  logo,
  name,
}) => {
  const [failed, setFailed] = useState(false);
  return (
    <span className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-mono-num font-black text-xs text-slate-900 shrink-0 overflow-hidden shadow-2xs">
      {logo && !failed ? (
        <img
          src={logo}
          alt={name}
          referrerPolicy="no-referrer"
          className="w-7 h-7 object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        code
      )}
    </span>
  );
};

export const MatchStatsModal: React.FC<MatchStatsModalProps> = ({
  match,
  onClose,
  onOpenMarkets,
}) => {
  const { bi } = useLanguage();
  const [activeTab, setActiveTab] = useState<StatsTab>('h2h');
  const [stats, setStats] = useState<MatchStatsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMatchStats(match, force);
      setStats(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : bi('የጨዋታ ስታትስቲክስን መጫን አልተቻለም።', 'Could not load match statistics.'),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStats(false);
  }, [match.id]);

  const summarizeForm = (items: TeamFormItem[]) => {
    const wins = items.filter((i) => i.result === 'W').length;
    const draws = items.filter((i) => i.result === 'D').length;
    const losses = items.filter((i) => i.result === 'L').length;
    const gf = items.reduce((s, i) => s + i.goalsFor, 0);
    const ga = items.reduce((s, i) => s + i.goalsAgainst, 0);
    return { wins, draws, losses, gf, ga };
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-stats-title"
    >
      <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl w-full max-w-3xl max-h-[94dvh] flex flex-col overflow-hidden shadow-2xl text-slate-900">
        {/* Top Green Sportsbook Bar with Prominent Back Button */}
        <div className="bg-[#0E8A38] text-white px-3 sm:px-4 py-3 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 text-white text-xs font-black flex items-center gap-1 cursor-pointer transition shrink-0"
              aria-label={bi('ተመለስ', 'Back')}
            >
              <ArrowLeft className="w-4 h-4 text-[#9AD84B]" />
              <span>{bi('ተመለስ', 'Back')}</span>
            </button>

            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#9AD84B] truncate">
                BeSoccer Stats · {match.leagueLabel}
              </p>
              <h3 id="match-stats-title" className="text-xs sm:text-sm font-black truncate">
                {match.home} vs {match.away}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenMarkets && (
              <button
                type="button"
                onClick={onOpenMarkets}
                className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[#9AD84B] hover:bg-[#a9e45d] text-slate-950 text-xs font-black flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{bi('135+ ገበያ', 'Markets')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={bi('ዝጋ', 'Close')}
              className="w-10 h-10 rounded-lg bg-black/20 hover:bg-black/30 text-white flex items-center justify-center cursor-pointer transition shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Compact Match Headliner Strip */}
        <div className="px-3 sm:px-5 py-3 bg-[#F8FAFC] border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <StatsTeamAvatar code={match.homeCode} logo={match.homeLogo} name={match.home} />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-black text-slate-900 truncate">{match.home}</p>
              <p className="text-[10px] font-bold text-[#0E8A38]">{bi('ባለሜዳ', 'HOME')}</p>
            </div>
          </div>

          <div className="px-2 text-center shrink-0">
            {match.isLive ? (
              <div className="font-mono-num">
                <p className="text-[10px] font-black text-[#0E8A38]">LIVE {match.liveMinute}&apos;</p>
                <p className="text-base font-black text-slate-900">
                  {match.liveHomeGoals ?? 0} - {match.liveAwayGoals ?? 0}
                </p>
              </div>
            ) : (
              <div className="font-mono-num">
                <p className="text-xs font-black text-slate-400">VS</p>
                <p className="text-[10px] font-bold text-slate-600">{match.kickoffLabel}</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 flex-1 min-w-0 text-right">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-black text-slate-900 truncate">{match.away}</p>
              <p className="text-[10px] font-bold text-amber-700">{bi('እንግዳ', 'AWAY')}</p>
            </div>
            <StatsTeamAvatar code={match.awayCode} logo={match.awayLogo} name={match.away} />
          </div>
        </div>

        {/* 3 Segmented Navigation Tabs (H2H | Form | Standings) */}
        <div className="px-3 sm:px-4 py-2 bg-white border-b border-slate-200 grid grid-cols-3 gap-1.5 shrink-0">
          {(
            [
              {
                id: 'h2h' as const,
                icon: History,
                label: bi('የእርስ በርስ · H2H', 'H2H History'),
              },
              {
                id: 'form' as const,
                icon: TrendingUp,
                label: bi('አቋም (W/D/L)', 'Recent Form'),
              },
              {
                id: 'standings' as const,
                icon: Table2,
                label: bi('ደረጃ ሰንጠረዥ', 'Standings'),
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[44px] px-2 py-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  active
                    ? 'bg-[#0E8A38] text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-[#9AD84B]' : 'text-[#0E8A38]'}`} />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 bg-[#F1F5F9] space-y-4">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-24 bg-white border border-slate-200 rounded-xl" />
              <div className="h-44 bg-white border border-slate-200 rounded-xl" />
              <div className="h-32 bg-white border border-slate-200 rounded-xl" />
            </div>
          ) : error || !stats ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
              <BarChart3 className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-slate-800">
                {error || bi('መረጃ ማግኘት አልተቻለም።', 'Statistics unavailable.')}
              </p>
              <button
                type="button"
                onClick={() => void loadStats(true)}
                className="min-h-[44px] px-5 py-2 rounded-lg bg-[#0E8A38] hover:bg-[#0B732E] text-white text-xs font-black inline-flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{bi('እንደገና ሞክር', 'Retry')}</span>
              </button>
            </div>
          ) : (
            <>
              {/* TAB 1: HEAD-TO-HEAD HISTORY */}
              {activeTab === 'h2h' && (
                <div className="space-y-3.5">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-extrabold text-slate-800">
                      <span>{bi('የእርስ በርስ ግንኙነት ማጠቃለያ', 'Head-to-Head Summary')}</span>
                      <span className="font-mono-num text-[#0E8A38]">
                        {stats.h2hSummary.played} {bi('ጨዋታዎች', 'matches')}
                      </span>
                    </div>

                    {/* Stacked H2H Ratio Bar */}
                    {stats.h2hSummary.played > 0 && (
                      <div className="w-full h-2.5 rounded-full overflow-hidden bg-slate-200 flex">
                        <div
                          className="h-full bg-[#0E8A38]"
                          style={{
                            width: `${Math.round(
                              (stats.h2hSummary.homeWins / stats.h2hSummary.played) * 100,
                            )}%`,
                          }}
                        />
                        <div
                          className="h-full bg-slate-400"
                          style={{
                            width: `${Math.round(
                              (stats.h2hSummary.draws / stats.h2hSummary.played) * 100,
                            )}%`,
                          }}
                        />
                        <div
                          className="h-full bg-amber-500"
                          style={{
                            width: `${Math.round(
                              (stats.h2hSummary.awayWins / stats.h2hSummary.played) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                        <p className="text-[10px] font-bold text-slate-600 truncate">
                          {match.homeCode} {bi('ድል', 'Wins')}
                        </p>
                        <p className="text-lg font-mono-num font-black text-[#0E8A38]">
                          {stats.h2hSummary.homeWins}
                        </p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <p className="text-[10px] font-bold text-slate-600">{bi('አቻ', 'Draws')}</p>
                        <p className="text-lg font-mono-num font-black text-slate-800">
                          {stats.h2hSummary.draws}
                        </p>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                        <p className="text-[10px] font-bold text-slate-600 truncate">
                          {match.awayCode} {bi('ድል', 'Wins')}
                        </p>
                        <p className="text-lg font-mono-num font-black text-amber-700">
                          {stats.h2hSummary.awayWins}
                        </p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <p className="text-[10px] font-bold text-slate-600">
                          {bi('አማካይ ጎል', 'Avg Goals')}
                        </p>
                        <p className="text-lg font-mono-num font-black text-slate-900">
                          {stats.h2hSummary.avgGoals.toFixed(1)}
                        </p>
                      </div>
                      <div className="col-span-2 sm:col-span-1 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <p className="text-[10px] font-bold text-slate-600">BTTS (GG)</p>
                        <p className="text-lg font-mono-num font-black text-[#0E8A38]">
                          {stats.h2hSummary.bttsPct}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* H2H Match Rows */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-black text-slate-800">
                      {bi('ያለፉ የእርስ በርስ ጨዋታዎች', 'Past Head-to-Head Fixtures')}
                    </div>
                    <div className="divide-y divide-slate-200">
                      {stats.h2hMatches.map((item) => (
                        <div
                          key={item.id}
                          className="px-3.5 py-3 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-[10px] font-mono-num text-slate-500">
                              {item.date} · {item.competition}
                            </p>
                            <p className="font-bold text-slate-900 truncate">
                              {item.home}{' '}
                              <span className="font-mono-num font-black text-[#0E8A38] mx-1">
                                {item.homeGoals} - {item.awayGoals}
                              </span>{' '}
                              {item.away}
                            </p>
                          </div>

                          <span
                            className={`px-2 py-1 rounded text-[10px] font-black shrink-0 ${
                              item.winner === 'home'
                                ? 'bg-emerald-100 text-[#0E8A38]'
                                : item.winner === 'away'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {item.winner === 'home'
                              ? match.homeCode
                              : item.winner === 'away'
                                ? match.awayCode
                                : bi('አቻ', 'DRAW')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: RECENT FORM (LAST 5 W/D/L FOR BOTH TEAMS) */}
              {activeTab === 'form' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {(
                    [
                      {
                        team: match.home,
                        code: match.homeCode,
                        role: bi('ባለሜዳ · HOME', 'HOME TEAM'),
                        accent: 'border-t-4 border-t-[#0E8A38]',
                        items: stats.homeForm,
                      },
                      {
                        team: match.away,
                        code: match.awayCode,
                        role: bi('እንግዳ · AWAY', 'AWAY TEAM'),
                        accent: 'border-t-4 border-t-amber-500',
                        items: stats.awayForm,
                      },
                    ] as const
                  ).map((side) => {
                    const summary = summarizeForm(side.items);
                    return (
                      <section
                        key={side.code + side.role}
                        className={`bg-white border border-slate-200 ${side.accent} rounded-xl overflow-hidden shadow-2xs`}
                      >
                        <div className="p-3.5 bg-slate-50 border-b border-slate-200 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[10px] font-black text-slate-500">{side.role}</p>
                              <h4 className="text-sm font-black text-slate-900 truncate">
                                {side.team}
                              </h4>
                            </div>
                            <span className="font-mono-num text-xs font-extrabold text-slate-700 shrink-0">
                              {summary.wins}W-{summary.draws}D-{summary.losses}L · {summary.gf}:
                              {summary.ga}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-slate-500 mr-1">
                              {bi('የቅርብ 5:', 'Last 5:')}
                            </span>
                            {side.items.map((f) => (
                              <FormResultBadge key={`chip_${f.id}`} result={f.result} size="sm" />
                            ))}
                          </div>
                        </div>

                        <div className="divide-y divide-slate-200">
                          {side.items.map((f) => (
                            <div
                              key={f.id}
                              className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono-num">
                                  <span>{f.date}</span>
                                  <span>·</span>
                                  <span className="font-bold text-slate-700">
                                    {f.isHome ? 'H' : 'A'}
                                  </span>
                                </div>
                                <p className="font-bold text-slate-900 truncate">
                                  vs {f.opponent}
                                </p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono-num font-black text-slate-900 bg-slate-100 border border-slate-200 px-2 py-1 rounded">
                                  {f.goalsFor} - {f.goalsAgainst}
                                </span>
                                <FormResultBadge result={f.result} size="sm" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}

              {/* TAB 3: LEAGUE STANDINGS TABLE */}
              {activeTab === 'standings' && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-xs">
                    <span className="font-black text-slate-900 truncate">
                      {stats.leagueLabel} · {bi('የደረጃ ሰንጠረዥ', 'Standings')}
                    </span>
                    <div className="flex items-center gap-3 text-[10px] font-bold shrink-0">
                      <span className="text-[#0E8A38]">{match.homeCode}</span>
                      <span className="text-amber-700">{match.awayCode}</span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold text-slate-600">
                          <th className="py-2.5 pl-3 pr-1.5 w-8">#</th>
                          <th className="py-2.5 px-2">{bi('ቡድን', 'Team')}</th>
                          <th className="py-2.5 px-1.5 text-center font-mono-num">MP</th>
                          <th className="py-2.5 px-1.5 text-center font-mono-num">W</th>
                          <th className="py-2.5 px-1.5 text-center font-mono-num">D</th>
                          <th className="py-2.5 px-1.5 text-center font-mono-num">L</th>
                          <th className="py-2.5 px-1.5 text-center font-mono-num">GD</th>
                          <th className="py-2.5 pl-1.5 pr-3 text-right font-mono-num">Pts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono-num">
                        {stats.standings.map((row) => {
                          const rowHighlight = row.isHomeTeam
                            ? 'bg-emerald-50 border-l-4 border-l-[#0E8A38]'
                            : row.isAwayTeam
                              ? 'bg-amber-50 border-l-4 border-l-amber-500'
                              : 'bg-white hover:bg-slate-50';
                          return (
                            <tr key={`${row.rank}_${row.team}`} className={rowHighlight}>
                              <td className="py-2.5 pl-3 pr-1.5 font-black text-slate-700">
                                {row.rank}
                              </td>
                              <td className="py-2.5 px-2 font-sans">
                                <div className="flex items-center gap-2 min-w-[120px]">
                                  {row.logo && (
                                    <img
                                      src={row.logo}
                                      alt={row.team}
                                      referrerPolicy="no-referrer"
                                      className="w-4 h-4 object-contain shrink-0"
                                    />
                                  )}
                                  <span
                                    className={`truncate max-w-[140px] sm:max-w-none ${
                                      row.isHomeTeam
                                        ? 'font-black text-[#0E8A38]'
                                        : row.isAwayTeam
                                          ? 'font-black text-amber-800'
                                          : 'font-semibold text-slate-900'
                                    }`}
                                  >
                                    {row.team}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-1.5 text-center text-slate-700">
                                {row.played}
                              </td>
                              <td className="py-2.5 px-1.5 text-center text-slate-700">
                                {row.won}
                              </td>
                              <td className="py-2.5 px-1.5 text-center text-slate-700">
                                {row.drawn}
                              </td>
                              <td className="py-2.5 px-1.5 text-center text-slate-700">
                                {row.lost}
                              </td>
                              <td
                                className={`py-2.5 px-1.5 text-center font-bold ${
                                  row.goalDiff > 0
                                    ? 'text-[#0E8A38]'
                                    : row.goalDiff < 0
                                      ? 'text-rose-600'
                                      : 'text-slate-600'
                                }`}
                              >
                                {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                              </td>
                              <td className="py-2.5 pl-1.5 pr-3 text-right font-black text-slate-900">
                                {row.points}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom Action Footer */}
        <div className="px-3 sm:px-4 py-3 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 min-w-0">
            <span className="truncate">{stats?.source || 'BeSoccer Sync'}</span>
            {stats?.besoccerUrl && (
              <a
                href={stats.besoccerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0E8A38] font-bold inline-flex items-center gap-1 hover:underline shrink-0"
              >
                <span>BeSoccer</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {onOpenMarkets && (
              <button
                type="button"
                onClick={onOpenMarkets}
                className="min-h-[42px] px-3.5 py-2 rounded-lg bg-[#0E8A38] hover:bg-[#0B732E] text-white font-black text-xs cursor-pointer transition whitespace-nowrap"
              >
                {bi('135+ ገበያ ይምረጡ', 'Open 135+ Markets')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-900 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{bi('ተመለስ', 'Back')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
