import React from 'react';
import {
  ArrowRight,
  Coins,
  Dices,
  Footprints,
  Gift,
  History,
  Play,
  Radio,
  Sparkles,
  Trophy,
  Tv,
  Wallet,
} from 'lucide-react';
import chickenJumpPromoImg from '../assets/images/chicken_jump_promo_1794928007100.jpg';
import diceCoinPromoImg from '../assets/images/dice_coin_promo_1794928007354.jpg';
import luckyNumberPromoImg from '../assets/images/lucky_number_promo_1794928007701.jpg';
import stadiumBannerImg from '../assets/images/sportsbook_stadium_banner_1794733915064.jpg';
import { DEFAULT_GAME_CONFIG, formatETB } from '../lib/gameEngine';
import { useLanguage } from '../lib/i18n';
import { GameCategory, GameConfig, ReferralRecord, UserWallet } from '../types';
import { ReferFriendCard } from './ReferFriendCard';

interface GamesDashboardProps {
  wallet: UserWallet;
  gameConfig: GameConfig | null;
  liveMatchesCount: number;
  liveTicketsCount: number;
  dailyBonusAvailable: boolean;
  dailyBonusAmount: number;
  claimingBonus: boolean;
  quickStake: number;
  onChangeQuickStake: (amount: number) => void;
  onClaimDailyBonus: () => void;
  onOpenChickenJump: (stake: number) => void;
  onOpenFootball: (section?: 'sport' | 'live' | 'upcoming' | 'cashout' | 'promos') => void;
  onOpenArenaGame: (category: Exclude<GameCategory, 'chicken'>, stake: number) => void;
  onGoToWallet: () => void;
  onGoToHistory: () => void;
  referralCode: string | null;
  referrals: ReferralRecord[];
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const STAKE_PRESETS = [10, 25, 50, 100, 250, 500];

export const GamesDashboard: React.FC<GamesDashboardProps> = ({
  wallet,
  gameConfig,
  liveMatchesCount,
  liveTicketsCount,
  dailyBonusAvailable,
  dailyBonusAmount,
  claimingBonus,
  quickStake,
  onChangeQuickStake,
  onClaimDailyBonus,
  onOpenChickenJump,
  onOpenFootball,
  onOpenArenaGame,
  onGoToWallet,
  onGoToHistory,
  referralCode,
  referrals,
  onNotify,
}) => {
  const { bi } = useLanguage();
  const activeConfig = gameConfig ?? DEFAULT_GAME_CONFIG;

  return (
    <div className="space-y-5 pt-3">
      {/* Unified Quick-Play Dashboard Control Header */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {bi('የእድል ቤት ጨዋታዎች ዳሽቦርድ', 'Edil Bet Unified Games Dashboard')}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              {bi(
                'ሁሉም ጨዋታዎች በአንድ ቦታ — መደብዎን ይምረጡና በ1 ክሊክ ወዲያውኑ ይቆምሩ',
                'All games in one simple hub — pick your stake and launch in one tap',
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="bg-[#EAF3ED] border border-[#0E8A38]/25 rounded-xl px-3.5 py-2">
              <span className="text-[11px] font-bold text-slate-600 block">
                {bi('ቀሪ ሂሳብዎ', 'Wallet Balance')}
              </span>
              <span className="font-mono-num tabular-nums text-base sm:text-lg font-black text-[#0E8A38]">
                {formatETB(wallet.balance)}
              </span>
            </div>

            <button
              type="button"
              onClick={onGoToWallet}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0E8A38] hover:bg-[#0B732E] text-white text-xs sm:text-sm font-black flex items-center gap-1.5 transition cursor-pointer"
            >
              <Wallet className="w-4 h-4" />
              <span>{bi('ቴሌብር ዲፖሲት / ወጪ', 'Telebirr Wallet')}</span>
            </button>

            <button
              type="button"
              onClick={onGoToHistory}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <History className="w-4 h-4 text-[#0E8A38]" />
              <span>{bi('ታሪክ & W/L', 'History')}</span>
            </button>
          </div>
        </div>

        {/* Daily Bonus Strip if Available */}
        {dailyBonusAvailable && (
          <div className="bg-[#EAF3ED] border border-[#0E8A38]/30 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#9AD84B]/40 text-[#0E8A38] flex items-center justify-center shrink-0">
                <Gift className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-black text-slate-900">
                  {bi('የዛሬ ነፃ ዕለታዊ ጉርሻዎ ዝግጁ ነው!', 'Your Free Daily Login Bonus is Ready!')} (+
                  {formatETB(dailyBonusAmount)})
                </p>
                <p className="text-[11px] text-slate-600">
                  {bi('በ1 ክሊክ ወደ ቦርሳዎ ይጨምሩና ይጫወቱ', 'Claim directly to your wallet in one tap')}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={claimingBonus}
              onClick={onClaimDailyBonus}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0E8A38] hover:bg-[#0B732E] text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Coins className="w-4 h-4" />
              <span>
                {claimingBonus
                  ? bi('በመስጠት ላይ...', 'Claiming...')
                  : bi('ነፃ ጉርሻ ውሰድ', 'Claim Bonus')}
              </span>
            </button>
          </div>
        )}

        {/* Ultra-Simple 1-Tap Stake Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
          <div>
            <span className="text-xs font-black text-slate-900 block">
              {bi('ፈጣን የውርርድ መጠን ይምረጡ (Quick Stake)', '1-Tap Quick Stake Pre-Selector')}
            </span>
            <span className="text-[11px] text-slate-600">
              {bi(
                'የመረጡት መጠን ከታች ያሉትን ማንኛውንም ጨዋታ ሲከፍቱ በቀጥታ ይሞላል',
                'Selected amount pre-fills whichever game card you tap below',
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {STAKE_PRESETS.map((amt) => {
              const selected = quickStake === amt;
              return (
                <button
                  key={amt}
                  type="button"
                  onClick={() => onChangeQuickStake(amt)}
                  className={`min-h-[40px] px-3 py-1.5 rounded-lg font-mono-num tabular-nums text-xs sm:text-sm font-black transition cursor-pointer ${
                    selected
                      ? 'bg-[#0E8A38] text-white shadow-xs'
                      : 'bg-white border border-slate-300 text-slate-800 hover:border-[#0E8A38]'
                  }`}
                >
                  {amt} {bi('ብር', 'ETB')}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Promotional Photo Showcase Grid */}
      <section aria-label={bi('የጨዋታ ማስታወቂያዎች እና ፈጣን መግቢያ', 'Game Promo Showcase')} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Promo 1: Chicken Jump (Featured Hero Card) */}
        <article className="lg:col-span-2 relative overflow-hidden rounded-3xl bg-slate-950 border border-amber-500/35 shadow-lg min-h-[270px] sm:min-h-[320px] flex flex-col justify-end">
          <img
            src={chickenJumpPromoImg}
            alt={bi('ዶሮ ዝላይ ውርርድ ማስታወቂያ ፎቶ', 'Chicken Jump betting game artwork')}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-950/20"
          />

          <div className="relative z-10 p-5 sm:p-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2 text-xs font-extrabold text-amber-300">
                <Footprints className="w-4 h-4 shrink-0" />
                <span>{bi('አዲስ ጨዋታ · እስከ 20x ሽልማት · ፈጣን Cashout', 'NEW ARCADE GAME · UP TO 20x · INSTANT CASHOUT')}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {bi('ዶሮ ዝላይ ውርርድ (Chicken Jump)', 'Chicken Jump Road Bet')}
              </h2>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                {bi(
                  'ዶሮዋን በመስመሮች ላይ እያዘለሉ ብርዎን ያባዙ! በእያንዳንዱ ሰላም ዝላይ "ብር ውሰድ" በመጫን ወዲያውኑ ማሸነፍ ይችላሉ።',
                  'Hop lane by lane to multiply your wager! Tap Cashout after any safe jump to collect instant winnings.',
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onOpenChickenJump(quickStake)}
              className="shrink-0 min-h-[50px] px-6 py-3 rounded-2xl bg-[#9AD84B] hover:bg-[#abe65f] text-slate-950 font-black text-sm sm:text-base flex items-center justify-center gap-2 transition cursor-pointer shadow-xl whitespace-nowrap"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                {bi(
                  `አሁን ዝለል (${quickStake} ብር)`,
                  `Play Chicken Jump (${quickStake} ETB)`,
                )}
              </span>
            </button>
          </div>
        </article>

        {/* Promo 2: Football Betting & Live Video */}
        <article className="relative overflow-hidden rounded-3xl bg-slate-950 border border-slate-800 shadow-md min-h-[250px] flex flex-col justify-end">
          <img
            src={stadiumBannerImg}
            alt={bi('እግር ኳስ ቤቲንግ እና ላይቭ ቪድዮ ማስታወቂያ ፎቶ', 'Football sportsbook and live video artwork')}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/25"
          />

          <div className="relative z-10 p-5 sm:p-6 space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs font-extrabold text-emerald-300">
              <span className="flex items-center gap-1.5">
                <Tv className="w-4 h-4 shrink-0" />
                <span>{bi('እግር ኳስ & ላይቭ ቪድዮ ስርጭት', 'FOOTBALL & LIVE MATCH VIDEO')}</span>
              </span>
              <span className="font-mono-num text-amber-300">
                {liveMatchesCount} LIVE {liveTicketsCount > 0 ? `· ${liveTicketsCount} ትኬት` : ''}
              </span>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                {bi('እግር ኳስ ቤቲንግ (135+ ገበያዎች)', 'Football Sportsbook (135+ Markets)')}
              </h2>
              <p className="text-xs sm:text-sm text-slate-200 mt-1">
                {bi(
                  'ጨዋታዎችን በቀጥታ ቪድዮ እየተመለከቱ ይቆምሩ፤ ከ 5\'-80\' ደቂቃ ፈጣን ካሽአውት ያድርጉ።',
                  'Watch live simulated broadcast video while betting and cash out anytime between 5\' and 80\'.',
                )}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => onOpenFootball('sport')}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0E8A38] hover:bg-[#11a142] text-white font-black text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer"
              >
                <Trophy className="w-4 h-4" />
                <span>{bi('ስፖርት ይቆምሩ', 'Bet Football')}</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenFootball('live')}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-emerald-400/40 text-emerald-300 font-black text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer"
              >
                <Radio className="w-4 h-4" />
                <span>{bi('ላይቭ ቪድዮ', 'Live Video')}</span>
              </button>
            </div>
          </div>
        </article>

        {/* Promo 3: Dice & Coin Toss */}
        <article className="relative overflow-hidden rounded-3xl bg-slate-950 border border-slate-800 shadow-md min-h-[250px] flex flex-col justify-end">
          <img
            src={diceCoinPromoImg}
            alt={bi('የዳይስ እና የሳንቲም ጨዋታ ማስታወቂያ ፎቶ', 'Dice and coin toss tabletop game artwork')}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/20"
          />

          <div className="relative z-10 p-5 sm:p-6 space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs font-extrabold text-amber-300">
              <span className="flex items-center gap-1.5">
                <Dices className="w-4 h-4 shrink-0" />
                <span>{bi('ፈጣን ውጤት · በ3 ሰከንድ', 'INSTANT RESULT · 3-SECOND PLAY')}</span>
              </span>
              <span className="font-mono-num text-emerald-300">
                {activeConfig.coinOdds}x - 30x
              </span>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                {bi('ዳይስ (1-100) እና ሳንቲም ውርርድ', 'Dice (1-100) & Coin Toss')}
              </h2>
              <p className="text-xs sm:text-sm text-slate-200 mt-1">
                {bi(
                  'ባለ 1 እና 2 ዳይስ (እስከ 30x)፣ D100 ወይም ዘውድ እና ጎራዴ መርጠው ወዲያውኑ ያሸንፉ።',
                  'Roll Single, Double (up to 30x), D100 dice or flip Heads/Tails for instant ETB payouts.',
                )}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => onOpenArenaGame('dice', quickStake)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer"
              >
                <Dices className="w-4 h-4" />
                <span>{bi(`ዳይስ (${quickStake} ብር)`, `Play Dice (${quickStake} ETB)`)}</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenArenaGame('coin', quickStake)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-amber-400/40 text-amber-300 font-black text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer"
              >
                <Coins className="w-4 h-4" />
                <span>{bi('ሳንቲም ገልብጥ', 'Coin Toss')}</span>
              </button>
            </div>
          </div>
        </article>

        {/* Promo 4: Lucky Number 1-20 */}
        <article className="lg:col-span-2 relative overflow-hidden rounded-3xl bg-slate-950 border border-slate-800 shadow-md min-h-[220px] flex flex-col justify-end">
          <img
            src={luckyNumberPromoImg}
            alt={bi('የእድል ቁጥር 1 እስከ 20 ማስታወቂያ ፎቶ', 'Lucky Number 1-20 gold spheres artwork')}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-slate-950/30"
          />

          <div className="relative z-10 p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-xl">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-300">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>
                  {bi(
                    `ከ 1 - 20 · ትልቅ ${activeConfig.luckyOdds}x መባዣ`,
                    `1 - 20 DRAW · ${activeConfig.luckyOdds}x MULTIPLIER`,
                  )}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                {bi('የእድል ቁጥር (Lucky 1 - 20)', 'Lucky Number (1 - 20)')}
              </h2>
              <p className="text-xs sm:text-sm text-slate-200">
                {bi(
                  `አንድ እድለኛ ቁጥር ይምረጡ፤ ትክክል ከሆኑ ${quickStake} ብርዎ ወዲያውኑ ${formatETB(quickStake * activeConfig.luckyOdds)} ይሆናል!`,
                  `Pick one lucky number; hit it right and ${quickStake} ETB turns into ${formatETB(quickStake * activeConfig.luckyOdds)}!`,
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onOpenArenaGame('lucky', quickStake)}
              className="shrink-0 min-h-[48px] px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
            >
              <span>{bi(`እድልህን ሞክር (${quickStake} ብር)`, `Play Lucky 20 (${quickStake} ETB)`)}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </article>
      </section>

      {/* Ultra-Simple 3-Step Beginner Betting Strip */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <h3 className="text-sm font-black text-slate-900 mb-3">
          {bi('በ3 ቀላል ደረጃዎች ይጫወቱ (How to Play in 3 Steps)', 'How to Play in 3 Simple Steps')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1">
            <span className="font-mono-num font-black text-[#0E8A38]">01</span>
            <p className="font-bold text-slate-900">
              {bi('በቴሌብር ዲፖሲት ያድርጉ', 'Deposit via Telebirr')}
            </p>
            <p className="text-slate-600">
              {bi(
                'በቦርሳ ክፍል ውስጥ ቢያንስ 50 ብር በቴሌብር አስገብተው ሂሳብዎን ይሙሉ።',
                'Top up 50+ ETB easily in the Telebirr Wallet tab.',
              )}
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1">
            <span className="font-mono-num font-black text-[#0E8A38]">02</span>
            <p className="font-bold text-slate-900">
              {bi('ጨዋታና መደብ ይምረጡ', 'Pick Game & Stake')}
            </p>
            <p className="text-slate-600">
              {bi(
                'ዶሮ ዝላይ፣ እግር ኳስ፣ ዳይስ ወይም ሳንቲም በመረጡት መጠን (10-500+ ብር) ይጫወቱ።',
                'Launch Chicken Jump, Football, Dice, Coin or Lucky 1-20 with one tap.',
              )}
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1">
            <span className="font-mono-num font-black text-[#0E8A38]">03</span>
            <p className="font-bold text-slate-900">
              {bi('ያሸነፉትን ወዲያውኑ ያውጡ', 'Withdraw Winnings')}
            </p>
            <p className="text-slate-600">
              {bi(
                'ትርፍዎ ወዲያውኑ ወደ ሂሳብዎ ይገባል፤ በቴሌብር ቁጥርዎ ዊዝድሮው ይጠይቁ።',
                'Winnings credit instantly; request Telebirr payout anytime from Wallet.',
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Refer a Friend Card */}
      <ReferFriendCard
        referralCode={referralCode}
        referrals={referrals}
        variant="light"
        onNotify={onNotify}
      />
    </div>
  );
};
