import React, { useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, HelpCircle, LayoutGrid, Search, X } from 'lucide-react';
import {
  buildMarketGroups,
  getMarketLabel,
  MARKET_CATEGORIES,
  MarketCategoryId,
} from '../lib/footballMarkets';
import { ScheduledMatch } from '../lib/footballSchedule';
import { useLanguage } from '../lib/i18n';
import { FootballMarketKey } from '../types';

interface MatchMarketsModalProps {
  match: ScheduledMatch;
  selectedMarket?: FootballMarketKey;
  getScaledOdd: (baseOdd: number) => number;
  disabled?: boolean;
  onSelectMarket: (match: ScheduledMatch, market: FootballMarketKey) => void;
  onOpenStats?: () => void;
  onClose: () => void;
}

const CATEGORY_BILINGUAL: Record<MarketCategoryId, { am: string; en: string }> = {
  all: { am: 'ሁሉም (135+)', en: 'All Markets (135+)' },
  main: { am: 'ዋና (1X2 · DC · DNB)', en: 'Main (1X2 · DC · DNB)' },
  first_half: { am: '1ኛ አጋማሽ (1st Half)', en: '1st Half Markets' },
  goals: { am: 'ጎሎች (O/U · Multigoals)', en: 'Goals (O/U · Multigoals)' },
  cards_corners: { am: 'ካርዶች እና ኮርነር', en: 'Cards & Corners' },
  combo: { am: 'ኮምቦ እና HT/FT', en: 'Combo & HT/FT' },
  team_specials: { am: 'የቡድን ልዩ (Specials)', en: 'Team Specials' },
  correct_score: { am: 'ትክክለኛ ውጤት (Score)', en: 'Correct Score' },
};

