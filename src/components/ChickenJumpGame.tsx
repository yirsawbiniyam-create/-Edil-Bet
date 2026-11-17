import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Coins,
  Footprints,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  CHICKEN_DIFFICULTY_SPECS,
  ChickenHazardKind,
  ChickenRoundPlan,
  DEFAULT_GAME_CONFIG,
  formatETB,
  generateChickenRoundPlan,
} from '../lib/gameEngine';
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

const QUICK_STAKES = [10, 25, 50, 100, 250, 500];

const ChickenMascotSVG: React.FC<{ jumping: boolean; crashed: boolean }> = ({
  jumping,
  crashed,
}) => (
  <svg
    viewBox="0 0 64 64"
    className={`w-10 h-10 sm:w-13 sm:h-13 drop-shadow-[0_5px_8px_rgba(0,0,0,0.45)] transition-transform duration-200 ${
      jumping
        ? '-translate-y-3 scale-110 -rotate-6'
        : crashed
          ? 'rotate-90 opacity-85 scale-90'
          : 'translate-y-0'
    }`}
    aria-hidden="true"
  >
    <path
      d="M26 48 L24 57 M24 57 L20 58 M24 57 L28 58"
      stroke="#F59E0B"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <path
      d="M38 48 L40 57 M40 57 L36 58 M40 57 L44 58"
      stroke="#F59E0B"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <path
      d="M15 34 C9 29, 8 22, 14 23 C12 18, 18 17, 21 24 Z"
      fill="#F59E0B"
      stroke="#92400E"
      strokeWidth="1.5"
    />
    <ellipse cx="31" cy="36" rx="15" ry="13" fill="#FFFBEB" stroke="#D97706" strokeWidth="2" />
    <path
      d={jumping ? 'M22 33 C17 24, 29 22, 33 32 Z' : 'M23 35 C20 42, 33 43, 35 35 Z'}
      fill="#FDE68A"
      stroke="#D97706"
      strokeWidth="1.6"
    />
    <path
      d="M33 14 C33 9, 38 9, 39 13 C41 9, 46 10, 45 15 C47 14, 49 17, 45 20 L34 20 Z"
      fill="#EF4444"
      stroke="#991B1B"
      strokeWidth="1.3"
    />
    <circle cx="39" cy="24" r="9.5" fill="#FFFBEB" stroke="#D97706" strokeWidth="2" />
    <polygon points="47,22 56,25 47,28" fill="#F59E0B" stroke="#B45309" strokeWidth="1.3" />
    <ellipse cx="45" cy="30" rx="2.3" ry="3.2" fill="#EF4444" />
    {crashed ? (
      <path d="M40 21 L44 25 M44 21 L40 25" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" />
    ) : (
      <>
        <circle cx="42" cy="22.5" r="2.2" fill="#0F172A" />
        <circle cx="42.7" cy="21.8" r="0.7" fill="#FFFFFF" />
      </>
    )}
  </svg>
);

