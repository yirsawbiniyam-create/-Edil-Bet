import React, { useMemo, useState } from 'react';
import { HelpCircle, Search, X } from 'lucide-react';
import {
  buildMarketGroups,
  getMarketLabel,
  MARKET_CATEGORIES,
  MarketCategoryId,
} from '../lib/footballMarkets';
import { ScheduledMatch } from '../lib/footballSchedule';
import { FootballMarketKey } from '../types';

interface MatchMarketsModalProps {
  match: ScheduledMatch;
  selectedMarket?: FootballMarketKey;
  getScaledOdd: (baseOdd: number) => number;
  disabled?: boolean;
  onSelectMarket: (match: ScheduledMatch, market: FootballMarketKey) => void;
  onClose: () => void;
}

export const MatchMarketsModal: React.FC<MatchMarketsModalProps> = ({
  match,
  selectedMarket,
  getScaledOdd,
  disabled = false,
  onSelectMarket,
  onClose,
}) => {
  const [activeCategory, setActiveCategory] = useState<MarketCategoryId>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const allGroups = useMemo(
    () => buildMarketGroups(match.home, match.away, match.homeCode, match.awayCode),
    [match.home, match.away, match.homeCode, match.awayCode],
  );

  const totalOptionsCount = useMemo(
    () => allGroups.reduce((sum, g) => sum + g.options.length, 0),
    [allGroups],
  );

  const visibleGroups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allGroups
      .filter((g) => activeCategory === 'all' || g.category === activeCategory)
      .map((g) => {
        if (!q) return g;
        const titleMatches =
          g.title.toLowerCase().includes(q) || g.howToBet.toLowerCase().includes(q);
        if (titleMatches) return g;
        const matchingOpts = g.options.filter((opt) => opt.label.toLowerCase().includes(q));
        return { ...g, options: matchingOpts };
      })
      .filter((g) => g.options.length > 0);
  }, [allGroups, activeCategory, searchTerm]);

  const isLiveLocked = match.isLive && (match.liveMinute ?? 0) >= 86;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-markets-title"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-start justify-between gap-3 bg-slate-950/60">
          <div className="min-w-0">
            <p className="text-xs font-bold text-emerald-400">
              {match.tierLabel} · {match.leagueLabel} ·{' '}
              <span className="font-mono-num text-amber-400">{match.kickoffLabel}</span>
            </p>
            <h3
              id="match-markets-title"
              className="text-lg sm:text-xl font-black text-white mt-0.5 truncate"
            >
              {match.home} vs {match.away}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              ሁሉም የአቆማመር ገበያዎች ({totalOptionsCount}+ ምርጫዎች) — አንድ ምርጫ ሲነኩ በቀጥታ ወደ ትኬትዎ ይገባል
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="ዝጋ"
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center shrink-0 cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Tabs & Search */}
        <div className="p-4 border-b border-slate-800 space-y-3 bg-slate-900/95">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {MARKET_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition ${
                  activeCategory === cat.id
                    ? 'bg-emerald-500 text-slate-950 font-black'
                    : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-600'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ገበያ ይፈልጉ (ለምሳሌ: Over 2.5, Multigoals, 1st Half, Cards, Corners, Handicap, Clean Sheet...)"
              className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-white outline-none"
            />
          </div>
        </div>

        {/* Scrollable Markets List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {isLiveLocked && (
            <div className="bg-rose-500/15 border border-rose-500/40 rounded-xl p-3 text-xs font-bold text-rose-200">
              ይህ ጨዋታ ከ 85&apos; ስላለፈ በቤቲንግ ህግ መሰረት ላይቭ ውርርዱ ተዘግቷል።
            </div>
          )}

          {visibleGroups.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-sm font-bold text-white">ምንም የሚመሳሰል ገበያ አልተገኘም</p>
              <button
                type="button"
                onClick={() => {
                  setActiveCategory('all');
                  setSearchTerm('');
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black cursor-pointer"
              >
                ሁሉንም አሳይ
              </button>
            </div>
          ) : (
            visibleGroups.map((group) => (
              <div
                key={group.id}
                className="bg-slate-950/75 border border-slate-800 rounded-2xl p-4 space-y-3"
              >
                <div>
                  <h4 className="text-sm font-black text-white">{group.title}</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 flex items-start gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>{group.howToBet}</span>
                  </p>
                </div>

                <div
                  className={`grid gap-2 ${
                    group.cols === 4
                      ? 'grid-cols-2 sm:grid-cols-4'
                      : group.cols === 3
                        ? 'grid-cols-2 sm:grid-cols-3'
                        : 'grid-cols-2'
                  }`}
                >
                  {group.options.map((opt) => {
                    const active = selectedMarket === opt.key;
                    const oddVal = getScaledOdd(match.odds[opt.key]);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        disabled={disabled || isLiveLocked}
                        onClick={() => onSelectMarket(match, opt.key)}
                        className={`py-2 px-3 rounded-xl border text-xs flex items-center justify-between gap-2 transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                          active
                            ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-black'
                            : 'bg-slate-900 border-slate-800 hover:border-slate-600 text-slate-200 font-semibold'
                        }`}
                      >
                        <span className="truncate text-left">{opt.label}</span>
                        <span
                          className={`font-mono-num shrink-0 ${
                            active ? 'text-slate-950 font-black' : 'text-amber-400 font-bold'
                          }`}
                        >
                          {oddVal.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            {selectedMarket ? (
              <>
                የተመረጠ ምርጫ:{' '}
                <strong className="text-emerald-400">{getMarketLabel(selectedMarket)}</strong>
              </>
            ) : (
              'ከላይ የሚፈልጉትን ገበያ ይምረጡ'
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm cursor-pointer transition whitespace-nowrap"
          >
            ወደ ትኬቱ ተመለስ
          </button>
        </div>
      </div>
    </div>
  );
};
