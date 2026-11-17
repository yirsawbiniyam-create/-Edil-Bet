import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  Coins,
  Footprints,
  Play,
  RotateCcw,
  Sparkles,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  CHICKEN_DIFFICULTY_SPECS,
  ChickenRoundPlan,
  DEFAULT_GAME_CONFIG,
  formatETB,
  generateChickenRoundPlan,
} from '../lib/gameEngine';
import { ChickenAsphaltStage } from './ChickenAsphaltStage';
import { ChickenVideoBackdrop } from './ChickenVideoBackdrop';
import { recordGameBet } from '../lib/firestoreService';
import { useLanguage } from '../lib/i18n';
import { playGameSound } from '../lib/sound';
import { ChickenDifficulty, GameConfig, TelebirrSettings, UserWallet } from '../types';

interface ChickenJumpGameProps {
  uid: string;
  wallet: UserWallet;
  settings: TelebirrSettings | null;
  gameConfig: GameConfig | null;
  soundEnabled: boolean;
  initialStake?: number;
  onToggleSound: () => void;
  onGoToDeposit: () => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
  onWinCelebrate?: () => void;
}

type ChickenPhase = 'READY' | 'JUMPING' | 'STEP_SAFE' | 'CRASHED' | 'FINISHED';

const QUICK_STAKES = [10, 50, 100, 250, 500, 1000];

