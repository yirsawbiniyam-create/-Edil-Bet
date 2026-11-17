import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock,
  Filter,
  Flame,
  Gamepad2,
  History,
  Radio,
  Scale,
  Ticket,
  TrendingDown,
  TrendingUp,
  Trophy,
  XCircle,
} from 'lucide-react';
import { formatETB } from '../lib/gameEngine';
import { useLanguage } from '../lib/i18n';
import { BetRecord, DepositRecord, FootballTicket, WithdrawalRecord } from '../types';

interface HistoryPanelProps {
  bets: BetRecord[];
  tickets?: FootballTicket[];
  deposits?: DepositRecord[];
  withdrawals?: WithdrawalRecord[];
}

type ActivityFilter = 'all' | 'deposits' | 'withdrawals' | 'bets';

type ChartMode = 'trend' | 'byGame';
type GameGroupKey = 'all' | 'football' | 'chicken' | 'dice' | 'coin' | 'lucky';

interface SettledOutcome {
  id: string;
  groupKey: Exclude<GameGroupKey, 'all'>;
  won: boolean;
  betAmount: number;
  payout: number;
  timestampMs: number;
}

interface TrendPoint {
  index: number;
  label: string;
  netChange: number;
  cumulative: number;
  won: boolean;
  betAmount: number;
  payout: number;
}

interface GameBreakdownItem {
  key: Exclude<GameGroupKey, 'all'>;
  label: string;
  count: number;
  wins: number;
  losses: number;
  wagered: number;
  wonAmount: number;
  lostAmount: number;
}

function getGameGroup(gameType: BetRecord['gameType']): {
  key: Exclude<GameGroupKey, 'all'>;
  label: string;
} {
  if (gameType === 'football') return { key: 'football', label: 'እግር ኳስ ቤቲንግ' };
  if (gameType === 'chicken') return { key: 'chicken', label: 'ዶሮ ዝላይ (Chicken Jump)' };
  if (gameType === 'coin') return { key: 'coin', label: 'የሳንቲም ውርርድ' };
  if (gameType === 'lucky') return { key: 'lucky', label: 'የእድል ቁጥር (1-20)' };
  return { key: 'dice', label: 'የዳይስ ጨዋታ' };
}

function formatWinLossRatio(wins: number, losses: number): string {
  if (wins === 0 && losses === 0) return '0.00';
  if (losses === 0) return '∞';
  return (wins / losses).toFixed(2);
}