const HazardIcon: React.FC<{ kind: ChickenHazardKind; crashedHere: boolean }> = ({
  kind,
  crashedHere,
}) => {
  if (kind === 'truck') {
    return (
      <div
        className={`flex flex-col items-center justify-center ${
          crashedHere ? 'scale-110' : 'opacity-85'
        }`}
      >
        <div className="w-9 h-6 sm:w-11 sm:h-7 rounded-md bg-rose-600 border-2 border-rose-300 flex items-center justify-between px-1 shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />
          <span className="text-[8px] sm:text-[9px] font-black text-white tracking-tighter">
            STOP
          </span>
          <span className="w-1.5 h-2.5 rounded-xs bg-sky-200" />
        </div>
        <div className="flex items-center justify-between w-7 sm:w-9 -mt-0.5">
          <span className="w-2 h-2 rounded-full bg-slate-950 border border-slate-400" />
          <span className="w-2 h-2 rounded-full bg-slate-950 border border-slate-400" />
        </div>
      </div>
    );
  }
  if (kind === 'cart') {
    return (
      <div className="w-8 h-7 sm:w-10 sm:h-8 rounded-lg bg-amber-600 border-2 border-amber-300 flex items-center justify-center shadow-md">
        <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
      </div>
    );
  }
  return (
    <div className="w-8 h-7 sm:w-10 sm:h-8 rounded-lg bg-rose-700 border-2 border-amber-400 flex items-center justify-center shadow-md">
      <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300" />
    </div>
  );
};

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
  const [roundPlan, setRoundPlan] = useState<ChickenRoundPlan | null>(null);
  const [activeStake, setActiveStake] = useState<number>(50);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [crashedLane, setCrashedLane] = useState<number | null>(null);
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

  const isInActiveRun = phase === 'JUMPING' || phase === 'STEP_SAFE';
  const showHazards = phase === 'CRASHED' || phase === 'FINISHED';

  const laneGridColsClass =
    multipliers.length >= 10
      ? 'grid-cols-5'
      : multipliers.length >= 8
        ? 'grid-cols-4'
        : 'grid-cols-3';

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
    targetStep: number,
    plan: ChickenRoundPlan,
    stake: number,
  ) => {
    setPhase('JUMPING');
    playGameSound('roll', soundEnabled);

    hopTimeoutRef.current = window.setTimeout(() => {
      setCurrentStep(targetStep);

      if (targetStep <= plan.maxSafeStep) {
        const landedMult = plan.multipliers[targetStep - 1];
        if (targetStep === plan.multipliers.length) {
          const fullPayout = Number((stake * landedMult).toFixed(2));
          setPhase('FINISHED');
          void commitChickenBetToFirestore({
            stake,
            won: true,
            multiplier: landedMult,
            payout: fullPayout,
            choiceText: `${CHICKEN_DIFFICULTY_SPECS[plan.difficulty].labelAm} · ሙሉ መስመር (${targetStep}/${plan.multipliers.length})`,
            resultText: `ሁሉንም ${targetStep} መስመሮች በድል አለፈ! (${landedMult}x)`,
          });
        } else {
          playGameSound('click', soundEnabled);
          setPhase('STEP_SAFE');
        }
      } else {
        setCrashedLane(targetStep);
        setPhase('CRASHED');
        const safeReached = Math.max(0, targetStep - 1);
        void commitChickenBetToFirestore({
          stake,
          won: false,
          multiplier: 1,
          payout: 0,
          choiceText: `${CHICKEN_DIFFICULTY_SPECS[plan.difficulty].labelAm} · መስመር ${targetStep}`,
          resultText: `በመስመር ${targetStep} ላይ እንቅፋት ገጠመው (${safeReached} መስመር አልፎ ነበር)`,
        });
      }
    }, 220);
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

      {/* Mobile-Fit Pro Chicken Jump Cockpit */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-3 sm:p-6 space-y-3 sm:space-y-4 text-white shadow-xl">
        {/* Compact Game Cockpit HUD */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5 sm:pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center shrink-0">
              <Footprints className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-xl font-black tracking-tight text-white truncate">
                {bi('ዶሮ ዝላይ ውርርድ', 'Chicken Jump')}
              </h2>
              <p className="text-[11px] text-slate-400 font-mono-num truncate">
                {bi('ቀሪ:', 'Bal:')} <strong className="text-emerald-400">{formatETB(wallet.balance)}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-right">
              <span className="text-[10px] text-slate-400 block leading-tight">
                {bi('መባዣ', 'Mult')}
              </span>
              <span className="font-mono-num tabular-nums text-sm sm:text-base font-black text-emerald-400 leading-tight">
                {currentMultiplier.toFixed(2)}x
              </span>
            </div>

            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? bi('ድምጽ አጥፋ', 'Mute') : bi('ድምጽ አብራ', 'Unmute')}
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

        {/* Difficulty Selector (Single Compact Row) */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
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

        {/* Full-Screen-Fit Interactive Road Board (All Lanes Visible Without Sideways Cut-off) */}
        <div className="rounded-2xl bg-[#0F2419] border-2 border-emerald-500/25 p-2.5 sm:p-4 space-y-2.5">
          {/* Live Status & Progress Bar */}
          <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs">
            <span className="font-bold text-emerald-300 flex items-center gap-1.5 min-w-0 truncate">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">
                {phase === 'READY' &&
                  bi('መጠን መርጠው "ጀምርና ዝለል" ይጫኑ', 'Pick stake & tap Start Jump')}
                {phase === 'JUMPING' &&
                  bi('ዶሮዋ እየዘለለች ነው...', 'Chicken is jumping...')}
                {phase === 'STEP_SAFE' &&
                  bi(
                    `መስመር ${currentStep} ሰላም! ${formatETB(cashoutPayout)} ማውጣት ይችላሉ`,
                    `Safe on #${currentStep}! Cashout ${formatETB(cashoutPayout)}`,
                  )}
                {phase === 'CRASHED' &&
                  bi(
                    `በመስመር #${crashedLane ?? ''} ላይ መኪና ገጠመው`,
                    `Hit traffic on Lane #${crashedLane ?? ''}`,
                  )}
                {phase === 'FINISHED' &&
                  bi('በድል ተጠናቋል!', 'Round completed!')}
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

          {/* Responsive Full-Board Road Grid */}
          <div className={`grid ${laneGridColsClass} gap-1.5 sm:gap-2.5`}>
            {multipliers.map((mult, idx) => {
              const stepNum = idx + 1;
              const isChickenHere = currentStep === stepNum;
              const isCleared = currentStep > stepNum || (isChickenHere && phase !== 'CRASHED');
              const isNextTarget = phase === 'STEP_SAFE' && stepNum === currentStep + 1;
              const isCrashSpot = crashedLane === stepNum;
              const isSafeLaneInPlan = roundPlan ? stepNum <= roundPlan.maxSafeStep : true;
              const hazardKind = roundPlan?.laneHazards[idx] ?? 'truck';

              return (
                <button
                  key={stepNum}
                  type="button"
                  disabled={!isNextTarget || isSaving}
                  onClick={() => {
                    if (isNextTarget) {
                      handleJumpNext();
                    }
                  }}
                  className={`min-h-[78px] sm:min-h-[106px] rounded-xl sm:rounded-2xl border-2 flex flex-col items-center justify-between p-1.5 sm:p-2.5 relative transition active:scale-[0.97] ${
                    isCrashSpot
                      ? 'border-rose-500 bg-rose-950/85'
                      : isChickenHere
                        ? 'border-amber-400 bg-slate-800 shadow-[0_0_16px_rgba(245,158,11,0.28)]'
                        : isNextTarget
                          ? 'border-emerald-400 bg-emerald-950/60 hover:bg-emerald-900/60 cursor-pointer'
                          : isCleared
                            ? 'border-emerald-500/45 bg-emerald-950/35'
                            : 'border-slate-700/80 bg-[#18222F]'
                  }`}
                >
                  {/* Lane # & Status Icon */}
                  <div className="w-full flex items-center justify-between text-[10px] font-mono-num font-bold leading-none">
                    <span className="text-slate-400">#{stepNum}</span>
                    {isCleared && !isCrashSpot && (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    )}
                    {isCrashSpot && <XCircle className="w-3 h-3 text-rose-400" />}
                    {stepNum === multipliers.length && !isCrashSpot && !isCleared && (
                      <Trophy className="w-3 h-3 text-amber-400" />
                    )}
                  </div>

                  {/* Center Chicken / Hazard / Multiplier Coin */}
                  <div className="flex-1 w-full flex items-center justify-center relative my-0.5">
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-1 top-1/2 -translate-y-1/2 border-t border-dashed border-slate-600/50"
                    />
                    <div className="relative z-10 flex items-center justify-center">
                      {isChickenHere ? (
                        <ChickenMascotSVG jumping={phase === 'JUMPING'} crashed={isCrashSpot} />
                      ) : showHazards && !isSafeLaneInPlan ? (
                        <HazardIcon kind={hazardKind} crashedHere={isCrashSpot} />
                      ) : (
                        <div
                          className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 flex items-center justify-center ${
                            isCleared
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                              : isNextTarget
                                ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                                : 'bg-slate-900/90 border-slate-600 text-amber-300'
                          }`}
                        >
                          <span className="font-mono-num tabular-nums text-[10px] sm:text-xs font-black">
                            {mult}x
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bottom ETB Payout */}
                  <span
                    className={`font-mono-num tabular-nums text-[10px] sm:text-[11px] font-bold leading-none ${
                      isCrashSpot
                        ? 'text-rose-300'
                        : isCleared
                          ? 'text-emerald-300'
                          : 'text-slate-300'
                    }`}
                  >
                    {Math.round(lockedBet * mult).toLocaleString()} {bi('ብር', 'ETB')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Compact Outcome Toast Banner */}
        {roundResult && (
          <div
            className={`px-3.5 py-2.5 rounded-xl border flex items-center justify-center gap-2.5 text-center ${
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
        <div className="pt-2.5 border-t border-slate-800 space-y-2.5">
          {!isInActiveRun ? (
            <>
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

              <div className="grid grid-cols-6 gap-1.5">
                {QUICK_STAKES.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                      playGameSound('click', soundEnabled);
                      setBetInput(String(preset));
                    }}
                    className={`min-h-[38px] py-1.5 rounded-lg text-xs font-mono-num font-black transition cursor-pointer active:scale-[0.96] ${
                      numericBet === preset
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
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

        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
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