export const ChickenJumpGame: React.FC<ChickenJumpGameProps> = ({
  uid,
  wallet,
  settings,
  gameConfig,
  soundEnabled,
  initialStake,
  onToggleSound,
  onGoToDeposit,
  onNotify,
  onWinCelebrate,
}) => {
  const { bi } = useLanguage();
  const hopTimeoutRef = useRef<number | null>(null);

  const [difficulty, setDifficulty] = useState<ChickenDifficulty>('easy');
  const [betInput, setBetInput] = useState<string>(() =>
    initialStake && initialStake >= 10 ? String(initialStake) : '50',
  );
  const [phase, setPhase] = useState<ChickenPhase>('READY');
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [targetStep, setTargetStep] = useState<number>(0);
  const [roundPlan, setRoundPlan] = useState<ChickenRoundPlan | null>(null);
  const [activeStake, setActiveStake] = useState<number>(50);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [crashedLane, setCrashedLane] = useState<number | null>(null);
  const [videoFxEnabled, setVideoFxEnabled] = useState<boolean>(true);
  const [roundResult, setRoundResult] = useState<{
    won: boolean;
    title: string;
    subtitle: string;
  } | null>(null);

  useEffect(() => {
    if (
      initialStake &&
      initialStake >= 1 &&
      (phase === 'READY' || phase === 'CRASHED' || phase === 'FINISHED')
    ) {
      setBetInput(String(initialStake));
    }
  }, [initialStake, phase]);

  useEffect(() => {
    return () => {
      if (hopTimeoutRef.current !== null) {
        window.clearTimeout(hopTimeoutRef.current);
      }
    };
  }, []);

  const activeConfig = gameConfig ?? DEFAULT_GAME_CONFIG;
  const houseWinRate =
    gameConfig?.houseWinRate ?? settings?.houseWinRate ?? DEFAULT_GAME_CONFIG.houseWinRate;
  const minBet = activeConfig.minBet;
  const spec = CHICKEN_DIFFICULTY_SPECS[difficulty];
  const multipliers = roundPlan ? roundPlan.multipliers : spec.multipliers;

  const numericBet = Math.max(0, parseFloat(betInput) || 0);
  const lockedBet =
    phase === 'READY' || phase === 'CRASHED' || phase === 'FINISHED' ? numericBet : activeStake;

  const currentMultiplier = useMemo(() => {
    if (currentStep <= 0) return 1;
    const idx = Math.min(currentStep - 1, multipliers.length - 1);
    return multipliers[idx] ?? 1;
  }, [currentStep, multipliers]);

  const nextStep = currentStep + 1;
  const hasNextLane = nextStep <= multipliers.length;
  const nextMultiplier = hasNextLane ? multipliers[nextStep - 1] : currentMultiplier;
  const cashoutPayout = Number((lockedBet * currentMultiplier).toFixed(2));
  const nextPotentialPayout = Number((lockedBet * nextMultiplier).toFixed(2));
  const firstLaneMult = multipliers[0] ?? 1.15;
  const maxLaneMult = multipliers[multipliers.length - 1] ?? 1;
  const firstLanePayout = Number((numericBet * firstLaneMult).toFixed(2));
  const maxPotentialPayout = Number((numericBet * maxLaneMult).toFixed(2));
  const netMaxProfit = Math.max(0, Number((maxPotentialPayout - numericBet).toFixed(2)));

  const isInActiveRun = phase === 'JUMPING' || phase === 'STEP_SAFE';
  const defaultHazards = useMemo(
    () => multipliers.map((_, idx) => (['taxi', 'truck', 'cart'][idx % 3] === 'taxi' ? 'cone' : idx % 2 === 0 ? 'truck' : 'cart') as 'truck' | 'cone' | 'cart'),
    [multipliers],
  );

  const progressPercent = Math.round((currentStep / multipliers.length) * 100);

  const commitChickenBetToFirestore = async (params: {
    stake: number;
    won: boolean;
    multiplier: number;
    payout: number;
    choiceText: string;
    resultText: string;
  }) => {
    setIsSaving(true);
    try {
      await recordGameBet({
        uid,
        wallet,
        gameConfig,
        gameType: 'chicken',
        gameName: bi('ዶሮ ዝላይ (Chicken Jump)', 'Chicken Jump'),
        betAmount: params.stake,
        multiplier: Math.max(1, params.multiplier),
        choiceText: params.choiceText,
        resultText: params.resultText,
        won: params.won,
        payout: params.payout,
      });

      if (params.won) {
        playGameSound('win', soundEnabled);
        onWinCelebrate?.();
        setRoundResult({
          won: true,
          title: bi(
            `አሸንፈዋል! +${formatETB(params.payout)}`,
            `Won +${formatETB(params.payout)}!`,
          ),
          subtitle: params.resultText,
        });
      } else {
        playGameSound('lose', soundEnabled);
        setRoundResult({
          won: false,
          title: bi(
            `መኪና ገጭቶታል (-${formatETB(params.stake)})`,
            `Traffic hit (-${formatETB(params.stake)})`,
          ),
          subtitle: params.resultText,
        });
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : bi('ውጤቱን በፋየርስቶር ላይ ማስቀመጥ አልተቻለም።', 'Failed to save round in Firestore.');
      onNotify(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const executeHopToStep = (
    hopTarget: number,
    plan: ChickenRoundPlan,
    stake: number,
  ) => {
    setTargetStep(hopTarget);
    setPhase('JUMPING');
    playGameSound('roll', soundEnabled);

    hopTimeoutRef.current = window.setTimeout(() => {
      setCurrentStep(hopTarget);

      if (hopTarget <= plan.maxSafeStep) {
        const landedMult = plan.multipliers[hopTarget - 1];
        if (hopTarget === plan.multipliers.length) {
          const fullPayout = Number((stake * landedMult).toFixed(2));
          setPhase('FINISHED');
          void commitChickenBetToFirestore({
            stake,
            won: true,
            multiplier: landedMult,
            payout: fullPayout,
            choiceText: `${CHICKEN_DIFFICULTY_SPECS[plan.difficulty].labelAm} · ሙሉ መስመር (${hopTarget}/${plan.multipliers.length})`,
            resultText: `ሁሉንም ${hopTarget} መስመሮች በድል አለፈ! (${landedMult}x)`,
          });
        } else {
          playGameSound('click', soundEnabled);
          setPhase('STEP_SAFE');
        }
      } else {
        setCrashedLane(hopTarget);
        setPhase('CRASHED');
        const safeReached = Math.max(0, hopTarget - 1);
        void commitChickenBetToFirestore({
          stake,
          won: false,
          multiplier: 1,
          payout: 0,
          choiceText: `${CHICKEN_DIFFICULTY_SPECS[plan.difficulty].labelAm} · መስመር ${hopTarget}`,
          resultText: `በመስመር ${hopTarget} ላይ መኪና ገጭቶታል (${safeReached} መስመር አልፎ ነበር)`,
        });
      }
    }, 340);
  };

  const handleStartRound = () => {
    if (isInActiveRun || isSaving) return;
    if (!Number.isFinite(numericBet) || numericBet < minBet) {
      onNotify(
        bi(
          `ዝቅተኛው የመወራረጃ መጠን ${minBet} ብር ነው።`,
          `Minimum stake is ${minBet} ETB.`,
        ),
        'error',
      );
      return;
    }
    if (wallet.balance < numericBet) {
      onNotify(
        bi(
          'በቂ ቀሪ ሂሳብ የለዎትም! እባክዎ በቴሌብር ዲፖሲት ያድርጉ።',
          'Insufficient balance! Please deposit via Telebirr first.',
        ),
        'error',
      );
      return;
    }

    const plan = generateChickenRoundPlan(difficulty, houseWinRate);
    setRoundPlan(plan);
    setActiveStake(numericBet);
    setCurrentStep(0);
    setTargetStep(1);
    setCrashedLane(null);
    setRoundResult(null);

    executeHopToStep(1, plan, numericBet);
  };

  const handleJumpNext = () => {
    if (phase !== 'STEP_SAFE' || !roundPlan || isSaving || !hasNextLane) return;
    executeHopToStep(nextStep, roundPlan, activeStake);
  };

  const handleCashout = async () => {
    if (phase !== 'STEP_SAFE' || !roundPlan || isSaving || currentStep < 1) return;
    if (wallet.balance < activeStake) {
      onNotify(
        bi(
          'ቀሪ ሂሳብዎ ስለተቀየረ ውርርዱን ማጠናቀቅ አልተቻለም።',
          'Balance changed; could not settle bet.',
        ),
        'error',
      );
      setPhase('READY');
      return;
    }

    const wonMult = roundPlan.multipliers[currentStep - 1];
    const payout = Number((activeStake * wonMult).toFixed(2));
    setPhase('FINISHED');
    await commitChickenBetToFirestore({
      stake: activeStake,
      won: true,
      multiplier: wonMult,
      payout,
      choiceText: `${CHICKEN_DIFFICULTY_SPECS[roundPlan.difficulty].labelAm} · Cashout መስመር ${currentStep}/${roundPlan.multipliers.length}`,
      resultText: `በመስመር ${currentStep} ላይ በ${wonMult}x በሰላም ወጣ (+${formatETB(payout)})`,
    });
  };

  const handleResetToReady = () => {
    if (isInActiveRun || isSaving) return;
    playGameSound('click', soundEnabled);
    setPhase('READY');
    setCurrentStep(0);
    setTargetStep(0);
    setRoundPlan(null);
    setCrashedLane(null);
    setRoundResult(null);
  };

  const adjustStakeByFactor = (factor: number) => {
    if (isInActiveRun || isSaving) return;
    playGameSound('click', soundEnabled);
    const next = Math.max(minBet, Math.floor((numericBet || minBet) * factor));
    const capped = wallet.balance >= minBet ? Math.min(next, Math.floor(wallet.balance)) : next;
    setBetInput(String(Math.max(minBet, capped)));
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Compact Low Balance Alert */}
      {wallet.balance < minBet && (
        <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-3 sm:p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-black text-amber-400 truncate">
              {bi('ለመጫወት ዲፖሲት ያድርጉ', 'Deposit to Play Chicken Jump')}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-300 truncate">
              {bi(`ቀሪ ሂሳብ: ${formatETB(wallet.balance)}`, `Balance: ${formatETB(wallet.balance)}`)}
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToDeposit}
            className="shrink-0 min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>{bi('ዲፖሲት', 'Deposit')}</span>
          </button>
        </div>
      )}

      {/* Mobile-Fit Pro Chicken Jump Cockpit with Dynamic Video Highway Backdrop */}
      <section className="relative overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-3 sm:p-6 space-y-3 sm:space-y-4 text-white shadow-xl">
        <ChickenVideoBackdrop phase={phase} enabled={videoFxEnabled} />

        {/* Compact Game Cockpit HUD */}
        <div className="relative z-10 flex items-center justify-between gap-2 border-b border-slate-800/90 pb-2.5 sm:pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center shrink-0">
              <Footprints className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-xl font-black tracking-tight text-white truncate">
                {bi('ዶሮ ዝላይ ውርርድ', 'Chicken Jump')}
              </h2>
              <p className="text-[11px] text-slate-300 font-mono-num truncate">
                {bi('ቀሪ:', 'Bal:')} <strong className="text-emerald-400">{formatETB(wallet.balance)}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl px-2.5 py-1 text-right">
              <span className="text-[10px] text-slate-400 block leading-tight">
                {bi('መባዣ', 'Mult')}
              </span>
              <span className="font-mono-num tabular-nums text-sm sm:text-base font-black text-emerald-400 leading-tight">
                {currentMultiplier.toFixed(2)}x
              </span>
            </div>

            <button
              type="button"
              onClick={() => setVideoFxEnabled((prev) => !prev)}
              title={videoFxEnabled ? bi('የቪዲዮ ካሜራ አጥፋ', 'Hide Video FX') : bi('የቪዲዮ ካሜራ አብራ', 'Show Video FX')}
              aria-label={videoFxEnabled ? bi('የቪዲዮ ካሜራ አጥፋ', 'Disable video effects') : bi('የቪዲዮ ካሜራ አብራ', 'Enable video effects')}
              className="w-10 h-10 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-200 transition cursor-pointer shrink-0"
            >
              {videoFxEnabled ? (
                <Video className="w-4 h-4 text-emerald-400" />
              ) : (
                <VideoOff className="w-4 h-4 text-slate-500" />
              )}
            </button>

            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? bi('ድምጽ አጥፋ', 'Mute') : bi('ድምጽ አብራ', 'Unmute')}
              className="w-10 h-10 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-200 transition cursor-pointer shrink-0"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-amber-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-500" />
              )}
            </button>
          </div>
        </div>

        {/* Difficulty Selector (Single Compact Row) */}
        <div className="relative z-10 grid grid-cols-3 gap-1.5 sm:gap-2">
          {(['easy', 'medium', 'hard'] as ChickenDifficulty[]).map((diffKey) => {
            const item = CHICKEN_DIFFICULTY_SPECS[diffKey];
            const active = difficulty === diffKey;
            const maxMult = item.multipliers[item.multipliers.length - 1];
            return (
              <button
                key={diffKey}
                type="button"
                disabled={isInActiveRun || isSaving}
                onClick={() => {
                  if (isInActiveRun || isSaving) return;
                  playGameSound('click', soundEnabled);
                  setDifficulty(diffKey);
                  setRoundPlan(null);
                  setCurrentStep(0);
                  setTargetStep(0);
                  setPhase('READY');
                  setCrashedLane(null);
                  setRoundResult(null);
                }}
                className={`min-h-[44px] px-2 py-1.5 sm:p-2.5 rounded-xl border-2 text-center transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] ${
                  active
                    ? 'border-amber-500 bg-amber-500/15 text-white'
                    : 'border-slate-800 bg-slate-950/70 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="text-[11px] sm:text-xs font-black truncate">
                  {diffKey === 'easy'
                    ? bi('ቀላል', 'Easy')
                    : diffKey === 'medium'
                      ? bi('መካከለኛ', 'Medium')
                      : bi('ከባድ', 'Hard')}
                </div>
                <div className="font-mono-num tabular-nums text-[11px] sm:text-xs font-black text-emerald-400">
                  {item.multipliers.length}× · {maxMult}x
                </div>
              </button>
            );
          })}
        </div>

        {/* Video-Style Live Animated Asphalt Road Stage */}
        <div className="relative z-10 rounded-2xl bg-[#11161d]/95 border-2 border-slate-700/80 p-2.5 sm:p-4 space-y-2.5">
          {/* Live Status & Progress Bar */}
          <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs">
            <span className="font-bold text-emerald-300 flex items-center gap-1.5 min-w-0 truncate">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">
                {phase === 'READY' &&
                  bi('መጠን መርጠው "ጀምርና ዝለል" ይጫኑ — ዶሮዋ በአስፋልቱ ላይ ትዘላለች', 'Pick stake & tap Start Jump to cross the asphalt highway')}
                {phase === 'JUMPING' &&
                  bi('ዶሮዋ በአስፋልቱ ላይ እየዘለለች ነው...', 'Chicken is jumping across the asphalt...')}
                {phase === 'STEP_SAFE' &&
                  bi(
                    `መስመር ${currentStep} ሰላም! ${formatETB(cashoutPayout)} ማውጣት ይችላሉ`,
                    `Safe on #${currentStep}! Cashout ${formatETB(cashoutPayout)}`,
                  )}
                {phase === 'CRASHED' &&
                  bi(
                    `በመስመር #${crashedLane ?? ''} ላይ መኪና ገጭቶታል`,
                    `Hit by oncoming traffic on Lane #${crashedLane ?? ''}`,
                  )}
                {phase === 'FINISHED' &&
                  bi('ሁሉንም አስፋልት መስመር በድል አልፋለች!', 'Crossed the entire asphalt road safely!')}
              </span>
            </span>

            <span className="font-mono-num tabular-nums text-slate-300 font-bold shrink-0">
              {currentStep}/{multipliers.length}
            </span>
          </div>

          <div className="h-1.5 w-full rounded-full bg-slate-950/90 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                phase === 'CRASHED' ? 'bg-rose-500' : 'bg-emerald-400'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <ChickenAsphaltStage
            multipliers={multipliers}
            lockedBet={lockedBet}
            currentStep={currentStep}
            targetStep={targetStep}
            phase={phase}
            crashedLane={crashedLane}
            maxSafeStep={roundPlan ? roundPlan.maxSafeStep : null}
            laneHazards={roundPlan ? roundPlan.laneHazards : defaultHazards}
            currencyLabel={bi('ብር', 'ETB')}
            showVideoOverlay={videoFxEnabled}
            actionCamLabel={bi('የዝላይ ካሜራ', 'Jump Cam')}
            onTapNextLane={handleJumpNext}
          />

          {/* Compact Scannable Asphalt Lane Multiplier Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
            {multipliers.map((mult, idx) => {
              const stepNum = idx + 1;
              const isChickenHere = currentStep === stepNum;
              const isCleared = currentStep > stepNum || (isChickenHere && phase !== 'CRASHED');
              const isNextTarget = phase === 'STEP_SAFE' && stepNum === currentStep + 1;
              const isCrashSpot = crashedLane === stepNum;

              return (
                <button
                  key={stepNum}
                  type="button"
                  disabled={!isNextTarget || isSaving}
                  onClick={() => {
                    if (isNextTarget) handleJumpNext();
                  }}
                  className={`shrink-0 min-w-[54px] px-2 py-1.5 rounded-lg border text-center transition ${
                    isCrashSpot
                      ? 'bg-rose-950/80 border-rose-500 text-rose-300'
                      : isNextTarget
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 cursor-pointer'
                        : isCleared
                          ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-950/70 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="text-[9px] font-mono-num opacity-80 leading-none">
                    #{stepNum}
                  </div>
                  <div className="text-[11px] font-mono-num font-black leading-tight mt-0.5">
                    {mult}x
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Compact Outcome Toast Banner */}
        {roundResult && (
          <div
            className={`relative z-10 px-3.5 py-2.5 rounded-xl border flex items-center justify-center gap-2.5 text-center ${
              roundResult.won
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
            }`}
          >
            {roundResult.won ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm sm:text-base font-black truncate">{roundResult.title}</p>
              <p className="text-[11px] opacity-90 truncate">{roundResult.subtitle}</p>
            </div>
          </div>
        )}

        {/* Thumb-Zone Controls */}
        <div className="relative z-10 pt-2.5 border-t border-slate-800/90 space-y-2.5">
          {!isInActiveRun ? (
            <>
              {/* Stake Header + Live Potential Win Preview */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <label htmlFor="chickenStakeInput" className="font-bold text-slate-300">
                  {bi(`መደብ (ዝቅተኛ: ${minBet} ብር)`, `Stake (Min: ${minBet} ETB)`)}
                </label>
                <span className="font-mono-num tabular-nums font-extrabold text-emerald-400">
                  {bi('ሊያሸንፉ:', 'Potential Win:')}{' '}
                  {formatETB(firstLanePayout)} – {formatETB(maxPotentialPayout)}
                </span>
              </div>

              {/* Stake Input + ½ / 2x + Presets */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <input
                    id="chickenStakeInput"
                    type="number"
                    min={minBet}
                    step={1}
                    value={betInput}
                    onChange={(e) => setBetInput(e.target.value)}
                    disabled={isSaving}
                    aria-label={bi('የመወራረጃ መጠን', 'Bet Amount')}
                    className="w-full bg-slate-950 border-2 border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2.5 text-lg font-mono-num font-black text-white outline-none transition pr-11"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">
                    {bi('ብር', 'ETB')}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => adjustStakeByFactor(0.5)}
                  className="min-h-[46px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono-num font-black text-slate-200 cursor-pointer shrink-0 active:scale-[0.96]"
                >
                  ½
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => adjustStakeByFactor(2)}
                  className="min-h-[46px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono-num font-black text-slate-200 cursor-pointer shrink-0 active:scale-[0.96]"
                >
                  2×
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    playGameSound('click', soundEnabled);
                    setBetInput(String(Math.max(minBet, Math.floor(wallet.balance))));
                  }}
                  className="min-h-[46px] px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-black text-amber-300 cursor-pointer shrink-0 active:scale-[0.96]"
                >
                  {bi('ሁሉንም', 'All')}
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
                  {QUICK_STAKES.map((preset) => {
                    const isSelected = numericBet === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        disabled={isSaving}
                        aria-pressed={isSelected}
                        onClick={() => {
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

              {/* Dynamic Potential Win Breakdown */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950/85 border border-slate-800 rounded-xl px-3 py-2 text-xs">
                <div>
                  <span className="text-[11px] text-slate-400 block">
                    {bi(`መስመር #1 (${firstLaneMult}x)`, `Lane #1 (${firstLaneMult}x)`)}
                  </span>
                  <span className="font-mono-num tabular-nums font-extrabold text-slate-100">
                    {formatETB(firstLanePayout)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">
                    {bi(`ከፍተኛ ሽልማት (${maxLaneMult}x)`, `Max Win (${maxLaneMult}x)`)}
                  </span>
                  <span className="font-mono-num tabular-nums font-black text-emerald-400">
                    {formatETB(maxPotentialPayout)}{' '}
                    <span className="text-[10px] font-bold text-emerald-300/90">
                      (+{formatETB(netMaxProfit)})
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleStartRound}
                  className="flex-1 min-h-[52px] py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-black text-base flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer shadow-lg"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>
                    {isSaving
                      ? bi('በማስቀመጥ ላይ...', 'Saving...')
                      : phase === 'CRASHED' || phase === 'FINISHED'
                        ? bi(
                            `እንደገና ዝለል (${numericBet.toLocaleString()} ብር)`,
                            `Play Again (${numericBet.toLocaleString()} ETB)`,
                          )
                        : bi(
                            `ጀምርና ዝለል (${numericBet.toLocaleString()} ብር)`,
                            `Start Jump (${numericBet.toLocaleString()} ETB)`,
                          )}
                  </span>
                </button>

                {(phase === 'CRASHED' || phase === 'FINISHED') && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleResetToReady}
                    aria-label={bi('አጽዳ', 'Reset')}
                    className="min-h-[52px] px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center transition cursor-pointer shrink-0"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={phase !== 'STEP_SAFE' || isSaving || !hasNextLane}
                onClick={handleJumpNext}
                className="min-h-[56px] py-2.5 px-3 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-black text-sm sm:text-base flex flex-col items-center justify-center transition active:scale-[0.98] cursor-pointer shadow-lg"
              >
                <span className="flex items-center gap-1.5">
                  <Footprints className="w-4 h-4 shrink-0" />
                  <span>
                    {phase === 'JUMPING'
                      ? bi('እየዘለለ...', 'Jumping...')
                      : bi(`ቀጣይ #${nextStep} (${nextMultiplier.toFixed(2)}x)`, `Jump #${nextStep} (${nextMultiplier.toFixed(2)}x)`)}
                  </span>
                </span>
                <span className="text-[11px] font-mono-num font-bold opacity-85">
                  {formatETB(nextPotentialPayout)}
                </span>
              </button>

              <button
                type="button"
                disabled={phase !== 'STEP_SAFE' || isSaving || currentStep < 1}
                onClick={handleCashout}
                className="min-h-[56px] py-2.5 px-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-black text-sm sm:text-base flex flex-col items-center justify-center transition active:scale-[0.98] cursor-pointer shadow-lg"
              >
                <span className="flex items-center gap-1.5">
                  <Banknote className="w-4 h-4 shrink-0" />
                  <span>{isSaving ? bi('በመክፈል...', 'Paying...') : bi('ብር ውሰድ', 'Cashout')}</span>
                </span>
                <span className="text-[11px] font-mono-num font-bold opacity-90">
                  +{formatETB(cashoutPayout)}
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="relative z-10 flex items-center justify-between text-[11px] text-slate-300 pt-1">
          <span className="flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{bi('ቀጥታ ቀጣዩን መስመር መንካትም ይቻላል', 'Tap the glowing next lane or button')}</span>
          </span>
          <span className="font-mono-num">
            {bi('ዝቅተኛ:', 'Min:')} {minBet} {bi('ብር', 'ETB')}
          </span>
        </div>
      </section>
    </div>
  );
};
