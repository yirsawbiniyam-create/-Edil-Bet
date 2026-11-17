import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  Crown,
  Dices,
  Play,
  Sparkles,
  Swords,
  Volume2,
  VolumeX,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  DEFAULT_GAME_CONFIG,
  DOUBLE_SUM_MULTIPLIERS,
  evaluateCoin,
  evaluateD100,
  evaluateDoubleDice,
  evaluateLucky,
  evaluateSingleDice,
  formatETB,
  getD100Stats,
  getDiceGameLabel,
} from '../lib/gameEngine';
import { recordGameBet } from '../lib/firestoreService';
import { useLanguage } from '../lib/i18n';
import { playGameSound } from '../lib/sound';
import {
  BetRecord,
  CoinChoice,
  D100Direction,
  DiceSubMode,
  DoubleDiceBetMode,
  GameCategory,
  GameConfig,
  SingleDiceBetMode,
  TelebirrSettings,
  UserWallet,
} from '../types';
import { DiceVisual } from './DiceVisual';
import { GamingTips, StrategyPreset } from './GamingTips';

interface GameArenaProps {
  uid: string;
  wallet: UserWallet;
  settings: TelebirrSettings | null;
  gameConfig: GameConfig | null;
  soundEnabled: boolean;
  initialGame?: Exclude<GameCategory, 'chicken'>;
  initialStake?: number;
  onToggleSound: () => void;
  onGoToDeposit: () => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
  onWinCelebrate?: () => void;
}