export const MatchMarketsModal: React.FC<MatchMarketsModalProps> = ({
  match,
  selectedMarket,
  getScaledOdd,
  disabled = false,
  onSelectMarket,
  onOpenStats,
  onClose,
}) => {
  const { bi } = useLanguage();
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
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-markets-title"
    >
      <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl w-full max-w-4xl max-h-[94dvh] flex flex-col overflow-hidden shadow-2xl text-slate-900">
        {/* Top Sportsbook Green Header with Back & Stats Buttons */}
        <div className="p-3 sm:p-4 bg-[#0E8A38] text-white space-y-2 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 text-white text-xs font-black flex items-center gap-1 cursor-pointer transition shrink-0"
              aria-label={bi('ተመለስ', 'Back')}
            >
              <ArrowLeft className="w-4 h-4 text-[#9AD84B]" />
              <span>{bi('ተመለስ', 'Back')}</span>
            </button>

            <div className="flex items-center gap-1.5 shrink-0">
              {onOpenStats && (
                <button
                  type="button"
                  onClick={onOpenStats}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#9AD84B] hover:bg-[#a9e45d] text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>{bi('ስታትስ · H2H', 'Stats · H2H')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label={bi('ዝጋ', 'Close')}
                className="w-10 h-10 rounded-lg bg-black/20 hover:bg-black/30 text-white flex items-center justify-center shrink-0 cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-bold text-[#9AD84B] truncate">
              {match.leagueLabel} ·{' '}
              <span className="font-mono-num text-white">{match.kickoffLabel}</span>
            </p>
            <h3
              id="match-markets-title"
              className="text-base sm:text-xl font-black text-white mt-0.5 truncate"
            >
              {match.home} vs {match.away}
            </h3>
            <p className="text-[11px] sm:text-xs text-emerald-100 mt-0.5 flex items-center gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5 text-[#9AD84B] shrink-0" />
              <span className="truncate">
                {bi(
                  `የአቆማመር ዘዴ ይምረጡ (${totalOptionsCount}+ ስታይሎች) — ሲነኩ ወደ ትኬትዎ ይገባል`,
                  `Choose Betting Style (${totalOptionsCount}+ Markets) — tap any odd to select`,
                )}
              </span>
            </p>
          </div>
        </div>

        {/* Category Tabs & Search */}
        <div className="p-3 sm:p-4 border-b border-slate-200 space-y-2.5 bg-[#F8FAFC] shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {MARKET_CATEGORIES.map((cat) => {
              const catLabel = CATEGORY_BILINGUAL[cat.id];
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition ${
                    activeCategory === cat.id
                      ? 'bg-[#0E8A38] text-white font-extrabold'
                      : 'bg-white border border-slate-200 text-slate-700 hover:border-[#0E8A38]/50'
                  }`}
                >
                  {bi(catLabel.am, catLabel.en)}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={bi(
                'የመቆመር ዘዴ ይፈልጉ (Over 2.5, Multigoals, 1st Half, Cards, Corners, Handicap, Clean Sheet...)',
                'Search bet style (Over 2.5, Multigoals, 1st Half, Cards, Corners, Handicap, Correct Score...)',
              )}
              className="w-full bg-white border border-slate-300 focus:border-[#0E8A38] rounded-lg pl-10 pr-9 py-2 text-xs sm:text-sm text-slate-900 outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label={bi('አጽዳ', 'Clear')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Markets List */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 bg-[#F1F5F9]">
          {isLiveLocked && (
            <div className="bg-rose-50 border border-rose-300 rounded-lg p-3 text-xs font-bold text-rose-800">
              {bi(
                "ይህ ጨዋታ ከ 85' ስላለፈ በቤቲንግ ህግ መሰረት ላይቭ ውርርዱ ተዘግቷል።",
                "In-play betting locks after 85' under sportsbook rules.",
              )}
            </div>
          )}

          {visibleGroups.length === 0 ? (
            <div className="py-10 text-center space-y-2 bg-white border border-slate-200 rounded-xl">
              <p className="text-sm font-bold text-slate-900">
                {bi('ምንም የሚመሳሰል ገበያ አልተገኘም', 'No matching betting style found')}
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveCategory('all');
                  setSearchTerm('');
                }}
                className="px-4 py-2 rounded-lg bg-[#0E8A38] text-white text-xs font-extrabold cursor-pointer"
              >
                {bi('ሁሉንም አሳይ', 'Show All Markets')}
              </button>
            </div>
          ) : (
            visibleGroups.map((group) => (
              <div
                key={group.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs"
              >
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                  <h4 className="text-sm font-extrabold text-slate-900">{group.title}</h4>
                  <p className="text-[11px] text-slate-600 mt-0.5 flex items-start gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-[#0E8A38] shrink-0 mt-0.5" />
                    <span>{group.howToBet}</span>
                  </p>
                </div>

                <div
                  className={`p-3 grid gap-2 ${
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
                        className={`py-2 px-3 min-h-[44px] rounded-lg text-xs flex items-center justify-between gap-2 transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                          active
                            ? 'bg-[#0E8A38] text-white font-extrabold'
                            : 'bg-[#E5E7EB] hover:bg-slate-300 text-slate-900 font-semibold'
                        }`}
                      >
                        <span className="truncate text-left">{opt.label}</span>
                        <span
                          className={`font-mono-num shrink-0 ${
                            active ? 'text-[#9AD84B] font-black' : 'text-slate-900 font-extrabold'
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
        <div className="p-3.5 sm:p-4 border-t border-slate-200 bg-white flex items-center justify-between gap-2 shrink-0 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          <span className="text-xs text-slate-600 truncate">
            {selectedMarket ? (
              <>
                {bi('የተመረጠ ምርጫ', 'Selected Style')}:{' '}
                <strong className="text-[#0E8A38]">
                  {getMarketLabel(selectedMarket)} ({getScaledOdd(match.odds[selectedMarket]).toFixed(2)}x)
                </strong>
              </>
            ) : (
              bi('ከላይ የሚፈልጉትን የመቆመር ዘዴ ይምረጡ', 'Pick any betting style above')
            )}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-3.5 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-900 font-extrabold text-xs flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{bi('ተመለስ', 'Back')}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 rounded-lg bg-[#0E8A38] hover:bg-[#0B732E] text-white font-extrabold text-xs sm:text-sm cursor-pointer transition whitespace-nowrap"
            >
              {selectedMarket ? bi('ወደ ትኬቱ ሂድ', 'Betslip') : bi('ዝጋ', 'Done')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
