import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Compass } from 'lucide-react';
import { formatETB, GameConfigValues } from '../lib/gameEngine';
import {
  CoinChoice,
  D100Direction,
  DiceSubMode,
  DoubleDiceBetMode,
  GameCategory,
  SingleDiceBetMode,
} from '../types';

export interface StrategyPreset {
  id: string;
  category: 'dice' | 'coin' | 'lucky' | 'bankroll';
  categoryLabel: string;
  riskLabel: string;
  oddsLabel: string;
  title: string;
  summary: string;
  actionLabel: string;
  game: GameCategory;
  diceSubMode?: DiceSubMode;
  singleMode?: SingleDiceBetMode;
  doubleMode?: DoubleDiceBetMode;
  doubleExact?: number;
  d100Direction?: D100Direction;
  d100Target?: number;
  coinChoice?: CoinChoice;
  luckyChoice?: number;
  recommendedBet: number;
}

type TipFilter = 'all' | 'dice' | 'coin' | 'lucky' | 'bankroll';

interface GamingTipsProps {
  activeConfig: GameConfigValues;
  walletBalance: number;
  isRolling: boolean;
  onApplyStrategy: (strategy: StrategyPreset) => void;
}

const FILTER_TABS: { id: TipFilter; label: string }[] = [
  { id: 'all', label: 'ሁሉም' },
  { id: 'bankroll', label: 'ባጀት' },
  { id: 'dice', label: 'ዳይስ' },
  { id: 'coin', label: 'ሳንቲም' },
  { id: 'lucky', label: 'የእድል ቁጥር' },
];

