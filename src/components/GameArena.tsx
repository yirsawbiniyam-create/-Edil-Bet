import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
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
  onToggleSound,
  onGoToDeposit,
  onNotify,
  onWinCelebrate,
}) => {
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const [activeGame, setActiveGame] = useState<GameCategory>('dice');
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
  const [betInput, setBetInput] = useState<string>('50');
  const [isRolling, setIsRolling] = useState<boolean>(false);
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
  const d100Stats = getD100Stats(d100Direction, d100Target);

  const handleSwitchGame = (game: GameCategory) => {
    if (isRolling) return;
    playGameSound('click', soundEnabled);
    setActiveGame(game);
    setLastOutcome(null);
    setStatusLabel('ምርጫዎን ይምረጡና ጨዋታውን ይጀምሩ');
  };

  const handleApplyStrategy = (strategy: StrategyPreset) => {
    if (isRolling) return;
    playGameSound('click', soundEnabled);
    setActiveGame(strategy.game);
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

  return (
    <div ref={arenaRef} className="space-y-6">
      {/* Balance Callout Banner if zero */}
      {wallet.balance < 1 && (
        <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-amber-400">ለመጫወት መጀመሪያ በቴሌብር ዲፖሲት ያድርጉ</h3>
            <p className="text-sm text-slate-300">
              ቀሪ ሂሳብዎ 0.00 ብር ነው። ዝቅተኛው 100 ብር በቴሌብር አስገብተው ወዲያውኑ መጫወት ይችላሉ።
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToDeposit}
            className="shrink-0 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
          >
            <Wallet className="w-4 h-4" />
            <span>አሁን ዲፖሲት አድርግ</span>
          </button>
        </div>
      )}

      {/* Game Selector Tabs */}
      <div className="grid grid-cols-3 gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800">
        <button
          type="button"
          onClick={() => handleSwitchGame('dice')}
          className={`py-3 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap ${
            activeGame === 'dice'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Dices className="w-4 h-4 shrink-0" />
          <span>የዳይስ ጨዋታ</span>
        </button>

        <button
          type="button"
          onClick={() => handleSwitchGame('coin')}
          className={`py-3 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap ${
            activeGame === 'coin'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Coins className="w-4 h-4 shrink-0" />
          <span>የሳንቲም ውርርድ</span>
        </button>

        <button
          type="button"
          onClick={() => handleSwitchGame('lucky')}
          className={`py-3 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap ${
            activeGame === 'lucky'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>የእድል ቁጥር (1-20)</span>
        </button>
      </div>

      {/* Main Arena Surface */}
      <section className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white">
              {activeGame === 'dice' && 'የዳይስ ጨዋታ (1 - 100)'}
              {activeGame === 'coin' && 'የሳንቲም ውርርድ (ዘውድ ወይም ጎራዴ)'}
              {activeGame === 'lucky' && 'የእድል ቁጥር (ከ 1 እስከ 20)'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              {activeGame === 'dice' && 'ቀላል ምርጫ ይምረጡ እና ዳይሱን ይወርውሩ'}
              {activeGame === 'coin' &&
                `ዘውድ ወይም ጎራዴ ይምረጡ — ትክክል ከሆኑ ${activeConfig.coinOdds}x ያሸንፋሉ`}
              {activeGame === 'lucky' &&
                `ከ 1 እስከ 20 አንድ ቁጥር ይምረጡ — ካሸነፉ ${activeConfig.luckyOdds}x ያገኛሉ`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono-num text-sm font-bold text-emerald-400">
              ሽልማት · {currentMultiplier}x
            </span>
            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'ድምጽ አጥፋ' : 'ድምጽ አብራ'}
              className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-200 transition cursor-pointer"
            >
              {soundEnabled ? (
                <Volume2 className="w-5 h-5 text-amber-400" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-500" />
              )}
            </button>
          </div>
        </div>

        {/* DICE PANEL */}
        {activeGame === 'dice' && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
              {(
                [
                  ['single', 'ባለ 1 ዳይስ (1-6)'],
                  ['double', 'ባለ 2 ዳይስ (2-12)'],
                  ['d100', 'ባለ 100 ዳይስ (1-100)'],
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
                  className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
                    diceSubMode === mode
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Visual Stage */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl py-7 px-4 flex flex-col items-center justify-center min-h-[200px] perspective-container">
              {diceSubMode === 'single' && <DiceVisual value={singleFace} rolling={isRolling} size="lg" />}

              {diceSubMode === 'double' && (
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-5">
                    <DiceVisual value={doubleFaces[0]} rolling={isRolling} size="md" />
                    <DiceVisual value={doubleFaces[1]} rolling={isRolling} size="md" />
                  </div>
                  <p className="mt-3 font-mono-num text-sm font-bold text-amber-400">
                    ድምር: {doubleFaces[0] + doubleFaces[1]} ({doubleFaces[0]} + {doubleFaces[1]})
                  </p>
                </div>
              )}

              {diceSubMode === 'd100' && (
                <div className="w-36 h-32 rounded-3xl bg-slate-900 border-2 border-amber-500/60 flex flex-col items-center justify-center">
                  <span className="text-xs font-semibold text-slate-400">D100 ቁጥር</span>
                  <span className="font-mono-num text-5xl font-black text-amber-400 mt-0.5">
                    {d100Display}
                  </span>
                </div>
              )}

              <p className="mt-4 text-sm font-semibold text-slate-300 text-center">{statusLabel}</p>
            </div>

            {/* Single Dice Controls */}
            {diceSubMode === 'single' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (isRolling) return;
                      playGameSound('click', soundEnabled);
                      setSingleMode('low');
                    }}
                    className={`p-3.5 rounded-2xl border-2 flex flex-col items-center transition cursor-pointer ${
                      singleMode === 'low'
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <span className="text-base font-extrabold">ዝቅተኛ (1 - 3)</span>
                    <span className="text-xs text-slate-400 mt-0.5">
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
                    className={`p-3.5 rounded-2xl border-2 flex flex-col items-center transition cursor-pointer ${
                      singleMode === 'high'
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <span className="text-base font-extrabold">ከፍተኛ (4 - 6)</span>
                    <span className="text-xs text-slate-400 mt-0.5">
                      ሽልማት: {activeConfig.singleDiceRangeOdds}x
                    </span>
                  </button>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-2">
                    ወይም ትክክለኛ ቁጥር ይምረጡ ({activeConfig.singleDiceExactOdds}x)
                  </p>
                  <div className="grid grid-cols-6 gap-2">
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
                        className={`py-3 rounded-xl border-2 font-mono-num font-black text-lg transition cursor-pointer ${
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
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2.5">
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
                      className={`p-3 rounded-2xl border-2 flex flex-col items-center transition cursor-pointer ${
                        doubleMode === mode
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                          : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <span className="text-sm sm:text-base font-extrabold">{title}</span>
                      <span className="text-xs text-slate-400">{mult}</span>
                    </button>
                  ))}
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-2">ወይም ትክክለኛ ድምር ይምረጡ (2 - 12)</p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
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
                          className={`p-2.5 rounded-xl border-2 flex flex-col items-center transition cursor-pointer ${
                            active
                              ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                              : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-200'
                          }`}
                        >
                          <span className="font-mono-num text-base font-black">{sumVal}</span>
                          <span className="text-[11px] font-bold text-emerald-400">{mult}x</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* D100 Controls */}
            {diceSubMode === 'd100' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
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
                        className={`p-2.5 rounded-xl border-2 flex flex-col items-center transition cursor-pointer ${
                          active
                            ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                            : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-200'
                        }`}
                      >
                        <span className="font-mono-num text-xs font-black">{preset.label}</span>
                        <span className="text-xs font-bold text-emerald-400">{preset.mult}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
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
          <div className="space-y-6">
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl py-8 px-4 flex flex-col items-center justify-center min-h-[200px] perspective-container">
              <div
                className={`w-28 h-28 rounded-full bg-gradient-to-br from-amber-300 via-amber-500 to-amber-700 border-4 border-amber-200 flex flex-col items-center justify-center text-slate-950 shadow-xl ${
                  isRolling ? 'animate-coin-flip' : ''
                }`}
              >
                {coinFace === 'heads' ? (
                  <Crown className="w-9 h-9" />
                ) : (
                  <Swords className="w-9 h-9" />
                )}
                <span className="text-sm font-black mt-1">
                  {coinFace === 'heads' ? 'ዘውድ' : 'ጎራዴ'}
                </span>
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-300">{statusLabel}</p>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <button
                type="button"
                onClick={() => {
                  if (isRolling) return;
                  playGameSound('click', soundEnabled);
                  setCoinChoice('heads');
                }}
                className={`p-4 rounded-2xl border-2 flex items-center justify-center gap-3 transition cursor-pointer ${
                  coinChoice === 'heads'
                    ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                }`}
              >
                <Crown className="w-6 h-6" />
                <span className="text-base font-extrabold">ዘውድ (Heads)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isRolling) return;
                  playGameSound('click', soundEnabled);
                  setCoinChoice('tails');
                }}
                className={`p-4 rounded-2xl border-2 flex items-center justify-center gap-3 transition cursor-pointer ${
                  coinChoice === 'tails'
                    ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                }`}
              >
                <Swords className="w-6 h-6" />
                <span className="text-base font-extrabold">ጎራዴ (Tails)</span>
              </button>
            </div>
          </div>
        )}

        {/* LUCKY 1-20 PANEL */}
        {activeGame === 'lucky' && (
          <div className="space-y-6">
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl py-8 px-4 flex flex-col items-center justify-center min-h-[200px]">
              <div className="w-28 h-28 rounded-3xl bg-slate-900 border-2 border-amber-500/60 flex items-center justify-center">
                <span className="font-mono-num text-5xl font-black text-amber-400">
                  {luckyDisplay}
                </span>
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-300">{statusLabel}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-400 mb-2.5">የእድል ቁጥርዎን ይምረጡ (1 - 20)</p>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      if (isRolling) return;
                      playGameSound('click', soundEnabled);
                      setLuckyChoice(num);
                    }}
                    className={`py-3 rounded-xl border-2 font-mono-num text-base font-black transition cursor-pointer ${
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
            className={`p-4 rounded-2xl border flex items-center justify-center gap-3 text-center ${
              lastOutcome.won
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
            }`}
          >
            {lastOutcome.won ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-6 h-6 text-rose-400 shrink-0" />
            )}
            <div>
              <p className="text-base sm:text-lg font-extrabold">{lastOutcome.title}</p>
              <p className="text-xs sm:text-sm opacity-90 mt-0.5">{lastOutcome.subtitle}</p>
            </div>
          </div>
        )}

        {/* Bet Amount & Play Action */}
        <div className="pt-5 border-t border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="betAmountInput" className="text-xs font-bold text-slate-400">
                የመወራረጃ መጠን (በብር)
              </label>
              <span className="text-[11px] font-mono-num text-slate-500">
                ዝቅተኛ: {minBet.toLocaleString()} ብር · ያለ ገደብ (Unlimited)
              </span>
            </div>
            <span className="font-mono-num text-xs sm:text-sm font-bold text-emerald-400">
              ሊያሸንፉ የሚችሉት: {formatETB(potentialWin)} ({currentMultiplier}x)
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                id="betAmountInput"
                type="number"
                min={minBet}
                step={1}
                value={betInput}
                onChange={(e) => setBetInput(e.target.value)}
                disabled={isRolling}
                className="w-full bg-slate-950 border-2 border-slate-700 focus:border-amber-500 rounded-2xl px-4 py-3.5 text-xl font-mono-num font-black text-white outline-none transition pr-14"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                ብር
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {[25, 50, 100, 250].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    if (isRolling) return;
                    playGameSound('click', soundEnabled);
                    setBetInput(String(preset));
                  }}
                  className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono-num font-bold text-slate-200 transition cursor-pointer"
                >
                  {preset}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  if (isRolling) return;
                  playGameSound('click', soundEnabled);
                  setBetInput(String(Math.floor(wallet.balance)));
                }}
                className="px-3 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold text-amber-400 transition cursor-pointer whitespace-nowrap"
              >
                ሁሉንም
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={isRolling}
            onClick={handlePlay}
            className="w-full py-4 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-black text-lg flex items-center justify-center gap-2.5 transition cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>
              {isRolling
                ? 'እየተጫወተ ነው...'
                : activeGame === 'dice'
                  ? `ዳይሱን ወርውር (${numericBet} ብር)`
                  : activeGame === 'coin'
                    ? `ሳንቲሙን ገልብጥ (${numericBet} ብር)`
                    : `እድልህን ሞክር (${numericBet} ብር)`}
            </span>
          </button>
        </div>
      </section>

      <GamingTips
        activeConfig={activeConfig}
        walletBalance={wallet.balance}
        isRolling={isRolling}
        onApplyStrategy={handleApplyStrategy}
      />
    </div>
  );
};
