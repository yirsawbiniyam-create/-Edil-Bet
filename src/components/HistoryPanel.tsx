import React, { useMemo, useState } from 'react';
import { BarChart3, History, TrendingDown, TrendingUp } from 'lucide-react';
import { formatETB } from '../lib/gameEngine';
import { BetRecord } from '../types';

interface HistoryPanelProps {
  bets: BetRecord[];
}

type ChartMode = 'trend' | 'byGame';

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
  key: string;
  label: string;
  count: number;
  wins: number;
  wagered: number;
  wonAmount: number;
  lostAmount: number;
}

function getGameGroup(gameType: BetRecord['gameType']): { key: string; label: string } {
  if (gameType === 'football') return { key: 'football', label: 'እግር ኳስ ቤቲንግ' };
  if (gameType === 'coin') return { key: 'coin', label: 'የሳንቲም ውርርድ' };
  if (gameType === 'lucky') return { key: 'lucky', label: 'የእድል ቁጥር (1-20)' };
  return { key: 'dice', label: 'የዳይስ ጨዋታ' };
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ bets }) => {
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all');
  const [chartMode, setChartMode] = useState<ChartMode>('trend');
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);

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
        existing.lostAmount += b.betAmount;
      }
      map.set(grp.key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.wagered - a.wagered);
  }, [bets]);

  const filtered = useMemo(
    () =>
      bets.filter((b) => {
        if (filter === 'wins') return b.won;
        if (filter === 'losses') return !b.won;
        return true;
      }),
    [bets, filter],
  );

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

  return (
    <div className="space-y-6">
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

      {/* Detailed Bet History Table */}
      <section className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-amber-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white">የጨዋታ ታሪክ (Firestore)</h2>
              <p className="text-xs text-slate-400">
                ሁሉም የተጫወቷቸው ጨዋታዎች በፋየርስቶር ላይ የተመዘገቡ ናቸው
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
            {(
              [
                ['all', 'ሁሉም'],
                ['wins', 'ያሸነፍኩት'],
                ['losses', 'ያልተሳኩ'],
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
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            በዚህ ምድብ ውስጥ የተመዘገበ የጨዋታ ታሪክ የለም።
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs font-bold text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-3">የጨዋታ አይነት</th>
                  <th className="py-3 px-3">የተመደበ</th>
                  <th className="py-3 px-3">ውጤት</th>
                  <th className="py-3 px-3 text-right">ክፍያ / ትርፍ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs sm:text-sm">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-3 font-bold text-slate-200 whitespace-nowrap">
                      {item.gameName}
                    </td>
                    <td className="py-3 px-3 font-mono-num text-slate-300 whitespace-nowrap">
                      {formatETB(item.betAmount)}
                    </td>
                    <td className="py-3 px-3 text-slate-400">{item.resultText}</td>
                    <td
                      className={`py-3 px-3 text-right font-mono-num font-extrabold whitespace-nowrap ${
                        item.won ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {item.won ? `+${formatETB(item.payout)}` : `-${formatETB(item.betAmount)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