export const GameArena: React.FC<GameArenaProps> = ({
  uid,
  wallet,
  settings,
  gameConfig,
  soundEnabled,
  initialGame,
  initialStake,
  onToggleSound,
  onGoToDeposit,
  onNotify,
  onWinCelebrate,
}) => {
  const { bi } = useLanguage();
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const [activeGame, setActiveGame] = useState<Exclude<GameCategory, 'chicken'>>(
    initialGame ?? 'dice',
  );
  const [diceSubMode, setDiceSubMode] = useState<DiceSubMode>('single');

  // Single Dice state
  const [singleMode, setSingleMode] = useState<SingleDiceBetMode>('low');
  const [singleExact, setSingleExact] = useState<number>(6);
  const [singleFace, setSingleFace] = useState<number>(5);

  // Double Dice state
  const [doubleMode, setDoubleMode] = useState<DoubleDiceBetMode>('low');
  const [doubleExact, setDoubleExact] = useState<number>(7);
  const [doubleFaces, setDoubleFaces] = useState<[number, number]>([4, 3]);

  // D100 state
  const [d100Direction, setD100Direction] = useState<D100Direction>('under');
  const [d100Target, setD100Target] = useState<number>(51);
  const [d100Display, setD100Display] = useState<number>(50);

  // Coin state
  const [coinChoice, setCoinChoice] = useState<CoinChoice>('heads');
  const [coinFace, setCoinFace] = useState<CoinChoice>('heads');

  // Lucky 1-20 state
  const [luckyChoice, setLuckyChoice] = useState<number>(7);
  const [luckyDisplay, setLuckyDisplay] = useState<string>('?');

  // Bet input & round state
  const [betInput, setBetInput] = useState<string>(() =>
    initialStake && initialStake >= 1 ? String(initialStake) : '50',
  );
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [showTips, setShowTips] = useState<boolean>(false);

  useEffect(() => {
    if (initialGame && !isRolling) {
      setActiveGame(initialGame);
    }
  }, [initialGame, isRolling]);

  useEffect(() => {
    if (initialStake && initialStake >= 1 && !isRolling) {
      setBetInput(String(initialStake));
    }
  }, [initialStake, isRolling]);
  const [statusLabel, setStatusLabel] = useState<string>('ምርጫዎን ይምረጡና ጨዋታውን ይጀምሩ');
  const [lastOutcome, setLastOutcome] = useState<{
    won: boolean;
    title: string;
    subtitle: string;
  } | null>(null);

  const activeConfig = gameConfig ?? DEFAULT_GAME_CONFIG;
  const houseWinRate = gameConfig?.houseWinRate ?? settings?.houseWinRate ?? DEFAULT_GAME_CONFIG.houseWinRate;
  const minBet = activeConfig.minBet;
  const maxBet = activeConfig.maxBet;

  const currentMultiplier = useMemo(() => {
    if (activeGame === 'coin') return activeConfig.coinOdds;
    if (activeGame === 'lucky') return activeConfig.luckyOdds;
    if (diceSubMode === 'single') {
      return singleMode === 'exact'
        ? activeConfig.singleDiceExactOdds
        : activeConfig.singleDiceRangeOdds;
    }
    if (diceSubMode === 'double') {
      if (doubleMode === 'exact') {
        return DOUBLE_SUM_MULTIPLIERS[doubleExact] || activeConfig.doubleDiceLucky7Odds;
      }
      if (doubleMode === 'lucky7') return activeConfig.doubleDiceLucky7Odds;
      return activeConfig.doubleDiceRangeOdds;
    }
    return getD100Stats(d100Direction, d100Target).multiplier;
  }, [activeGame, diceSubMode, singleMode, doubleMode, doubleExact, d100Direction, d100Target, activeConfig]);

  const numericBet = Math.max(0, parseFloat(betInput) || 0);
  const potentialWin = Number((numericBet * currentMultiplier).toFixed(2));
  const potentialNetProfit = Math.max(0, Number((potentialWin - numericBet).toFixed(2)));
  const d100Stats = getD100Stats(d100Direction, d100Target);

  const handleSwitchGame = (game: Exclude<GameCategory, 'chicken'>) => {
    if (isRolling) return;
    playGameSound('click', soundEnabled);
    setActiveGame(game);
    setLastOutcome(null);
    setStatusLabel('ምርጫዎን ይምረጡና ጨዋታውን ይጀምሩ');
  };

  const handleApplyStrategy = (strategy: StrategyPreset) => {
    if (isRolling) return;
    playGameSound('click', soundEnabled);
    setActiveGame(strategy.game === 'chicken' ? 'dice' : strategy.game);
    if (strategy.diceSubMode) setDiceSubMode(strategy.diceSubMode);
    if (strategy.singleMode) setSingleMode(strategy.singleMode);
    if (strategy.doubleMode) setDoubleMode(strategy.doubleMode);
    if (typeof strategy.doubleExact === 'number') setDoubleExact(strategy.doubleExact);
    if (strategy.d100Direction) setD100Direction(strategy.d100Direction);
    if (typeof strategy.d100Target === 'number') setD100Target(strategy.d100Target);
    if (strategy.coinChoice) setCoinChoice(strategy.coinChoice);
    if (typeof strategy.luckyChoice === 'number') setLuckyChoice(strategy.luckyChoice);
    setBetInput(String(strategy.recommendedBet));
    setLastOutcome(null);
    setStatusLabel(`ስልት ተጭኗል: ${strategy.title}`);
    onNotify(`"${strategy.title}" ወደ ጨዋታው ተጭኗል።`, 'info');
    arenaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePlay = async () => {
    if (isRolling) return;
    if (!Number.isFinite(numericBet) || numericBet < minBet) {
      onNotify(`ዝቅተኛው የጠረጴዛ መወራረጃ መጠን ${minBet} ብር ነው።`, 'error');
      return;
    }
    if (wallet.balance < numericBet) {
      onNotify('በቂ ቀሪ ሂሳብ የለዎትም! እባክዎ በቴሌብር ዲፖሲት ያድርጉ።', 'error');
      return;
    }

    setIsRolling(true);
    setLastOutcome(null);
    playGameSound('roll', soundEnabled);

    if (activeGame === 'dice' && diceSubMode === 'single') {
      setStatusLabel('ዳይሱ እየተሽከረከረ ነው...');
      const ticker = window.setInterval(() => {
        setSingleFace(Math.floor(Math.random() * 6) + 1);
      }, 90);

      window.setTimeout(async () => {
        window.clearInterval(ticker);
        const outcome = evaluateSingleDice(
          singleMode,
          singleExact,
          numericBet,
          houseWinRate,
          activeConfig.singleDiceRangeOdds,
          activeConfig.singleDiceExactOdds,
        );
        setSingleFace(outcome.rolled);
        setStatusLabel(`የወጣው ቁጥር: ${outcome.rolled} (${outcome.choiceText})`);
        await finalizeBet({
          gameType: 'dice_single',
          gameName: getDiceGameLabel('single'),
          betAmount: numericBet,
          multiplier: outcome.multiplier,
          choiceText: outcome.choiceText,
          resultText: outcome.resultText,
          won: outcome.won,
          payout: outcome.payout,
        });
      }, 820);
      return;
    }

    if (activeGame === 'dice' && diceSubMode === 'double') {
      setStatusLabel('ሁለቱ ዳይሶች እየተሽከረከሩ ነው...');
      const ticker = window.setInterval(() => {
        setDoubleFaces([Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]);
      }, 90);

      window.setTimeout(async () => {
        window.clearInterval(ticker);
        const outcome = evaluateDoubleDice(
          doubleMode,
          doubleExact,
          numericBet,
          houseWinRate,
          activeConfig.doubleDiceRangeOdds,
          activeConfig.doubleDiceLucky7Odds,
        );
        setDoubleFaces([outcome.die1, outcome.die2]);
        setStatusLabel(`ውጤት: ${outcome.die1} + ${outcome.die2} = ${outcome.sum}`);
        await finalizeBet({
          gameType: 'dice_double',
          gameName: getDiceGameLabel('double'),
          betAmount: numericBet,
          multiplier: outcome.multiplier,
          choiceText: outcome.choiceText,
          resultText: outcome.resultText,
          won: outcome.won,
          payout: outcome.payout,
        });
      }, 860);
      return;
    }

    if (activeGame === 'dice' && diceSubMode === 'd100') {
      setStatusLabel('ባለ 100 ዳይስ ቁጥር እየወጣ ነው...');
      const ticker = window.setInterval(() => {
        setD100Display(Math.floor(Math.random() * 100) + 1);
      }, 55);

      window.setTimeout(async () => {
        window.clearInterval(ticker);
        const outcome = evaluateD100(d100Direction, d100Target, numericBet, houseWinRate);
        setD100Display(outcome.rolled);
        setStatusLabel(`የወጣው ቁጥር: ${outcome.rolled}`);
        await finalizeBet({
          gameType: 'dice_d100',
          gameName: getDiceGameLabel('d100'),
          betAmount: numericBet,
          multiplier: outcome.multiplier,
          choiceText: outcome.choiceText,
          resultText: outcome.resultText,
          won: outcome.won,
          payout: outcome.payout,
        });
      }, 860);
      return;
    }

    if (activeGame === 'coin') {
      setStatusLabel('ሳንቲሙ በአየር ላይ እየተገለበጠ ነው...');
      window.setTimeout(async () => {
        const outcome = evaluateCoin(
          coinChoice,
          numericBet,
          houseWinRate,
          activeConfig.coinOdds,
        );
        setCoinFace(outcome.outcome);
        setStatusLabel(outcome.outcome === 'heads' ? 'ውጤት: ዘውድ (Heads)' : 'ውጤት: ጎራዴ (Tails)');
        await finalizeBet({
          gameType: 'coin',
          gameName: 'የሳንቲም ውርርድ',
          betAmount: numericBet,
          multiplier: outcome.multiplier,
          choiceText: outcome.choiceText,
          resultText: outcome.resultText,
          won: outcome.won,
          payout: outcome.payout,
        });
      }, 900);
      return;
    }

    // Lucky 1-20
    setStatusLabel('ከ 1 እስከ 20 የእድል ቁጥሩ እየተመረጠ ነው...');
    let tick = 0;
    const ticker = window.setInterval(() => {
      tick += 1;
      setLuckyDisplay(String((tick % 20) + 1));
    }, 60);

    window.setTimeout(async () => {
      window.clearInterval(ticker);
      const outcome = evaluateLucky(
        luckyChoice,
        numericBet,
        houseWinRate,
        activeConfig.luckyOdds,
      );
      setLuckyDisplay(String(outcome.winningNum));
      setStatusLabel(`የወጣው የእድል ቁጥር: ${outcome.winningNum}`);
      await finalizeBet({
        gameType: 'lucky',
        gameName: 'የእድል ቁጥር (1-20)',
        betAmount: numericBet,
        multiplier: outcome.multiplier,
        choiceText: outcome.choiceText,
        resultText: outcome.resultText,
        won: outcome.won,
        payout: outcome.payout,
      });
    }, 900);
  };

  const finalizeBet = async (params: {
    gameType: BetRecord['gameType'];
    gameName: string;
    betAmount: number;
    multiplier: number;
    choiceText: string;
    resultText: string;
    won: boolean;
    payout: number;
  }) => {
    try {
      await recordGameBet({
        uid,
        wallet,
        gameConfig,
        ...params,
      });

      if (params.won) {
        playGameSound('win', soundEnabled);
        onWinCelebrate?.();
        setLastOutcome({
          won: true,
          title: `እንኳን ደስ አለዎት! ${formatETB(params.payout)} አሸንፈዋል!`,
          subtitle: `${params.gameName} · ${params.resultText}`,
        });
      } else {
        playGameSound('lose', soundEnabled);
        setLastOutcome({
          won: false,
          title: `በዚህ ዙር አልተሳካም (-${formatETB(params.betAmount)})`,
          subtitle: `${params.gameName} · ${params.resultText}`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ውርርዱን በፋየርስቶር ላይ ማስቀመጥ አልተቻለም።';
      onNotify(msg, 'error');
    } finally {
      setIsRolling(false);
    }
  };

  const adjustBetByFactor = (factor: number) => {
    if (isRolling) return;
    playGameSound('click', soundEnabled);
    const next = Math.max(minBet, Math.floor((numericBet || minBet) * factor));
    const capped = wallet.balance >= minBet ? Math.min(next, Math.floor(wallet.balance)) : next;
    setBetInput(String(Math.max(minBet, capped)));
  };

  return (
    <div ref={arenaRef} className="space-y-3 sm:space-y-5">
      {/* Compact Low Balance Alert */}
      {wallet.balance < minBet && (
        <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-3 sm:p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-amber-400 truncate">
              ለመጫወት በቴሌብር ዲፖሲት ያድርጉ
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-300 truncate">
              ቀሪ ሂሳብ: {formatETB(wallet.balance)} · ዝቅተኛው 50 ብር
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToDeposit}
            className="shrink-0 min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>ዲፖሲት</span>
          </button>
        </div>
      )}

      {/* Game Selector Tabs */}
      <div className="grid grid-cols-3 gap-1.5 bg-slate-900/95 p-1 rounded-2xl border border-slate-800">
        <button
          type="button"
          onClick={() => handleSwitchGame('dice')}
          className={`min-h-[42px] py-2 px-2 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
            activeGame === 'dice'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Dices className="w-4 h-4 shrink-0" />
          <span>ዳይስ</span>
        </button>

        <button
          type="button"
          onClick={() => handleSwitchGame('coin')}
          className={`min-h-[42px] py-2 px-2 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
            activeGame === 'coin'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Coins className="w-4 h-4 shrink-0" />
          <span>ሳንቲም</span>
        </button>

        <button
          type="button"
          onClick={() => handleSwitchGame('lucky')}
          className={`min-h-[42px] py-2 px-2 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
            activeGame === 'lucky'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>እድል 1-20</span>
        </button>
      </div>

      {/* Main Mobile-Fit Arena Surface */}
      <section className="bg-slate-900/95 border border-slate-800 rounded-2xl sm:rounded-3xl p-3 sm:p-6 space-y-3 sm:space-y-5">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5 sm:pb-3">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-xl font-extrabold text-white truncate">
              {activeGame === 'dice' && 'የዳይስ ጨዋታ (1 - 100)'}
              {activeGame === 'coin' && 'የሳንቲም ውርርድ (ዘውድ / ጎራዴ)'}
              {activeGame === 'lucky' && 'የእድል ቁጥር (1 - 20)'}
            </h2>
            <p className="text-[11px] text-slate-400 font-mono-num truncate">
              ቀሪ: <strong className="text-emerald-400">{formatETB(wallet.balance)}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-right">
              <span className="text-[10px] text-slate-400 block leading-tight">ሽልማት</span>
              <span className="font-mono-num text-sm font-black text-emerald-400 leading-tight">
                {currentMultiplier}x
              </span>
            </div>
            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'ድምጽ አጥፋ' : 'ድምጽ አብራ'}
              className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-200 transition cursor-pointer shrink-0"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-amber-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-500" />
              )}
            </button>
          </div>
        </div>

        {/* DICE PANEL */}
        {activeGame === 'dice' && (
          <div className="space-y-3 sm:space-y-5">
            <div className="grid grid-cols-3 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {(
                [
                  ['single', 'ባለ 1 (1-6)'],
                  ['double', 'ባለ 2 (2-12)'],
                  ['d100', 'D100 (1-100)'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    if (isRolling) return;
                    playGameSound('click', soundEnabled);
                    setDiceSubMode(mode);
                    setLastOutcome(null);
                  }}
                  className={`min-h-[38px] py-1.5 px-1.5 rounded-lg text-[11px] sm:text-sm font-bold transition cursor-pointer ${
                    diceSubMode === mode
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Compact Responsive Visual Stage */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl py-4 sm:py-6 px-3 flex flex-col items-center justify-center min-h-[132px] sm:min-h-[180px] perspective-container">
              {diceSubMode === 'single' && <DiceVisual value={singleFace} rolling={isRolling} size="lg" />}

              {diceSubMode === 'double' && (
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-4 sm:gap-5">
                    <DiceVisual value={doubleFaces[0]} rolling={isRolling} size="md" />
                    <DiceVisual value={doubleFaces[1]} rolling={isRolling} size="md" />
                  </div>
                  <p className="mt-2 font-mono-num text-xs sm:text-sm font-bold text-amber-400">
                    ድምር: {doubleFaces[0] + doubleFaces[1]} ({doubleFaces[0]} + {doubleFaces[1]})
                  </p>
                </div>
              )}

              {diceSubMode === 'd100' && (
                <div className="w-28 h-24 sm:w-36 sm:h-30 rounded-2xl sm:rounded-3xl bg-slate-900 border-2 border-amber-500/60 flex flex-col items-center justify-center">
                  <span className="text-[10px] sm:text-xs font-semibold text-slate-400">D100 ቁጥር</span>
                  <span className="font-mono-num text-4xl sm:text-5xl font-black text-amber-400">
                    {d100Display}
                  </span>
                </div>
              )}

              <p className="mt-2.5 text-xs sm:text-sm font-semibold text-slate-300 text-center">{statusLabel}</p>
            </div>

            {/* Single Dice Controls */}
            {diceSubMode === 'single' && (
              <div className="space-y-2.5 sm:space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (isRolling) return;
                      playGameSound('click', soundEnabled);
                      setSingleMode('low');
                    }}
                    className={`min-h-[48px] p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border-2 flex flex-col items-center justify-center transition cursor-pointer active:scale-[0.98] ${
                      singleMode === 'low'
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <span className="text-sm sm:text-base font-extrabold">ዝቅተኛ (1 - 3)</span>
                    <span className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                      ሽልማት: {activeConfig.singleDiceRangeOdds}x
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (isRolling) return;
                      playGameSound('click', soundEnabled);
                      setSingleMode('high');
                    }}
                    className={`min-h-[48px] p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border-2 flex flex-col items-center justify-center transition cursor-pointer active:scale-[0.98] ${
                      singleMode === 'high'
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <span className="text-sm sm:text-base font-extrabold">ከፍተኛ (4 - 6)</span>
                    <span className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                      ሽልማት: {activeConfig.singleDiceRangeOdds}x
                    </span>
                  </button>
                </div>

                <div>
                  <p className="text-[11px] sm:text-xs font-semibold text-slate-400 mb-1.5 sm:mb-2">
                    ወይም ትክክለኛ ቁጥር ይምረጡ ({activeConfig.singleDiceExactOdds}x)
                  </p>
                  <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          if (isRolling) return;
                          playGameSound('click', soundEnabled);
                          setSingleMode('exact');
                          setSingleExact(num);
                        }}
                        className={`min-h-[44px] py-2 sm:py-3 rounded-xl border-2 font-mono-num font-black text-base sm:text-lg transition cursor-pointer active:scale-[0.96] ${
                          singleMode === 'exact' && singleExact === num
                            ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                            : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-200'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Double Dice Controls */}
            {diceSubMode === 'double' && (
              <div className="space-y-2.5 sm:space-y-4">
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
                  {(
                    [
                      ['low', 'ዝቅተኛ (2-6)', `${activeConfig.doubleDiceRangeOdds}x`],
                      ['lucky7', 'እድለኛ 7', `${activeConfig.doubleDiceLucky7Odds}x`],
                      ['high', 'ከፍተኛ (8-12)', `${activeConfig.doubleDiceRangeOdds}x`],
                    ] as const
                  ).map(([mode, title, mult]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        if (isRolling) return;
                        playGameSound('click', soundEnabled);
                        setDoubleMode(mode);
                      }}
                      className={`min-h-[48px] p-2 sm:p-3 rounded-xl sm:rounded-2xl border-2 flex flex-col items-center justify-center transition cursor-pointer active:scale-[0.98] ${
                        doubleMode === mode
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                          : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <span className="text-xs sm:text-base font-extrabold leading-tight text-center">{title}</span>
                      <span className="text-[11px] sm:text-xs text-slate-400 mt-0.5">{mult}</span>
                    </button>
                  ))}
                </div>

                <div>
                  <p className="text-[11px] sm:text-xs font-semibold text-slate-400 mb-1.5 sm:mb-2">ወይም ትክክለኛ ድምር ይምረጡ (2 - 12)</p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 sm:gap-2">
                    {Object.entries(DOUBLE_SUM_MULTIPLIERS).map(([sumStr, mult]) => {
                      const sumVal = Number(sumStr);
                      const active = doubleMode === 'exact' && doubleExact === sumVal;
                      return (
                        <button
                          key={sumVal}
                          type="button"
                          onClick={() => {
                            if (isRolling) return;
                            playGameSound('click', soundEnabled);
                            setDoubleMode('exact');
                            setDoubleExact(sumVal);
                          }}
                          className={`min-h-[44px] p-1.5 sm:p-2.5 rounded-xl border-2 flex flex-col items-center justify-center transition cursor-pointer active:scale-[0.96] ${
                            active
                              ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                              : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-200'
                          }`}
                        >
                          <span className="font-mono-num text-sm sm:text-base font-black">{sumVal}</span>
                          <span className="text-[10px] sm:text-[11px] font-bold text-emerald-400">{mult}x</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* D100 Controls */}
            {diceSubMode === 'd100' && (
              <div className="space-y-2.5 sm:space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2">
                  {[
                    { dir: 'under' as const, target: 26, label: '1 - 25', mult: '3.8x' },
                    { dir: 'under' as const, target: 51, label: '1 - 50', mult: '1.9x' },
                    { dir: 'over' as const, target: 50, label: '51 - 100', mult: '1.9x' },
                    { dir: 'over' as const, target: 75, label: '76 - 100', mult: '3.8x' },
                    { dir: 'over' as const, target: 89, label: '90 - 100', mult: '8.6x' },
                  ].map((preset) => {
                    const active =
                      d100Direction === preset.dir && d100Target === preset.target;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          if (isRolling) return;
                          playGameSound('click', soundEnabled);
                          setD100Direction(preset.dir);
                          setD100Target(preset.target);
                        }}
                        className={`min-h-[44px] p-2 sm:p-2.5 rounded-xl border-2 flex flex-col items-center justify-center transition cursor-pointer active:scale-[0.97] ${
                          active
                            ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                            : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-200'
                        }`}
                      >
                        <span className="font-mono-num text-xs font-black">{preset.label}</span>
                        <span className="text-[11px] font-bold text-emerald-400">{preset.mult}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-2.5 sm:space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (isRolling) return;
                          playGameSound('click', soundEnabled);
                          setD100Direction('under');
                        }}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                          d100Direction === 'under'
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        በታች (Under)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (isRolling) return;
                          playGameSound('click', soundEnabled);
                          setD100Direction('over');
                        }}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                          d100Direction === 'over'
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        በላይ (Over)
                      </button>
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-amber-400">
                      {d100Stats.rangeText}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono-num text-xs font-bold text-slate-400">2</span>
                    <input
                      type="range"
                      min={2}
                      max={99}
                      value={d100Target}
                      onChange={(e) => setD100Target(Number(e.target.value))}
                      className="w-full accent-amber-500 h-2.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                    <span className="font-mono-num text-xs font-bold text-slate-400">99</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* COIN PANEL */}
        {activeGame === 'coin' && (
          <div className="space-y-3 sm:space-y-5">
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl py-4 sm:py-7 px-4 flex flex-col items-center justify-center min-h-[136px] sm:min-h-[185px] perspective-container">
              <div
                className={`w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-amber-300 via-amber-500 to-amber-700 border-4 border-amber-200 flex flex-col items-center justify-center text-slate-950 shadow-xl ${
                  isRolling ? 'animate-coin-flip' : ''
                }`}
              >
                {coinFace === 'heads' ? (
                  <Crown className="w-7 h-7 sm:w-9 sm:h-9" />
                ) : (
                  <Swords className="w-7 h-7 sm:w-9 sm:h-9" />
                )}
                <span className="text-xs sm:text-sm font-black mt-0.5">
                  {coinFace === 'heads' ? 'ዘውድ' : 'ጎራዴ'}
                </span>
              </div>
              <p className="mt-2.5 text-xs sm:text-sm font-semibold text-slate-300">{statusLabel}</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
              <button
                type="button"
                onClick={() => {
                  if (isRolling) return;
                  playGameSound('click', soundEnabled);
                  setCoinChoice('heads');
                }}
                className={`min-h-[48px] p-3 sm:p-4 rounded-2xl border-2 flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98] ${
                  coinChoice === 'heads'
                    ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                }`}
              >
                <Crown className="w-5 h-5" />
                <span className="text-sm sm:text-base font-extrabold">ዘውድ (Heads)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isRolling) return;
                  playGameSound('click', soundEnabled);
                  setCoinChoice('tails');
                }}
                className={`min-h-[48px] p-3 sm:p-4 rounded-2xl border-2 flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98] ${
                  coinChoice === 'tails'
                    ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                }`}
              >
                <Swords className="w-5 h-5" />
                <span className="text-sm sm:text-base font-extrabold">ጎራዴ (Tails)</span>
              </button>
            </div>
          </div>
        )}

        {/* LUCKY 1-20 PANEL */}
        {activeGame === 'lucky' && (
          <div className="space-y-3 sm:space-y-5">
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl py-4 sm:py-7 px-4 flex flex-col items-center justify-center min-h-[124px] sm:min-h-[175px]">
              <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl sm:rounded-3xl bg-slate-900 border-2 border-amber-500/60 flex items-center justify-center">
                <span className="font-mono-num text-4xl sm:text-5xl font-black text-amber-400">
                  {luckyDisplay}
                </span>
              </div>
              <p className="mt-2 text-xs sm:text-sm font-semibold text-slate-300">{statusLabel}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-400 mb-2">የእድል ቁጥርዎን ይምረጡ (1 - 20)</p>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 sm:gap-2">
                {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      if (isRolling) return;
                      playGameSound('click', soundEnabled);
                      setLuckyChoice(num);
                    }}
                    className={`min-h-[42px] py-2 rounded-xl border-2 font-mono-num text-sm sm:text-base font-black transition cursor-pointer active:scale-[0.95] ${
                      luckyChoice === num
                        ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Outcome Banner */}
        {lastOutcome && (
          <div
            className={`px-3.5 py-2.5 rounded-xl border flex items-center justify-center gap-2.5 text-center ${
              lastOutcome.won
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
            }`}
          >
            {lastOutcome.won ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm sm:text-base font-extrabold truncate">{lastOutcome.title}</p>
              <p className="text-[11px] opacity-90 truncate">{lastOutcome.subtitle}</p>
            </div>
          </div>
        )}

        {/* Mobile-Friendly Thumb-Zone Stake & Play Action */}
        <div className="pt-3 border-t border-slate-800 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <label htmlFor="betAmountInput" className="font-bold text-slate-400">
              መደብ (ዝቅተኛ: {minBet} ብር)
            </label>
            <span className="font-mono-num font-bold text-emerald-400">
              ሊያሸንፉ: {formatETB(potentialWin)} ({currentMultiplier}x)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                id="betAmountInput"
                type="number"
                min={minBet}
                step={1}
                value={betInput}
                onChange={(e) => setBetInput(e.target.value)}
                disabled={isRolling}
                className="w-full bg-slate-950 border-2 border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2.5 text-lg font-mono-num font-black text-white outline-none transition pr-11"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">
                ብር
              </span>
            </div>

            <button
              type="button"
              disabled={isRolling}
              onClick={() => adjustBetByFactor(0.5)}
              className="min-h-[46px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono-num font-black text-slate-200 cursor-pointer shrink-0 active:scale-[0.96]"
            >
              ½
            </button>
            <button
              type="button"
              disabled={isRolling}
              onClick={() => adjustBetByFactor(2)}
              className="min-h-[46px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono-num font-black text-slate-200 cursor-pointer shrink-0 active:scale-[0.96]"
            >
              2×
            </button>
            <button
              type="button"
              disabled={isRolling}
              onClick={() => {
                if (isRolling) return;
                playGameSound('click', soundEnabled);
                setBetInput(String(Math.max(minBet, Math.floor(wallet.balance))));
              }}
              className="min-h-[46px] px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold text-amber-400 transition cursor-pointer whitespace-nowrap shrink-0 active:scale-[0.96]"
            >
              ሁሉንም
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold">
                {bi('ፈጣን የመደብ ምርጫ', 'Quick Select Stake')}
              </span>
              <span className="font-mono-num">
                {bi('1 ንክኪ = ፈጣን መሙላት', '1-tap fill')}
              </span>
            </div>
            <div
              role="group"
              aria-label={bi('ፈጣን የመደብ መጠኖች', 'Quick select stake amounts')}
              className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2"
            >
              {[10, 50, 100, 250, 500, 1000].map((preset) => {
                const isSelected = numericBet === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    disabled={isRolling}
                    aria-pressed={isSelected}
                    onClick={() => {
                      if (isRolling) return;
                      playGameSound('click', soundEnabled);
                      setBetInput(String(preset));
                    }}
                    className={`min-h-[44px] py-2 px-2 rounded-xl border text-xs font-mono-num tabular-nums font-black transition cursor-pointer active:scale-[0.96] disabled:opacity-50 ${
                      isSelected
                        ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-sm'
                        : 'bg-slate-800/90 border-slate-700 hover:bg-slate-700 hover:border-slate-500 text-slate-100'
                    }`}
                  >
                    {preset.toLocaleString()} {bi('ብር', 'ETB')}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Potential Win & Net Profit Strip */}
          <div className="grid grid-cols-2 gap-2 bg-slate-950/85 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs">
            <div>
              <span className="text-[11px] text-slate-400 block">
                ሊያሸንፉ የሚችሉት · Potential Win
              </span>
              <span className="font-mono-num tabular-nums text-sm sm:text-base font-black text-emerald-400">
                {formatETB(potentialWin)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-400 block">
                የተጣራ ትርፍ · Net Profit ({currentMultiplier}x)
              </span>
              <span className="font-mono-num tabular-nums text-sm sm:text-base font-extrabold text-amber-300">
                +{formatETB(potentialNetProfit)}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={isRolling}
            onClick={handlePlay}
            className="w-full min-h-[52px] py-3.5 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-black text-base sm:text-lg flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer shadow-lg"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>
              {isRolling
                ? 'እየተጫወተ ነው...'
                : activeGame === 'dice'
                  ? `ዳይሱን ወርውር (${numericBet.toLocaleString()} ብር)`
                  : activeGame === 'coin'
                    ? `ሳንቲሙን ገልብጥ (${numericBet.toLocaleString()} ብር)`
                    : `እድልህን ሞክር (${numericBet.toLocaleString()} ብር)`}
            </span>
          </button>
        </div>
      </section>

      {/* Collapsible Strategy Presets so Main Game Fits Mobile Screen Cleanly */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowTips((prev) => !prev)}
          className="w-full px-4 py-3 flex items-center justify-between text-xs sm:text-sm font-bold text-slate-200 hover:bg-slate-800/60 cursor-pointer"
        >
          <span>የአጨዋወት ስልቶች እና ፈጣን ምክሮች (Pro Tips)</span>
          {showTips ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
        </button>
        {showTips && (
          <div className="p-3 sm:p-4 border-t border-slate-800">
            <GamingTips
              activeConfig={activeConfig}
              walletBalance={wallet.balance}
              isRolling={isRolling}
              onApplyStrategy={handleApplyStrategy}
            />
          </div>
        )}
      </div>
    </div>
  );
};