function formatActivityTimestamp(ms: number): string {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

interface UnifiedHistoryItem {
  id: string;
  category: Exclude<ActivityFilter, 'all'>;
  title: string;
  reference: string;
  amount: number;
  statusLabel: string;
  statusTone: 'emerald' | 'amber' | 'rose' | 'sky';
  detailText: string;
  netText: string;
  netTone: 'emerald' | 'amber' | 'rose' | 'sky';
  timestampMs: number;
  won?: boolean;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  bets,
  tickets = [],
  deposits = [],
  withdrawals = [],
}) => {
  const { bi } = useLanguage();
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all');
  const [ticketFilter, setTicketFilter] = useState<'all' | 'live' | 'settled'>('all');
  const [ratioGameFilter, setRatioGameFilter] = useState<GameGroupKey>('all');
  const [chartMode, setChartMode] = useState<ChartMode>('trend');
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);

  const sortedTickets = useMemo(() => {
    const list = [...tickets].sort((a, b) => {
      if (a.status === 'live' && b.status !== 'live') return -1;
      if (b.status === 'live' && a.status !== 'live') return 1;
      return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
    });
    if (ticketFilter === 'live') return list.filter((t) => t.status === 'live');
    if (ticketFilter === 'settled') return list.filter((t) => t.status !== 'live');
    return list;
  }, [tickets, ticketFilter]);

  const liveTicketsCount = useMemo(
    () => tickets.filter((t) => t.status === 'live').length,
    [tickets],
  );

  // Deduplicated settled outcomes across bets and any settled football tickets not already in bets
  const settledOutcomes = useMemo<SettledOutcome[]>(() => {
    const seenIds = new Set<string>();
    const combined: SettledOutcome[] = [];

    for (const b of bets) {
      seenIds.add(b.id);
      const grp = getGameGroup(b.gameType);
      combined.push({
        id: b.id,
        groupKey: grp.key,
        won: Boolean(b.won),
        betAmount: b.betAmount,
        payout: b.payout,
        timestampMs: b.createdAt?.toMillis?.() || 0,
      });
    }

    for (const t of tickets) {
      if (t.status === 'live' || seenIds.has(t.id)) continue;
      seenIds.add(t.id);
      const isWin = t.status === 'won' || (t.status === 'cashed_out' && t.payout > 0);
      combined.push({
        id: t.id,
        groupKey: 'football',
        won: isWin,
        betAmount: t.betAmount,
        payout: t.payout,
        timestampMs: t.updatedAt?.toMillis?.() || t.createdAt?.toMillis?.() || 0,
      });
    }

    return combined.sort((a, b) => a.timestampMs - b.timestampMs);
  }, [bets, tickets]);

  const winLossSummary = useMemo(() => {
    const scoped =
      ratioGameFilter === 'all'
        ? settledOutcomes
        : settledOutcomes.filter((o) => o.groupKey === ratioGameFilter);

    let wins = 0;
    let losses = 0;
    let wagered = 0;
    let totalPayout = 0;
    let bestWinStreak = 0;
    let runningWinStreak = 0;

    for (const item of scoped) {
      wagered += item.betAmount;
      if (item.won) {
        wins += 1;
        totalPayout += item.payout;
        runningWinStreak += 1;
        if (runningWinStreak > bestWinStreak) {
          bestWinStreak = runningWinStreak;
        }
      } else {
        losses += 1;
        runningWinStreak = 0;
      }
    }

    let currentStreakType: 'win' | 'loss' | 'none' = 'none';
    let currentStreakCount = 0;
    if (scoped.length > 0) {
      const lastWon = scoped[scoped.length - 1].won;
      currentStreakType = lastWon ? 'win' : 'loss';
      for (let i = scoped.length - 1; i >= 0; i -= 1) {
        if (scoped[i].won === lastWon) {
          currentStreakCount += 1;
        } else {
          break;
        }
      }
    }

    const total = wins + losses;
    const winRateExact = total > 0 ? (wins / total) * 100 : 0;
    const lossRateExact = total > 0 ? (losses / total) * 100 : 0;
    const ratioNumeric = losses > 0 ? wins / losses : wins > 0 ? wins : 0;
    const ratioDisplay = formatWinLossRatio(wins, losses);
    const netProfit = totalPayout - wagered;

    return {
      total,
      wins,
      losses,
      winRateExact,
      lossRateExact,
      ratioNumeric,
      ratioDisplay,
      bestWinStreak,
      currentStreakType,
      currentStreakCount,
      netProfit,
    };
  }, [settledOutcomes, ratioGameFilter]);

  const perGameRatioRows = useMemo(() => {
    const groups: Array<{ key: Exclude<GameGroupKey, 'all'>; labelAm: string; labelEn: string }> = [
      { key: 'chicken', labelAm: 'ዶሮ ዝላይ (Chicken Jump)', labelEn: 'Chicken Jump' },
      { key: 'football', labelAm: 'እግር ኳስ ቤቲንግ', labelEn: 'Football Betting' },
      { key: 'dice', labelAm: 'የዳይስ ጨዋታ', labelEn: 'Dice Games' },
      { key: 'coin', labelAm: 'የሳንቲም ውርርድ', labelEn: 'Coin Toss' },
      { key: 'lucky', labelAm: 'የእድል ቁጥር (1-20)', labelEn: 'Lucky Number (1-20)' },
    ];

    return groups.map((grp) => {
      const items = settledOutcomes.filter((o) => o.groupKey === grp.key);
      const wins = items.filter((o) => o.won).length;
      const losses = items.length - wins;
      const total = items.length;
      const winPct = total > 0 ? (wins / total) * 100 : 0;
      const ratioStr = formatWinLossRatio(wins, losses);

      return {
        key: grp.key,
        label: bi(grp.labelAm, grp.labelEn),
        total,
        wins,
        losses,
        winPct,
        ratioStr,
      };
    });
  }, [settledOutcomes, bi]);

  const stats = useMemo(() => {
    let totalWagered = 0;
    let totalWonPayout = 0;
    let totalLostStake = 0;
    let winCount = 0;
    let lossCount = 0;

    for (const b of bets) {
      totalWagered += b.betAmount;
      if (b.won) {
        winCount += 1;
        totalWonPayout += b.payout;
      } else {
        lossCount += 1;
        totalLostStake += b.betAmount;
      }
    }

    const totalRounds = bets.length;
    const winRate = totalRounds > 0 ? Math.round((winCount / totalRounds) * 100) : 0;
    const netProfit = totalWonPayout - totalWagered;

    return {
      totalWagered,
      totalWonPayout,
      totalLostStake,
      winCount,
      lossCount,
      totalRounds,
      winRate,
      netProfit,
    };
  }, [bets]);

  // Chronological trend (oldest -> newest across up to 30 most recent bets)
  const trendPoints = useMemo<TrendPoint[]>(() => {
    if (bets.length === 0) return [];
    const chronological = [...bets]
      .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0))
      .slice(-30);

    let running = 0;
    return chronological.map((b, idx) => {
      const netChange = b.won ? b.payout - b.betAmount : -b.betAmount;
      running = Number((running + netChange).toFixed(2));
      return {
        index: idx + 1,
        label: b.gameName,
        netChange,
        cumulative: running,
        won: b.won,
        betAmount: b.betAmount,
        payout: b.payout,
      };
    });
  }, [bets]);

  const gameBreakdown = useMemo<GameBreakdownItem[]>(() => {
    const map = new Map<string, GameBreakdownItem>();
    for (const b of bets) {
      const grp = getGameGroup(b.gameType);
      const existing = map.get(grp.key) || {
        key: grp.key,
        label: grp.label,
        count: 0,
        wins: 0,
        losses: 0,
        wagered: 0,
        wonAmount: 0,
        lostAmount: 0,
      };
      existing.count += 1;
      existing.wagered += b.betAmount;
      if (b.won) {
        existing.wins += 1;
        existing.wonAmount += b.payout;
      } else {
        existing.losses += 1;
        existing.lostAmount += b.betAmount;
      }
      map.set(grp.key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.wagered - a.wagered);
  }, [bets]);

  const unifiedActivities = useMemo<UnifiedHistoryItem[]>(() => {
    const items: UnifiedHistoryItem[] = [];

    for (const d of deposits) {
      const ts = d.createdAt?.toMillis?.() || d.updatedAt?.toMillis?.() || 0;
      const statusLabel =
        d.status === 'verified'
          ? bi('ተረጋግጧል · Verified', 'Verified')
          : d.status === 'pending'
          ? bi('በመጠባበቅ ላይ · Pending', 'Pending')
          : bi('ውድቅ ተደርጓል · Rejected', 'Rejected');
      const statusTone: UnifiedHistoryItem['statusTone'] =
        d.status === 'verified' ? 'emerald' : d.status === 'pending' ? 'amber' : 'rose';

      items.push({
        id: `deposit:${d.id}`,
        category: 'deposits',
        title: bi('የቴሌብር ዲፖሲት', 'Telebirr Deposit'),
        reference: d.txId ? `TX: ${d.txId}` : d.playerPhone,
        amount: d.amount,
        statusLabel,
        statusTone,
        detailText: d.verifiedMessage || `${bi('ከስልክ', 'From')}: ${d.playerPhone}`,
        netText:
          d.status === 'rejected'
            ? formatETB(d.amount)
            : `+${formatETB(d.amount)}`,
        netTone: d.status === 'verified' ? 'emerald' : d.status === 'pending' ? 'amber' : 'rose',
        timestampMs: ts,
      });
    }

    for (const w of withdrawals) {
      const ts = w.createdAt?.toMillis?.() || w.updatedAt?.toMillis?.() || 0;
      const isCompleted = w.status === 'paid' || w.status === 'completed';
      const statusLabel = isCompleted
        ? bi('ተከፍሏል · Paid', 'Paid')
        : w.status === 'pending'
        ? bi('በመጠባበቅ ላይ · Pending', 'Pending')
        : bi('ውድቅ ተደርጓል · Rejected', 'Rejected');
      const statusTone: UnifiedHistoryItem['statusTone'] = isCompleted
        ? 'sky'
        : w.status === 'pending'
        ? 'amber'
        : 'rose';

      items.push({
        id: `withdrawal:${w.id}`,
        category: 'withdrawals',
        title: bi('የቴሌብር ዊዝድሮው', 'Telebirr Withdrawal'),
        reference: w.playerPhone ? `${bi('ወደ', 'To')}: ${w.playerPhone}` : `#${w.id.slice(0, 8)}`,
        amount: w.amount,
        statusLabel,
        statusTone,
        detailText:
          w.systemVerifiedText ||
          (w.status === 'pending'
            ? bi('የአድሚን ማረጋገጫ በመጠባበቅ ላይ', 'Awaiting admin approval')
            : `${bi('ወደ ቁጥር', 'To phone')}: ${w.playerPhone}`),
        netText:
          w.status === 'rejected'
            ? formatETB(w.amount)
            : `-${formatETB(w.amount)}`,
        netTone: isCompleted ? 'sky' : w.status === 'pending' ? 'amber' : 'rose',
        timestampMs: ts,
      });
    }

    for (const b of bets) {
      const ts = b.createdAt?.toMillis?.() || 0;
      items.push({
        id: `bet:${b.id}`,
        category: 'bets',
        title: b.gameName,
        reference: b.choiceText || `${b.multiplier.toFixed(2)}x`,
        amount: b.betAmount,
        statusLabel: b.won ? bi('አሸንፏል · Won', 'Won') : bi('ተሸንፏል · Lost', 'Lost'),
        statusTone: b.won ? 'emerald' : 'rose',
        detailText: b.resultText,
        netText: b.won ? `+${formatETB(b.payout)}` : `-${formatETB(b.betAmount)}`,
        netTone: b.won ? 'emerald' : 'rose',
        timestampMs: ts,
        won: b.won,
      });
    }

    return items.sort((a, b) => b.timestampMs - a.timestampMs);
  }, [deposits, withdrawals, bets, bi]);

  const filteredActivities = useMemo(() => {
    return unifiedActivities.filter((item) => {
      if (activityFilter !== 'all' && item.category !== activityFilter) {
        return false;
      }
      if (activityFilter === 'bets') {
        if (filter === 'wins') return Boolean(item.won);
        if (filter === 'losses') return !item.won;
      }
      return true;
    });
  }, [unifiedActivities, activityFilter, filter]);

  // SVG Chart Geometry for Trend Line
  const chartGeometry = useMemo(() => {
    const width = 560;
    const height = 190;
    const padX = 20;
    const padY = 20;
    const plotW = width - padX * 2;
    const plotH = height - padY * 2;

    if (trendPoints.length === 0) {
      return { width, height, padX, padY, coords: [], zeroY: height / 2, pathD: '', areaD: '' };
    }

    const values = [0, ...trendPoints.map((p) => p.cumulative)];
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const span = Math.max(10, maxVal - minVal);

    const toY = (val: number) => padY + ((maxVal - val) / span) * plotH;
    const zeroY = toY(0);

    const coords = trendPoints.map((pt, i) => {
      const x =
        trendPoints.length === 1
          ? padX + plotW / 2
          : padX + (i / (trendPoints.length - 1)) * plotW;
      const y = toY(pt.cumulative);
      return { x, y, pt };
    });

    const pathD = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');

    const areaD =
      coords.length > 0
        ? `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${zeroY.toFixed(1)} L ${coords[0].x.toFixed(1)} ${zeroY.toFixed(1)} Z`
        : '';

    return { width, height, padX, padY, coords, zeroY, pathD, areaD };
  }, [trendPoints]);

  const activePoint =
    hoveredPointIdx !== null && chartGeometry.coords[hoveredPointIdx]
      ? chartGeometry.coords[hoveredPointIdx].pt
      : trendPoints[trendPoints.length - 1] || null;

  const maxComparisonBar = Math.max(
    1,
    stats.totalWagered,
    stats.totalWonPayout,
    stats.totalLostStake,
  );

  // Donut Ring Math
  const donutRadius = 42;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const winStrokeLen =
    stats.totalRounds > 0 ? (stats.winCount / stats.totalRounds) * donutCircumference : 0;

  const ratioEdgeText =
    winLossSummary.total === 0
      ? bi('ገና ውጤት የለም', 'No settled games yet')
      : winLossSummary.losses === 0 && winLossSummary.wins > 0
      ? bi('100% ድል · ምንም ኪሳራ የለም', 'Undefeated · Zero losses')
      : winLossSummary.wins > winLossSummary.losses
      ? bi('የአሸናፊነት መጠንዎ ይበልጣል', 'Positive win edge')
      : winLossSummary.wins === winLossSummary.losses
      ? bi('አሸናፊ እና ተሸናፊ እኩል ናቸው', 'Even 1:1 split')
      : bi('ተሸናፊነት በዝቷል — በጥንቃቄ ይጫወቱ', 'Below 1.00 — play cautiously');

  return (
    <div className="space-y-6">
      {/* Player Win / Loss Ratio Section */}
      <section
        aria-labelledby="win-loss-ratio-heading"
        className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-8 space-y-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-amber-400 shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="win-loss-ratio-heading"
                className="text-lg sm:text-xl font-extrabold text-white tracking-tight"
              >
                {bi(
                  'የአሸናፊነት እና ተሸናፊነት መጠን (Win/Loss Ratio)',
                  'Player Win / Loss Ratio',
                )}
              </h2>
              <p className="text-xs text-slate-400">
                {bi(
                  'በጨዋታዎት ያሸነፉበት እና የተሸነፉበት ሬሾ፣ መቶኛ እና ተከታታይ ውጤት',
                  'Your settled wins vs losses ratio, win percentage, and streak across games',
                )}
              </p>
            </div>
          </div>

          {/* Interactive Game Category Filter */}
          <div
            role="tablist"
            aria-label={bi('ጨዋታ ይምረጡ', 'Filter by game')}
            className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 overflow-x-auto"
          >
            {(
              [
                ['all', bi('ሁሉም', 'All')],
                ['chicken', bi('ዶሮ ዝላይ', 'Chicken')],
                ['football', bi('እግር ኳስ', 'Football')],
                ['dice', bi('ዳይስ', 'Dice')],
                ['coin', bi('ሳንቲም', 'Coin')],
                ['lucky', bi('እድል ቁጥር', 'Lucky')],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={ratioGameFilter === key}
                onClick={() => setRatioGameFilter(key)}
                className={`px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  ratioGameFilter === key
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {winLossSummary.total === 0 ? (
          <div className="border border-slate-800 rounded-2xl py-8 px-4 text-center space-y-2 bg-slate-950/50">
            <p className="text-sm font-bold text-slate-200">
              {bi(
                'በዚህ ምድብ ውስጥ የተጠናቀቀ ጨዋታ ገና የለም',
                'No settled rounds in this category yet',
              )}
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {bi(
                'ቢያንስ አንድ ጨዋታ ወይም የእግር ኳስ ትኬት ሲጠናቀቅ የአሸናፊነት እና ተሸናፊነት ሬሾዎ እዚህ በቀጥታ ይሰላል።',
                'Complete at least one game round or settled football ticket to see your live Win/Loss ratio and breakdown.',
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Hairline-divided 4-Metric Win/Loss Ratio Summary Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-800 rounded-2xl bg-slate-950/60 divide-y lg:divide-y-0 lg:divide-x divide-slate-800 overflow-hidden">
              <div className="p-4 sm:p-5 space-y-1">
                <span className="text-xs font-semibold text-slate-400">
                  {bi('የድል / ኪሳራ ሬሾ (W/L Ratio)', 'Win / Loss Ratio')}
                </span>
                <div className="flex items-baseline gap-2.5">
                  <span
                    className={`font-mono-num tabular-nums text-2xl sm:text-3xl font-black ${
                      winLossSummary.wins >= winLossSummary.losses
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {winLossSummary.ratioDisplay}
                  </span>
                  <span className="font-mono-num tabular-nums text-xs font-bold text-slate-400">
                    ({winLossSummary.wins}W : {winLossSummary.losses}L)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">{ratioEdgeText}</p>
              </div>

              <div className="p-4 sm:p-5 space-y-1">
                <span className="text-xs font-semibold text-slate-400">
                  {bi('የአሸናፊነት መጠን (Win Rate)', 'Win Rate')}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono-num tabular-nums text-2xl sm:text-3xl font-black text-emerald-400">
                    {winLossSummary.winRateExact.toFixed(1)}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono-num tabular-nums">
                  {winLossSummary.wins} {bi('ድል ከ', 'wins of')} {winLossSummary.total}{' '}
                  {bi('ጨዋታ', 'games')}
                </p>
              </div>

              <div className="p-4 sm:p-5 space-y-1">
                <span className="text-xs font-semibold text-slate-400">
                  {bi('የተሸናፊነት መጠን (Loss Rate)', 'Loss Rate')}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono-num tabular-nums text-2xl sm:text-3xl font-black text-rose-400">
                    {winLossSummary.lossRateExact.toFixed(1)}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono-num tabular-nums">
                  {winLossSummary.losses} {bi('ኪሳራ ከ', 'losses of')} {winLossSummary.total}{' '}
                  {bi('ጨዋታ', 'games')}
                </p>
              </div>

              <div className="p-4 sm:p-5 space-y-1">
                <span className="text-xs font-semibold text-slate-400">
                  {bi('ተከታታይ ውጤት (Streak)', 'Streak')}
                </span>
                <div className="flex items-center gap-2">
                  {winLossSummary.currentStreakType === 'win' ? (
                    <Flame className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-rose-400 shrink-0" />
                  )}
                  <span
                    className={`font-mono-num tabular-nums text-2xl sm:text-3xl font-black ${
                      winLossSummary.currentStreakType === 'win'
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {winLossSummary.currentStreakCount}
                    {winLossSummary.currentStreakType === 'win' ? 'W' : 'L'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono-num tabular-nums flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>
                    {bi('ምርጥ ተከታታይ ድል:', 'Best win streak:')} {winLossSummary.bestWinStreak}W
                  </span>
                </p>
              </div>
            </div>

            {/* Proportional Win vs Loss Split Bar */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-mono-num tabular-nums">
                    {bi('ያሸነፉት:', 'Wins:')} {winLossSummary.wins} (
                    {winLossSummary.winRateExact.toFixed(1)}%)
                  </span>
                </div>
                <span className="text-[11px] font-mono-num tabular-nums text-slate-400">
                  50% {bi('መካከለኛ መስመር', 'Midpoint')}
                </span>
                <div className="flex items-center gap-2 font-bold text-rose-400">
                  <span className="font-mono-num tabular-nums">
                    {bi('የተሸነፉት:', 'Losses:')} {winLossSummary.losses} (
                    {winLossSummary.lossRateExact.toFixed(1)}%)
                  </span>
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                </div>
              </div>

              <div
                role="img"
                aria-label={bi(
                  `አሸናፊ ${winLossSummary.winRateExact.toFixed(1)}%፣ ተሸናፊ ${winLossSummary.lossRateExact.toFixed(1)}%`,
                  `Wins ${winLossSummary.winRateExact.toFixed(1)}%, Losses ${winLossSummary.lossRateExact.toFixed(1)}%`,
                )}
                className="relative h-3.5 w-full rounded-full overflow-hidden bg-rose-500/80 border border-slate-800 flex"
              >
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${winLossSummary.winRateExact}%` }}
                />
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-950/90"
                />
              </div>
            </div>

            {/* Per-Game Win/Loss Ratio Breakdown Table */}
            <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
                <h3 className="text-xs sm:text-sm font-extrabold text-white">
                  {bi('የአሸናፊነት / ተሸናፊነት መጠን በየጨዋታው', 'Win / Loss Ratio by Game')}
                </h3>
                <span className="text-[11px] text-slate-400 font-mono-num tabular-nums">
                  {settledOutcomes.length} {bi('ጠቅላላ የተጠናቀቁ', 'total settled')}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[11px] font-bold text-slate-400 border-b border-slate-800">
                      <th className="py-2.5 px-4">{bi('የጨዋታ አይነት', 'Game')}</th>
                      <th className="py-2.5 px-3 text-right">{bi('ጠቅላላ', 'Played')}</th>
                      <th className="py-2.5 px-3 text-right">{bi('ድል', 'Wins')}</th>
                      <th className="py-2.5 px-3 text-right">{bi('ኪሳራ', 'Losses')}</th>
                      <th className="py-2.5 px-3 text-right">{bi('W/L ሬሾ', 'W/L Ratio')}</th>
                      <th className="py-2.5 px-4 text-right min-w-[140px]">
                        {bi('የድል መጠን %', 'Win %')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-xs">
                    {perGameRatioRows.map((row) => {
                      const isSelected = ratioGameFilter === row.key;
                      return (
                        <tr
                          key={row.key}
                          onClick={() =>
                            setRatioGameFilter(isSelected ? 'all' : row.key)
                          }
                          className={`cursor-pointer transition ${
                            isSelected
                              ? 'bg-amber-500/10'
                              : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-3 px-4 font-bold text-slate-200 whitespace-nowrap">
                            {row.label}
                          </td>
                          <td className="py-3 px-3 text-right font-mono-num tabular-nums text-slate-300">
                            {row.total}
                          </td>
                          <td className="py-3 px-3 text-right font-mono-num tabular-nums font-bold text-emerald-400">
                            {row.wins}
                          </td>
                          <td className="py-3 px-3 text-right font-mono-num tabular-nums font-bold text-rose-400">
                            {row.losses}
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-mono-num tabular-nums font-extrabold ${
                              row.total === 0
                                ? 'text-slate-500'
                                : row.wins >= row.losses
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {row.ratioStr}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-2.5">
                              <div className="w-20 h-2 rounded-full bg-slate-800 overflow-hidden shrink-0">
                                {row.total > 0 && (
                                  <div
                                    className={`h-full rounded-full ${
                                      row.winPct >= 50 ? 'bg-emerald-500' : 'bg-rose-500'
                                    }`}
                                    style={{ width: `${row.winPct}%` }}
                                  />
                                )}
                              </div>
                              <span className="font-mono-num tabular-nums font-bold text-slate-200 w-11 text-right">
                                {row.total > 0 ? `${row.winPct.toFixed(0)}%` : '—'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Football Tickets & Live Progress Section */}
      <section className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-extrabold text-white">
                  የእግር ኳስ ትኬቶች እና ቀጥታ ሂደት (Football Tickets)
                </h2>
                {liveTicketsCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold font-mono-num">
                    <Radio className="w-3.5 h-3.5 animate-pulse" />
                    <span>{liveTicketsCount} ተጀምረዋል · LIVE</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                የተጀመሩ ጨዋታዎችን የደቂቃ ሂደት (0&apos;-90&apos;) እና የትኬት ሁኔታ በቀጥታ ይከታተሉ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
            {(
              [
                ['all', `ሁሉም (${tickets.length})`],
                ['live', `ተጀምረዋል (${liveTicketsCount})`],
                ['settled', `የተጠናቀቁ (${Math.max(0, tickets.length - liveTicketsCount)})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTicketFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  ticketFilter === key
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {sortedTickets.length === 0 ? (
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl py-8 px-4 text-center text-sm text-slate-400">
            {tickets.length === 0
              ? 'እስካሁን የቆመሩት የእግር ኳስ ትኬት የለም። በእግር ኳስ ቤቲንግ ትር ውስጥ ትኬት ሲያስገቡ የጨዋታ ሂደቱ እዚህ ይታያል።'
              : 'በዚህ ምድብ ውስጥ ትኬት የለም።'}
          </div>
        ) : (
          <div className="space-y-4">
            {sortedTickets.map((ticket) => {
              const rawMinute = Math.max(0, Math.min(90, Math.round(ticket.currentMinute || 0)));
              const isLive = ticket.status === 'live';
              const isCashedOut = ticket.status === 'cashed_out';
              const isWon = ticket.status === 'won';
              const hasStarted = isLive || isCashedOut || isWon || ticket.status === 'lost' || rawMinute > 0;
              const progressPct =
                isWon || ticket.status === 'lost'
                  ? 100
                  : Math.min(100, Math.max(hasStarted ? 4 : 0, Math.round((rawMinute / 90) * 100)));

              const hitCount = ticket.picks.filter((p) => p.hit).length;
              const halfLabel =
                rawMinute === 0 && isLive
                  ? 'ጨዋታው ተጀምሯል (0\')'
                  : rawMinute < 45 && isLive
                  ? `1ኛ አጋማሽ · ${rawMinute}'`
                  : rawMinute === 45 && isLive
                  ? 'እረፍት (HT 45\')'
                  : rawMinute < 90 && isLive
                  ? `2ኛ አጋማሽ · ${rawMinute}'`
                  : isCashedOut
                  ? `Cashout @ ${rawMinute}'`
                  : 'ተጠናቋል (90\' FT)';

              const barFillClass = isLive
                ? 'bg-gradient-to-r from-emerald-500 to-lime-400'
                : isCashedOut
                ? 'bg-amber-400'
                : isWon
                ? 'bg-emerald-500'
                : 'bg-rose-500';

              const statusBadge = isLive ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold">
                  <Radio className="w-3.5 h-3.5 animate-pulse shrink-0" />
                  <span>ተጀምሯል · LIVE {rawMinute}&apos;</span>
                </span>
              ) : isCashedOut ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-extrabold">
                  <Banknote className="w-3.5 h-3.5 shrink-0" />
                  <span>Cashout @{rawMinute}&apos;</span>
                </span>
              ) : isWon ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>አሸንፏል · Won 90&apos; FT</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-extrabold">
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>ተሸንፏል · Lost 90&apos; FT</span>
                </span>
              );

              return (
                <article
                  key={ticket.id}
                  className={`rounded-2xl border p-4 sm:p-5 space-y-4 transition ${
                    isLive
                      ? 'bg-slate-950/90 border-emerald-500/35'
                      : 'bg-slate-950/70 border-slate-800'
                  }`}
                >
                  {/* Ticket Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      {statusBadge}
                      <span className="text-xs font-mono-num text-slate-400">
                        #{ticket.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="text-xs text-slate-400 font-mono-num">
                        · {ticket.picksCount} ጨዋታ ({hitCount}/{ticket.picks.length} ተሳክቷል)
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <div>
                        <span className="text-slate-400">መደብ: </span>
                        <strong className="font-mono-num text-white">{formatETB(ticket.betAmount)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">ኦድ: </span>
                        <strong className="font-mono-num text-amber-400">{ticket.totalOdds.toFixed(2)}x</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">
                          {isLive ? 'ሊያገኙት የሚችሉት: ' : 'ክፍያ: '}
                        </span>
                        <strong
                          className={`font-mono-num ${
                            isWon || isCashedOut
                              ? 'text-emerald-400'
                              : isLive
                              ? 'text-amber-300'
                              : 'text-rose-400'
                          }`}
                        >
                          {isLive
                            ? formatETB(ticket.potentialPayout)
                            : isWon || isCashedOut
                            ? `+${formatETB(ticket.payout)}`
                            : `-${formatETB(ticket.betAmount)}`}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Match Visual Progress Bar (0' -> HT 45' -> 90' FT) */}
                  <div className="bg-slate-900/90 border border-slate-800/90 rounded-xl p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-bold text-slate-200">
                        <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{halfLabel}</span>
                      </span>
                      <div className="flex items-center gap-3 font-mono-num">
                        {isLive && ticket.cashoutEligible && ticket.cashoutOffer > 0 && (
                          <span className="text-amber-300 font-bold">
                            Cashout Offer: {formatETB(ticket.cashoutOffer)}
                          </span>
                        )}
                        <span className="font-extrabold text-white">
                          {isWon || ticket.status === 'lost' ? '90\' / 90\'' : `${rawMinute}' / 90'`} ({progressPct}%)
                        </span>
                      </div>
                    </div>

                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={90}
                      aria-valuenow={isWon || ticket.status === 'lost' ? 90 : rawMinute}
                      aria-label={`የጨዋታ ሂደት ${rawMinute} ከ 90 ደቂቃ`}
                      className="relative h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800"
                    >
                      {/* Halftime 50% marker */}
                      <span
                        aria-hidden="true"
                        className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-700 z-10"
                      />
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barFillClass} ${
                          isLive ? 'animate-pulse' : ''
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono-num font-bold text-slate-500">
                      <span>0&apos; Kick-off</span>
                      <span>45&apos; HT</span>
                      <span>90&apos; FT</span>
                    </div>
                  </div>

                  {/* Ticket Picks Breakdown */}
                  <div className="grid sm:grid-cols-2 gap-2">
                    {ticket.picks.map((pick, idx) => (
                      <div
                        key={`${ticket.id}-${pick.matchId}-${idx}`}
                        className="flex items-center justify-between gap-2 bg-slate-900/70 border border-slate-800/80 rounded-xl px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-bold text-slate-100 truncate">
                            {pick.hit ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : isLive ? (
                              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            )}
                            <span className="truncate">
                              {pick.home} vs {pick.away}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 pl-5 truncate">
                            {pick.marketLabel || pick.market} ·{' '}
                            <span className="font-mono-num text-amber-300 font-bold">
                              @{pick.odd.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 text-right font-mono-num">
                          <span
                            className={`inline-block px-2 py-0.5 rounded bg-slate-950 border text-[11px] font-black ${
                              pick.hit
                                ? 'border-emerald-500/40 text-emerald-300'
                                : isLive
                                ? 'border-slate-700 text-slate-200'
                                : 'border-rose-500/40 text-rose-300'
                            }`}
                          >
                            {pick.homeCode} {pick.homeGoals}-{pick.awayGoals} {pick.awayCode}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Performance Analytics & Charts Section */}
      <section className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white">
                የጨዋታ አፈፃፀም እና መረጃ ግራፍ
              </h2>
              <p className="text-xs text-slate-400">
                ጠቅላላ የተጫወቱት፣ ያሸነፉት እና የተሸነፉት ብር በግራፍ (በፋየርስቶር መረጃ መሰረት)
              </p>
            </div>
          </div>
        </div>

        {/* 4-Column KPI Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
            <span className="text-xs font-semibold text-slate-400">ጠቅላላ የተጫወቱት</span>
            <p className="font-mono-num text-lg sm:text-xl font-black text-amber-400 mt-1">
              {formatETB(stats.totalWagered)}
            </p>
            <span className="text-xs text-slate-500 font-mono-num">
              {stats.totalRounds} ዙሮች
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
            <span className="text-xs font-semibold text-slate-400">ጠቅላላ ያሸነፉት</span>
            <p className="font-mono-num text-lg sm:text-xl font-black text-emerald-400 mt-1">
              +{formatETB(stats.totalWonPayout)}
            </p>
            <span className="text-xs text-slate-500 font-mono-num">
              {stats.winCount} ድል ({stats.winRate}%)
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
            <span className="text-xs font-semibold text-slate-400">ጠቅላላ የተሸነፉት</span>
            <p className="font-mono-num text-lg sm:text-xl font-black text-rose-400 mt-1">
              -{formatETB(stats.totalLostStake)}
            </p>
            <span className="text-xs text-slate-500 font-mono-num">
              {stats.lossCount} ያልተሳኩ
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
            <span className="text-xs font-semibold text-slate-400">የተጣራ ውጤት (Net)</span>
            <p
              className={`font-mono-num text-lg sm:text-xl font-black mt-1 flex items-center gap-1.5 ${
                stats.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {stats.netProfit >= 0 ? (
                <TrendingUp className="w-4 h-4 shrink-0" />
              ) : (
                <TrendingDown className="w-4 h-4 shrink-0" />
              )}
              <span>
                {stats.netProfit >= 0 ? '+' : '-'}
                {formatETB(Math.abs(stats.netProfit))}
              </span>
            </p>
            <span className="text-xs text-slate-500">ያሸነፉት ሲቀነስ የተጫወቱት</span>
          </div>
        </div>

        {bets.length === 0 ? (
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl py-10 px-4 text-center text-sm text-slate-400">
            ግራፎችን እና የአፈፃፀም ትንታኔን ለማየት መጀመሪያ ጨዋታ ወይም የእግር ኳስ ቤቲንግ ይጫወቱ።
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 gap-5 items-stretch">
            {/* Chart 1: Financial Volume Comparison & Win/Loss Ratio Donut */}
            <div className="lg:col-span-5 bg-slate-950/70 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <h3 className="text-sm font-extrabold text-white">
                  የገንዘብ ንፅፅር እና የድል መጠን
                </h3>

                {/* Volume Comparison Bars */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-semibold">የተጫወቱት (Wagered)</span>
                      <span className="font-mono-num font-bold text-amber-400">
                        {formatETB(stats.totalWagered)}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.max(4, Math.round((stats.totalWagered / maxComparisonBar) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-semibold">ያሸነፉት (Won)</span>
                      <span className="font-mono-num font-bold text-emerald-400">
                        {formatETB(stats.totalWonPayout)}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{
                          width: `${stats.totalWonPayout > 0 ? Math.max(4, Math.round((stats.totalWonPayout / maxComparisonBar) * 100)) : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-semibold">የተሸነፉት (Lost)</span>
                      <span className="font-mono-num font-bold text-rose-400">
                        {formatETB(stats.totalLostStake)}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-500 rounded-full transition-all duration-300"
                        style={{
                          width: `${stats.totalLostStake > 0 ? Math.max(4, Math.round((stats.totalLostStake / maxComparisonBar) * 100)) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Win / Loss Donut Chart */}
              <div className="pt-4 border-t border-slate-800/80 flex items-center gap-5">
                <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle
                      cx="50"
                      cy="50"
                      r={donutRadius}
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="12"
                      strokeOpacity="0.8"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r={donutRadius}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="12"
                      strokeDasharray={`${winStrokeLen} ${donutCircumference}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-mono-num text-lg font-black text-white">
                      {stats.winRate}%
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">የድል መጠን</span>
                  </div>
                </div>

                <div className="space-y-2 text-xs flex-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-300 font-semibold">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                      <span>ያሸነፉት ዙሮች</span>
                    </span>
                    <span className="font-mono-num font-bold text-emerald-400">
                      {stats.winCount} ({stats.winRate}%)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-300 font-semibold">
                      <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
                      <span>ያልተሳኩ ዙሮች</span>
                    </span>
                    <span className="font-mono-num font-bold text-rose-400">
                      {stats.lossCount} ({100 - stats.winRate}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 pt-1">
                    ጠቅላላ {stats.totalRounds} የተመዘገቡ ጨዋታዎች
                  </p>
                </div>
              </div>
            </div>

            {/* Chart 2: Cumulative Net Performance Trend OR Breakdown by Game Type */}
            <div className="lg:col-span-7 bg-slate-950/70 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    {chartMode === 'trend'
                      ? 'የትርፍ እና ኪሳራ ጉዞ (Cumulative Net Trend)'
                      : 'አፈፃፀም በየጨዋታው አይነት (By Game)'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {chartMode === 'trend'
                      ? `ባለፉት ${trendPoints.length} ዙሮች ያለዎት አጠቃላይ የሂሳብ ለውጥ`
                      : 'በእያንዳንዱ ጨዋታ የተጫወቱት እና ያሸነፉት ብር'}
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setChartMode('trend')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                      chartMode === 'trend'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    የዙር ግራፍ
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMode('byGame')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                      chartMode === 'byGame'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    በጨዋታ አይነት
                  </button>
                </div>
              </div>

              {chartMode === 'trend' ? (
                <div className="space-y-3">
                  {/* Interactive Hover Summary */}
                  {activePoint && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2">
                      <span className="font-bold text-slate-200">
                        ዙር #{activePoint.index} · {activePoint.label}
                      </span>
                      <div className="flex items-center gap-3 font-mono-num">
                        <span className={activePoint.won ? 'text-emerald-400' : 'text-rose-400'}>
                          {activePoint.netChange >= 0 ? '+' : '-'}
                          {formatETB(Math.abs(activePoint.netChange))}
                        </span>
                        <span className="text-slate-500">|</span>
                        <span className="text-slate-300">
                          ድምር:{' '}
                          <strong
                            className={
                              activePoint.cumulative >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }
                          >
                            {activePoint.cumulative >= 0 ? '+' : '-'}
                            {formatETB(Math.abs(activePoint.cumulative))}
                          </strong>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* SVG Cumulative Line Chart */}
                  <div className="w-full overflow-hidden">
                    <svg
                      viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
                      className="w-full h-48 overflow-visible"
                    >
                      <defs>
                        <linearGradient id="netTrendFill" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor={stats.netProfit >= 0 ? '#10b981' : '#f43f5e'}
                            stopOpacity="0.28"
                          />
                          <stop
                            offset="100%"
                            stopColor={stats.netProfit >= 0 ? '#10b981' : '#f43f5e'}
                            stopOpacity="0.02"
                          />
                        </linearGradient>
                      </defs>

                      {/* Zero Baseline */}
                      <line
                        x1={chartGeometry.padX}
                        y1={chartGeometry.zeroY}
                        x2={chartGeometry.width - chartGeometry.padX}
                        y2={chartGeometry.zeroY}
                        stroke="#475569"
                        strokeDasharray="4 4"
                        strokeWidth="1"
                      />
                      <text
                        x={chartGeometry.padX}
                        y={chartGeometry.zeroY - 5}
                        fill="#94a3b8"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        0 ብር
                      </text>

                      {/* Area Fill & Line */}
                      {chartGeometry.areaD && (
                        <path d={chartGeometry.areaD} fill="url(#netTrendFill)" />
                      )}
                      {chartGeometry.pathD && (
                        <path
                          d={chartGeometry.pathD}
                          fill="none"
                          stroke={stats.netProfit >= 0 ? '#10b981' : '#f43f5e'}
                          strokeWidth="2.5"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      )}

                      {/* Interactive Round Points */}
                      {chartGeometry.coords.map((c, idx) => {
                        const isActive =
                          hoveredPointIdx === idx ||
                          (hoveredPointIdx === null && idx === chartGeometry.coords.length - 1);
                        return (
                          <g
                            key={c.pt.index}
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredPointIdx(idx)}
                            onMouseLeave={() => setHoveredPointIdx(null)}
                            onClick={() => setHoveredPointIdx(idx)}
                          >
                            <circle cx={c.x} cy={c.y} r="10" fill="transparent" />
                            <circle
                              cx={c.x}
                              cy={c.y}
                              r={isActive ? 5 : 3.2}
                              fill={c.pt.won ? '#10b981' : '#f43f5e'}
                              stroke="#0f172a"
                              strokeWidth="1.5"
                            />
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5 py-1">
                  {gameBreakdown.map((item) => {
                    const maxRow = Math.max(1, item.wagered, item.wonAmount);
                    const wagerPct = Math.max(4, Math.round((item.wagered / maxRow) * 100));
                    const wonPct =
                      item.wonAmount > 0
                        ? Math.max(4, Math.round((item.wonAmount / maxRow) * 100))
                        : 0;
                    const rowWinRate =
                      item.count > 0 ? Math.round((item.wins / item.count) * 100) : 0;

                    return (
                      <div key={item.key} className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-slate-200">
                            {item.label} ·{' '}
                            <span className="text-slate-400 font-normal font-mono-num">
                              {item.count} ዙር ({rowWinRate}% ድል)
                            </span>
                          </span>
                          <span className="font-mono-num text-[11px] text-slate-300">
                            የተጫወቱት: <strong className="text-amber-400">{formatETB(item.wagered)}</strong>{' '}
                            / ያሸነፉት:{' '}
                            <strong className="text-emerald-400">{formatETB(item.wonAmount)}</strong>
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-500/85 rounded-full"
                              style={{ width: `${wagerPct}%` }}
                            />
                          </div>
                          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${wonPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Detailed Transaction & Bet History Table */}
      <section className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-amber-400 shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white">
                {bi('የግብይት እና የውርርድ ታሪክ (History)', 'Transaction & Bet History')}
              </h2>
              <p className="text-xs text-slate-400">
                {bi(
                  'ዲፖሲቶች፣ ዊዝድሮዎች እና ሁሉም ውርርዶች በአንድ ቦታ — በምድብ መለየት ይችላሉ',
                  'Browse deposits, withdrawals, and bets from Firestore using the filter dropdown',
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Primary Filter Dropdown: All / Deposits / Withdrawals / Bets */}
            <div className="relative">
              <label htmlFor="history-type-filter" className="sr-only">
                {bi('የታሪክ አይነት ይምረጡ', 'Filter history by type')}
              </label>
              <Filter className="w-3.5 h-3.5 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                id="history-type-filter"
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)}
                className="appearance-none bg-slate-950 border border-slate-700 hover:border-amber-500/70 focus:border-amber-400 focus:outline-none text-white text-xs sm:text-sm font-bold rounded-xl pl-9 pr-9 py-2 min-h-[38px] cursor-pointer transition"
              >
                <option value="all">
                  {bi('ሁሉም', 'All')} ({unifiedActivities.length})
                </option>
                <option value="deposits">
                  {bi('ዲፖሲቶች', 'Deposits')} ({deposits.length})
                </option>
                <option value="withdrawals">
                  {bi('ዊዝድሮዎች', 'Withdrawals')} ({withdrawals.length})
                </option>
                <option value="bets">
                  {bi('ውርርዶች', 'Bets')} ({bets.length})
                </option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Secondary Win/Loss toggle when viewing Bets */}
            {activityFilter === 'bets' && (
              <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
                {(
                  [
                    ['all', bi('ሁሉም', 'All')],
                    ['wins', bi('ያሸነፍኩት', 'Wins')],
                    ['losses', bi('ያልተሳኩ', 'Losses')],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                      filter === key
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {filteredActivities.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            {activityFilter === 'deposits'
              ? bi('እስካሁን የተመዘገበ የዲፖሲት ታሪክ የለም።', 'No deposits found in your history yet.')
              : activityFilter === 'withdrawals'
              ? bi('እስካሁን የተመዘገበ የዊዝድሮው ታሪክ የለም።', 'No withdrawals found in your history yet.')
              : activityFilter === 'bets'
              ? bi('በዚህ ምድብ ውስጥ የተመዘገበ የውርርድ ታሪክ የለም።', 'No bets found matching this filter.')
              : bi('እስካሁን የተመዘገበ የግብይት ወይም የውርርድ ታሪክ የለም።', 'No transactions or bets recorded yet.')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs font-bold text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-3">{bi('አይነት', 'Type')}</th>
                  <th className="py-3 px-3">{bi('ዝርዝር / ጨዋታ', 'Description')}</th>
                  <th className="py-3 px-3">{bi('መጠን', 'Amount')}</th>
                  <th className="py-3 px-3">{bi('ሁኔታ / ውጤት', 'Status / Result')}</th>
                  <th className="py-3 px-3 text-right">{bi('የሂሳብ ለውጥ', 'Net / Payout')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs sm:text-sm">
                {filteredActivities.map((item) => {
                  const categoryBadge =
                    item.category === 'deposits' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold whitespace-nowrap">
                        <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" />
                        <span>{bi('ዲፖሲት', 'Deposit')}</span>
                      </span>
                    ) : item.category === 'withdrawals' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-bold whitespace-nowrap">
                        <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                        <span>{bi('ዊዝድሮው', 'Withdrawal')}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold whitespace-nowrap">
                        <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{bi('ውርርድ', 'Bet')}</span>
                      </span>
                    );

                  const statusClass =
                    item.statusTone === 'emerald'
                      ? 'text-emerald-400'
                      : item.statusTone === 'amber'
                      ? 'text-amber-300'
                      : item.statusTone === 'sky'
                      ? 'text-sky-300'
                      : 'text-rose-400';

                  const netClass =
                    item.netTone === 'emerald'
                      ? 'text-emerald-400'
                      : item.netTone === 'amber'
                      ? 'text-amber-300'
                      : item.netTone === 'sky'
                      ? 'text-sky-300'
                      : 'text-rose-400';

                  return (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        <div className="space-y-1">
                          {categoryBadge}
                          <div className="text-[11px] font-mono-num text-slate-500">
                            {formatActivityTimestamp(item.timestampMs)}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 align-top">
                        <div className="font-bold text-slate-100 whitespace-nowrap">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono-num mt-0.5 truncate max-w-[220px]">
                          {item.reference}
                        </div>
                      </td>
                      <td className="py-3 px-3 align-top font-mono-num text-slate-200 whitespace-nowrap font-semibold">
                        {formatETB(item.amount)}
                      </td>
                      <td className="py-3 px-3 align-top">
                        <div className={`text-xs font-bold ${statusClass}`}>
                          {item.statusLabel}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 max-w-[280px]">
                          {item.detailText}
                        </div>
                      </td>
                      <td
                        className={`py-3 px-3 align-top text-right font-mono-num font-extrabold whitespace-nowrap ${netClass}`}
                      >
                        {item.netText}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