export const GamingTips: React.FC<GamingTipsProps> = ({
  activeConfig,
  walletBalance,
  isRolling,
  onApplyStrategy,
}) => {
  const [filter, setFilter] = useState<TipFilter>('all');
  const [appliedTipId, setAppliedTipId] = useState<string | null>(null);

  const tips = useMemo<StrategyPreset[]>(() => {
    const minBet = activeConfig.minBet;
    const maxBet = activeConfig.maxBet;
    const fivePercent = Math.floor(walletBalance * 0.05);
    const eightPercent = Math.floor(walletBalance * 0.08);
    const safeUnitBet = Math.min(maxBet, Math.max(minBet, fivePercent || minBet));
    const moderateBet = Math.min(maxBet, Math.max(minBet, eightPercent || minBet));

    return [
      {
        id: 'bankroll-5pct',
        category: 'bankroll',
        categoryLabel: 'የባጀት አያያዝ',
        riskLabel: 'ዝቅተኛ ስጋት',
        oddsLabel: formatETB(safeUnitBet),
        title: '01. የ5% የባጀት ክፍፍል ሕግ',
        summary: `ሙሉ ሂሳብዎን በአንድ ዙር አይወራረዱ። በአንድ ዙር ከጠቅላላ ሂሳብዎ 5% (${formatETB(safeUnitBet)}) ብቻ መጠቀም ቢያንስ 20 ዙር የመጫወት ዕድል ይሰጥዎታል።`,
        actionLabel: '5% መጠን ጫን',
        game: 'dice',
        diceSubMode: 'single',
        singleMode: 'low',
        recommendedBet: safeUnitBet,
      },
      {
        id: 'single-dice-range',
        category: 'dice',
        categoryLabel: 'ባለ 1 ዳይስ',
        riskLabel: 'ዝቅተኛ ስጋት',
        oddsLabel: `${activeConfig.singleDiceRangeOdds}x`,
        title: '02. ከትክክለኛ ቁጥር ይልቅ ክልል (1–3 / 4–6) ይምረጡ',
        summary: `ከ6 ቁጥሮች አንዱን ብቻ የማግኘት ዕድል 16.7% ሲሆን፣ 1–3 ወይም 4–6 መምረጥ ግን 50% የማሸነፍ ዕድል ከ${activeConfig.singleDiceRangeOdds}x ሽልማት ጋር ይሰጣል።`,
        actionLabel: '4–6 ክልል ምረጥ',
        game: 'dice',
        diceSubMode: 'single',
        singleMode: 'high',
        recommendedBet: safeUnitBet,
      },
      {
        id: 'double-dice-lucky7',
        category: 'dice',
        categoryLabel: 'ባለ 2 ዳይስ',
        riskLabel: 'መካከለኛ ስጋት',
        oddsLabel: `${activeConfig.doubleDiceLucky7Odds}x`,
        title: '03. የሁለት ዳይስ ድምር 7 ስልት',
        summary: `በሁለት ዳይስ ጨዋታ ውስጥ ድምር 7 በ6 የተለያዩ መንገዶች (16.7%) ሊመጣ ስለሚችል ከ2 ወይም 12 የበለጠ ዕድል እና ${activeConfig.doubleDiceLucky7Odds}x ክፍያ አለው።`,
        actionLabel: 'እድለኛ 7 ሞክር',
        game: 'dice',
        diceSubMode: 'double',
        doubleMode: 'lucky7',
        recommendedBet: minBet,
      },
      {
        id: 'd100-balanced',
        category: 'dice',
        categoryLabel: 'ባለ 100 ዳይስ',
        riskLabel: 'ዝቅተኛ ስጋት',
        oddsLabel: '1.9x',
        title: '04. የD100 50% ክልል ሚዛናዊ ውርርድ',
        summary: `1–50 ወይም 51–100 መምረጥ ተደጋጋሚ ድል ያስገኛል። 90–100 ያሉ ጠባብ ክልሎችን በትርፍዎ ብቻ በትንሽ መጠን (${minBet} ብር) ይሞክሩ።`,
        actionLabel: 'D100 (1–50) ጫን',
        game: 'dice',
        diceSubMode: 'd100',
        d100Direction: 'under',
        d100Target: 51,
        recommendedBet: moderateBet,
      },
      {
        id: 'coin-flat-stake',
        category: 'coin',
        categoryLabel: 'የሳንቲም ውርርድ',
        riskLabel: 'መካከለኛ ስጋት',
        oddsLabel: `${activeConfig.coinOdds}x`,
        title: '05. በተከታታይ እጥፍ አለማሳደግ (Flat Staking)',
        summary: `ከተሸነፉ በኋላ ውርርዱን በእጥፍ ማሳደግ የ${maxBet.toLocaleString()} ብር የጠረጴዛ ገደብ ላይ በፍጥነት ያደርሳል። ተመሳሳይ መጠን (${formatETB(safeUnitBet)}) መጠበቅ ሂሳብን ይጠብቃል።`,
        actionLabel: 'ሳንቲም (ዘውድ) ጫን',
        game: 'coin',
        coinChoice: 'heads',
        recommendedBet: safeUnitBet,
      },
      {
        id: 'lucky-micro-bet',
        category: 'lucky',
        categoryLabel: 'የእድል ቁጥር (1-20)',
        riskLabel: 'ከፍተኛ ስጋት',
        oddsLabel: `${activeConfig.luckyOdds}x`,
        title: '06. ከፍተኛ ሽልማትን በዝቅተኛ መጠን መሞከር',
        summary: `የ1–20 ጨዋታ ${activeConfig.luckyOdds}x ትልቅ ሽልማት ቢኖረውም ዕድሉ 5% ነው። ከሌሎች ጨዋታዎች ባገኙት ትርፍ በዝቅተኛው ${minBet} ብር ብቻ ይጫወቱት።`,
        actionLabel: `በ${minBet} ብር ሞክር`,
        game: 'lucky',
        luckyChoice: 7,
        recommendedBet: minBet,
      },
    ];
  }, [activeConfig, walletBalance]);

  const visibleTips = useMemo(
    () => (filter === 'all' ? tips : tips.filter((tip) => tip.category === filter)),
    [filter, tips],
  );

  const handleSelectTip = (tip: StrategyPreset) => {
    if (isRolling) return;
    setAppliedTipId(tip.id);
    onApplyStrategy(tip);
  };

  return (
    <section aria-labelledby="gaming-tips-heading" className="space-y-4 pt-2">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-amber-400">
            <Compass className="w-5 h-5 shrink-0" />
            <h2
              id="gaming-tips-heading"
              className="text-lg sm:text-xl font-extrabold text-white"
              style={{ textWrap: 'balance' }}
            >
              የዕድል ጥቆማዎች · Gaming Tips
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            ዕድልዎን ለማሻሻልና ሂሳብዎን በብልሃት ለማስተዳደር የተዘጋጁ ስልቶች — ማንኛውንም ስልት በአንድ ጠቅታ ወደ ጨዋታው መጫን ይችላሉ።
          </p>
        </div>

        <div
          role="tablist"
          aria-label="የጥቆማ ምድቦች"
          className="flex flex-wrap items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 self-start md:self-auto"
        >
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                filter === tab.id
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleTips.map((tip) => {
          const isApplied = appliedTipId === tip.id;
          return (
            <article
              key={tip.id}
              className={`bg-slate-900/95 border rounded-2xl p-5 flex flex-col justify-between gap-4 transition-colors ${
                isApplied
                  ? 'border-emerald-500/60'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                  <span className="font-semibold text-amber-400">{tip.categoryLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{tip.riskLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num font-bold text-emerald-400">{tip.oddsLabel}</span>
                </div>

                <h3
                  className="text-base font-extrabold text-white leading-snug"
                  style={{ textWrap: 'balance' }}
                >
                  {tip.title}
                </h3>

                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{tip.summary}</p>
              </div>

              <div className="pt-3 border-t border-slate-800/90 flex items-center justify-between gap-3">
                <span className="text-xs font-mono-num text-slate-400">
                  የሚመከር: <strong className="text-slate-200">{formatETB(tip.recommendedBet)}</strong>
                </span>
                <button
                  type="button"
                  disabled={isRolling}
                  onClick={() => handleSelectTip(tip)}
                  className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${
                    isApplied
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-100 border border-slate-700 hover:border-amber-500'
                  }`}
                >
                  <span>{isApplied ? 'ተጭኗል · እንደገና ጫን' : tip.actionLabel}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
