import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  AlertCircle,
  CheckCircle2,
  Coins,
  ExternalLink,
  Eye,
  EyeOff,
  Gift,
  Info,
  Lock,
  LogIn,
  LogOut,
  Phone,
  Shield,
  Trophy,
  User as UserIcon,
  UserPlus,
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { FootballBetting } from './components/FootballBetting';
import { GameArena } from './components/GameArena';
import { GameLogo } from './components/GameLogo';
import { HistoryPanel } from './components/HistoryPanel';
import { LiveWinnersTicker } from './components/LiveWinnersTicker';
import { WalletPanel } from './components/WalletPanel';
import { WeeklyLeaderboard } from './components/WeeklyLeaderboard';
import {
  ACTIVE_FIREBASE_PROJECT_ID,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  claimDailyLoginBonus,
  DAILY_BONUS_AMOUNT,
  ensureUserWalletAndAdmin,
  getCurrentWeekKey,
  getDailyBonusClaimId,
  loginPlayerWithPhone,
  registerPlayerWithPhone,
} from './lib/firestoreService';
import { formatETB } from './lib/gameEngine';
import { playGameSound } from './lib/sound';
import {
  BetRecord,
  DepositRecord,
  FootballPopularityRecord,
  FootballTicket,
  GameBranding,
  GameConfig,
  LedgerEntry,
  RecentWinnerRecord,
  TelebirrSettings,
  UserPrivateInfo,
  UserWallet,
  WeeklyLeaderboardEntry,
  WithdrawalRecord,
} from './types';

type NavTab = 'play' | 'football' | 'wallet' | 'history' | 'admin';
type AuthMode = 'login' | 'register';

const LAST_PHONE_STORAGE_KEY = 'edilbet_last_phone';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('play');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Player Phone + Password Auth State
  const [authMode, setAuthMode] = useState<AuthMode>(() => {
    try {
      return localStorage.getItem(LAST_PHONE_STORAGE_KEY) ? 'login' : 'register';
    } catch {
      return 'login';
    }
  });
  const [phoneInput, setPhoneInput] = useState<string>(() => {
    try {
      return localStorage.getItem(LAST_PHONE_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [providerDisabledError, setProviderDisabledError] = useState(false);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  // Public Branding & Game Config State
  const [branding, setBranding] = useState<GameBranding | null>(null);
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);

  // Firestore Live State
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [privateInfo, setPrivateInfo] = useState<UserPrivateInfo | null>(null);
  const [settings, setSettings] = useState<TelebirrSettings | null>(null);
  const [myDeposits, setMyDeposits] = useState<DepositRecord[]>([]);
  const [myWithdrawals, setMyWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [myBets, setMyBets] = useState<BetRecord[]>([]);
  const [footballTickets, setFootballTickets] = useState<FootballTicket[]>([]);
  const [footballPopularity, setFootballPopularity] = useState<FootballPopularityRecord[]>([]);
  const [recentWinners, setRecentWinners] = useState<RecentWinnerRecord[]>([]);
  const [weeklyLeaderboard, setWeeklyLeaderboard] = useState<WeeklyLeaderboardEntry[]>([]);
  const [dailyBonusLoaded, setDailyBonusLoaded] = useState(false);
  const [dailyBonusClaimed, setDailyBonusClaimed] = useState(true);
  const [claimingBonus, setClaimingBonus] = useState(false);

  // Admin Live State
  const [allWithdrawals, setAllWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [allDeposits, setAllDeposits] = useState<DepositRecord[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  // Toast Notification
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const notify = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      setToast({ message, type });
    },
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Public Branding Listener (displays admin-uploaded logo everywhere)
  useEffect(() => {
    const unsubBranding = onSnapshot(
      doc(db, 'settings', 'branding'),
      (snap) => {
        if (snap.exists()) {
          setBranding(snap.data() as GameBranding);
        } else {
          setBranding(null);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'settings/branding'),
    );
    return () => unsubBranding();
  }, []);

  // Auth lifecycle
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const adminFlag = await ensureUserWalletAndAdmin(firebaseUser);
          setIsAdmin(adminFlag);
          if (firebaseUser.email?.endsWith('@edilbet.app')) {
            const phone = firebaseUser.email.split('@')[0];
            try {
              localStorage.setItem(LAST_PHONE_STORAGE_KEY, phone);
            } catch {
              // ignore storage errors
            }
          }
        } catch (err) {
          console.error(err);
        }
      } else {
        setIsAdmin(false);
        setWallet(null);
        setPrivateInfo(null);
        setMyDeposits([]);
        setMyWithdrawals([]);
        setMyBets([]);
        setFootballTickets([]);
        setFootballPopularity([]);
        setRecentWinners([]);
        setWeeklyLeaderboard([]);
        setAllWithdrawals([]);
        setAllDeposits([]);
        setLedger([]);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Player + System Firestore Listeners
  useEffect(() => {
    if (!authReady || !user) return;

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'telebirr'),
      (snap) => {
        if (snap.exists()) {
          setSettings(snap.data() as TelebirrSettings);
        } else {
          setSettings(null);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'settings/telebirr'),
    );

    const unsubGameConfig = onSnapshot(
      doc(db, 'settings', 'gameConfig'),
      (snap) => {
        if (snap.exists()) {
          setGameConfig(snap.data() as GameConfig);
        } else {
          setGameConfig(null);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'settings/gameConfig'),
    );

    const unsubWallet = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          setWallet(snap.data() as UserWallet);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}`),
    );

    const unsubPrivate = onSnapshot(
      doc(db, 'users', user.uid, 'private', 'info'),
      (snap) => {
        if (snap.exists()) {
          setPrivateInfo(snap.data() as UserPrivateInfo);
        } else {
          setPrivateInfo(null);
        }
      },
      (error) =>
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}/private/info`),
    );

    const unsubDeposits = onSnapshot(
      query(collection(db, 'deposits'), where('uid', '==', user.uid), limit(50)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as DepositRecord);
        list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setMyDeposits(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'deposits'),
    );

    const unsubWithdrawals = onSnapshot(
      query(collection(db, 'withdrawals'), where('uid', '==', user.uid), limit(50)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as WithdrawalRecord);
        list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setMyWithdrawals(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'withdrawals'),
    );

    const unsubBets = onSnapshot(
      query(collection(db, 'bets'), where('uid', '==', user.uid), limit(50)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as BetRecord);
        list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setMyBets(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'bets'),
    );

    const todayClaimId = getDailyBonusClaimId(user.uid);
    const unsubDailyBonus = onSnapshot(
      doc(db, 'dailyBonuses', todayClaimId),
      (snap) => {
        setDailyBonusClaimed(snap.exists());
        setDailyBonusLoaded(true);
      },
      (error) => handleFirestoreError(error, OperationType.GET, `dailyBonuses/${todayClaimId}`),
    );

    const unsubFootballTickets = onSnapshot(
      query(collection(db, 'footballTickets'), where('uid', '==', user.uid), limit(25)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as FootballTicket);
        list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setFootballTickets(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'footballTickets'),
    );

    const unsubFootballPopularity = onSnapshot(
      query(collection(db, 'footballPopularity'), orderBy('totalBets', 'desc'), limit(20)),
      (snap) => {
        setFootballPopularity(snap.docs.map((d) => d.data() as FootballPopularityRecord));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'footballPopularity'),
    );

    const unsubWinners = onSnapshot(
      query(collection(db, 'recentWinners'), orderBy('createdAt', 'desc'), limit(20)),
      (snap) => {
        setRecentWinners(snap.docs.map((d) => d.data() as RecentWinnerRecord));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'recentWinners'),
    );

    const currentWeekKey = getCurrentWeekKey();
    const unsubWeeklyLeaderboard = onSnapshot(
      query(
        collection(db, 'weeklyLeaderboard'),
        where('weekKey', '==', currentWeekKey),
        limit(100),
      ),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as WeeklyLeaderboardEntry);
        list.sort((a, b) => b.totalWinnings - a.totalWinnings);
        setWeeklyLeaderboard(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'weeklyLeaderboard'),
    );

    return () => {
      unsubSettings();
      unsubGameConfig();
      unsubWallet();
      unsubPrivate();
      unsubDeposits();
      unsubWithdrawals();
      unsubBets();
      unsubDailyBonus();
      unsubFootballTickets();
      unsubFootballPopularity();
      unsubWinners();
      unsubWeeklyLeaderboard();
    };
  }, [authReady, user]);

  // Admin-only Firestore Listeners
  useEffect(() => {
    if (!authReady || !user || !isAdmin) return;

    const unsubAllWithdrawals = onSnapshot(
      query(collection(db, 'withdrawals'), orderBy('createdAt', 'desc'), limit(100)),
      (snap) => {
        setAllWithdrawals(snap.docs.map((d) => d.data() as WithdrawalRecord));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'withdrawals'),
    );

    const unsubAllDeposits = onSnapshot(
      query(collection(db, 'deposits'), orderBy('createdAt', 'desc'), limit(100)),
      (snap) => {
        setAllDeposits(snap.docs.map((d) => d.data() as DepositRecord));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'deposits'),
    );

    const unsubLedger = onSnapshot(
      query(collection(db, 'ledger'), orderBy('createdAt', 'desc'), limit(150)),
      (snap) => {
        setLedger(snap.docs.map((d) => d.data() as LedgerEntry));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'ledger'),
    );

    return () => {
      unsubAllWithdrawals();
      unsubAllDeposits();
      unsubLedger();
    };
  }, [authReady, user, isAdmin]);

  const pendingAdminCount = useMemo(
    () => allWithdrawals.filter((w) => w.status === 'pending').length,
    [allWithdrawals],
  );

  const handlePhoneAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setProviderDisabledError(false);

    if (authMode === 'register' && passwordInput !== confirmPasswordInput) {
      setAuthError('ያስገቡት ሁለቱ ፓስዎርዶች አይመሳሰሉም። እባክዎ አንድ አይነት ፓስዎርድ ያስገቡ።');
      return;
    }

    setAuthSubmitting(true);
    try {
      if (authMode === 'register') {
        await registerPlayerWithPhone({
          rawPhone: phoneInput,
          password: passwordInput,
          playerName: playerNameInput,
        });
        notify('በተሳካ ሁኔታ ተመዝግበው ገብተዋል! ቀሪ ሂሳብዎ በፋየርስቶር ተቀምጧል።', 'success');
      } else {
        await loginPlayerWithPhone({
          rawPhone: phoneInput,
          password: passwordInput,
        });
        notify('እንኳን በደህና ተመለሱ! የቀድሞ ሂሳብዎ እና ታሪክዎ ተመልሷል።', 'success');
      }
      setPasswordInput('');
      setConfirmPasswordInput('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'መግባት አልተቻለም።';
      if (msg === 'AUTH_PROVIDER_DISABLED') {
        setProviderDisabledError(true);
        setAuthError(
          'በFirebase Console ውስጥ "Email/Password" sign-in provider ገና አልበራም። ከታች ያለውን መመሪያ ተከትለው ያብሩት።',
        );
      } else {
        setAuthError(msg);
        if (msg.includes('ቀደም ብሎ ተመዝግቧል')) {
          setAuthMode('login');
        }
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleAdminGoogleSignIn = async () => {
    setAuthError(null);
    setProviderDisabledError(false);
    try {
      await signInWithPopup(auth, googleProvider);
      notify('በGoogle አካውንት በተሳካ ሁኔታ ገብተዋል!', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'መግባት አልተቻለም።', 'error');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setActiveTab('play');
    setAuthMode('login');
    setPasswordInput('');
    setConfirmPasswordInput('');
    setDailyBonusLoaded(false);
    setDailyBonusClaimed(true);
  };

  const handleClaimDailyBonus = async () => {
    if (!user || !wallet || claimingBonus || dailyBonusClaimed) return;
    setClaimingBonus(true);
    try {
      const result = await claimDailyLoginBonus({ uid: user.uid, wallet });
      playGameSound('win', soundEnabled);
      notify(
        `እንኳን ደስ አለዎት! የዛሬው ${formatETB(result.amount)} ዕለታዊ ጉርሻ ወደ ሂሳብዎ ገብቷል።`,
        'success',
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'ዕለታዊ ጉርሻውን መውሰድ አልተቻለም።',
        'error',
      );
    } finally {
      setClaimingBonus(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Clean 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 shrink-0">
            <GameLogo logoUrl={branding?.logoDataUrl} size="sm" />
            <span className="text-base sm:text-lg font-black tracking-tight text-white whitespace-nowrap">
              እድል ቤት · Edil Bet
            </span>
          </div>

          {user && (
            <nav className="hidden md:flex items-center gap-5 text-sm font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('play')}
                className={`py-1 border-b-2 transition cursor-pointer whitespace-nowrap ${
                  activeTab === 'play'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-slate-300 hover:text-white'
                }`}
              >
                ጨዋታዎች
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('football')}
                className={`py-1 border-b-2 transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'football'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-300 hover:text-white'
                }`}
              >
                <Trophy className="w-4 h-4" />
                <span>እግር ኳስ ቤቲንግ</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('wallet')}
                className={`py-1 border-b-2 transition cursor-pointer whitespace-nowrap ${
                  activeTab === 'wallet'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-300 hover:text-white'
                }`}
              >
                ቴሌብር ዲፖሲት / ዊዝድሮው
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`py-1 border-b-2 transition cursor-pointer whitespace-nowrap ${
                  activeTab === 'history'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-slate-300 hover:text-white'
                }`}
              >
                የጨዋታ ታሪክ
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveTab('admin')}
                  className={`py-1 border-b-2 transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    activeTab === 'admin'
                      ? 'border-amber-500 text-amber-400'
                      : 'border-transparent text-slate-300 hover:text-white'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span>አድሚን {pendingAdminCount > 0 ? `(${pendingAdminCount})` : ''}</span>
                </button>
              )}
            </nav>
          )}

          <div className="flex items-center gap-2.5 shrink-0">
            {user && wallet ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('wallet')}
                  className="bg-slate-900 hover:bg-slate-800 border border-amber-500/40 rounded-xl px-3.5 py-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap"
                >
                  <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="font-mono-num text-sm sm:text-base font-black text-amber-400">
                    {formatETB(wallet.balance)}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleSignOut}
                  title="ውጣ"
                  className="w-9 h-9 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-slate-300 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              authReady && (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    phoneInputRef.current?.focus();
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm flex items-center gap-2 transition cursor-pointer whitespace-nowrap"
                >
                  <LogIn className="w-4 h-4" />
                  <span>ግባ</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Mobile Tab Strip */}
        {user && (
          <div className="md:hidden border-t border-slate-800/80 px-2 py-1.5 flex items-center justify-around gap-1 text-[11px] font-bold overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('play')}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap ${
                activeTab === 'play' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
              }`}
            >
              ጨዋታ
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('football')}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap ${
                activeTab === 'football' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
              }`}
            >
              እግር ኳስ
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('wallet')}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap ${
                activeTab === 'wallet' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
              }`}
            >
              ቴሌብር
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap ${
                activeTab === 'history' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
              }`}
            >
              ታሪክ
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap ${
                  activeTab === 'admin' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
                }`}
              >
                አድሚን {pendingAdminCount > 0 ? `(${pendingAdminCount})` : ''}
              </button>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 sm:py-8">
        {!authReady ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-400 text-sm">
            ሲስተሙን እና ፋየርስቶርን በመጫን ላይ...
          </div>
        ) : !user ? (
          <section className="max-w-lg mx-auto bg-slate-900/95 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 mt-2">
            {/* Branding Header */}
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <GameLogo logoUrl={branding?.logoDataUrl} size="lg" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-2xl sm:text-3xl font-black text-white">
                  እድል ቤት · Edil Bet
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  የእግር ኳስ ቤቲንግ፣ ዳይስ (1-100)፣ ሳንቲም እና እድል ቁጥር! በስልክ ቁጥርዎ አንዴ ከተመዘገቡ በኋላ በማንኛውም ጊዜ ሎጊን ሲያደርጉ ቀሪ ሂሳብዎ እና ታሪክዎ እንዳለ ይመጣል።
                </p>
              </div>
            </div>

            {/* Key Rules Summary */}
            <div className="grid grid-cols-3 gap-2.5 text-center text-xs bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5">
              <div>
                <span className="text-slate-400 block">ዝቅተኛ ዲፖሲት</span>
                <strong className="font-mono-num text-sm text-emerald-400">100.00 ብር</strong>
              </div>
              <div>
                <span className="text-slate-400 block">ዝቅተኛ ዊዝድሮው</span>
                <strong className="font-mono-num text-sm text-amber-400">500.00 ብር</strong>
              </div>
              <div>
                <span className="text-slate-400 block">መረጃ ማከማቻ</span>
                <strong className="text-sm text-white">Firestore</strong>
              </div>
            </div>

            {/* Mode Switcher: Login vs Register */}
            <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-950 rounded-2xl border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                  setProviderDisabledError(false);
                }}
                className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <LogIn className="w-4 h-4" />
                <span>ሎጊን (Login)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError(null);
                  setProviderDisabledError(false);
                }}
                className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  authMode === 'register'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>አዲስ ተመዝገብ</span>
              </button>
            </div>

            {/* Error Alert */}
            {authError && (
              <div className="bg-rose-500/15 border border-rose-500/40 rounded-2xl p-3.5 space-y-2 text-xs text-rose-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="font-bold leading-relaxed">{authError}</p>
                </div>
                {providerDisabledError && (
                  <div className="pl-6 space-y-1.5 text-[11px] text-rose-100">
                    <p>
                      1. Firebase Console ይክፈቱ → Authentication → Sign-in method
                    </p>
                    <p>2. &quot;Email/Password&quot; የሚለውን Enable ያድርጉና Save ይጫኑ።</p>
                    <a
                      href={`https://console.firebase.google.com/project/${ACTIVE_FIREBASE_PROJECT_ID}/authentication/providers`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 underline font-bold"
                    >
                      <span>Firebase Console Sign-in Providers ክፈት</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Phone + Password Form */}
            <form onSubmit={handlePhoneAuthSubmit} className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label htmlFor="playerNameInput" className="block text-xs font-bold text-slate-400 mb-1.5">
                    ስም (አማራጭ / Optional Name)
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="playerNameInput"
                      type="text"
                      maxLength={50}
                      value={playerNameInput}
                      onChange={(e) => setPlayerNameInput(e.target.value)}
                      placeholder="ለምሳሌ: አበበ"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="authPhoneInput" className="block text-xs font-bold text-slate-400 mb-1.5">
                  የቴሌብር / ስልክ ቁጥር (Phone Number)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    ref={phoneInputRef}
                    id="authPhoneInput"
                    type="tel"
                    required
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="0911223344"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl pl-10 pr-4 py-3 text-base font-mono-num text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="authPasswordInput" className="block text-xs font-bold text-slate-400 mb-1.5">
                  ፓስዎርድ (Password — ቢያንስ 6 ፊደል/ቁጥር)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="authPasswordInput"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl pl-10 pr-11 py-3 text-base text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                    title={showPassword ? 'ደብቅ' : 'አሳይ'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {authMode === 'register' && (
                <div>
                  <label htmlFor="authConfirmPassword" className="block text-xs font-bold text-slate-400 mb-1.5">
                    ፓስዎርድ በድጋሚ ያረጋግጡ
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="authConfirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPasswordInput}
                      onChange={(e) => setConfirmPasswordInput(e.target.value)}
                      placeholder="••••••"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl pl-10 pr-4 py-3 text-base text-white outline-none"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={authSubmitting}
                className={`w-full py-3.5 px-6 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60 ${
                  authMode === 'register'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                }`}
              >
                {authMode === 'register' ? (
                  <>
                    <UserPlus className="w-5 h-5" />
                    <span>{authSubmitting ? 'በመመዝገብ ላይ...' : 'ተመዝገብና ጨዋታ ጀምር'}</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    <span>{authSubmitting ? 'በመግባት ላይ...' : 'በስልክ ቁጥር ሎጊን አድርግ'}</span>
                  </>
                )}
              </button>
            </form>

            {/* Admin Google Sign-In Divider */}
            <div className="pt-4 border-t border-slate-800 space-y-2.5 text-center">
              <p className="text-[11px] text-slate-400">
                አድሚን ከሆኑ (ወይም በGoogle መግባት ከፈለጉ)
              </p>
              <button
                type="button"
                onClick={handleAdminGoogleSignIn}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Shield className="w-4 h-4 text-amber-400" />
                <span>የአድሚን መግቢያ · Sign in with Google</span>
              </button>
            </div>
          </section>
        ) : !wallet ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-400 text-sm">
            የፋየርስቶር ቦርሳዎን በማዘጋጀት ላይ...
          </div>
        ) : (
          <div className="space-y-5">
            {/* Daily Login Bonus Card (shown when today's bonus has not yet been claimed) */}
            {dailyBonusLoaded && !dailyBonusClaimed && (
              <div className="bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-slate-900 border border-amber-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
                    <Gift className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-white">
                      ዕለታዊ ጉርሻ · Daily Login Bonus (+{formatETB(DAILY_BONUS_AMOUNT)})
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      ዛሬ ለመጀመሪያ ጊዜ ስለገቡ ነፃ {formatETB(DAILY_BONUS_AMOUNT)} ጉርሻ ይውሰዱና ይጫወቱ!
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={claimingBonus}
                  onClick={handleClaimDailyBonus}
                  className="shrink-0 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
                >
                  <Gift className="w-4 h-4" />
                  <span>
                    {claimingBonus
                      ? 'በመስጠት ላይ...'
                      : `${DAILY_BONUS_AMOUNT}.00 ብር ነፃ ጉርሻ ውሰድ`}
                  </span>
                </button>
              </div>
            )}

            {(activeTab === 'play' || activeTab === 'football') && (
              <LiveWinnersTicker winners={recentWinners} />
            )}

            {activeTab === 'play' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-white">
                        አዲስ: የእግር ኳስ ቤቲንግ (Football Betting) ተጨምሯል!
                      </p>
                      <p className="text-xs text-slate-300">
                        ኢትዮጵያ ፕሪሚየር ሊግ፣ Premier League፣ Champions League እና La Liga ላይ ይወራረዱ
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('football')}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm transition cursor-pointer whitespace-nowrap"
                  >
                    ወደ እግር ኳስ ቤቲንግ ሂድ
                  </button>
                </div>

                <GameArena
                  uid={user.uid}
                  wallet={wallet}
                  settings={settings}
                  gameConfig={gameConfig}
                  soundEnabled={soundEnabled}
                  onToggleSound={() => setSoundEnabled((prev) => !prev)}
                  onGoToDeposit={() => setActiveTab('wallet')}
                  onNotify={notify}
                />

                <WeeklyLeaderboard entries={weeklyLeaderboard} currentUid={user.uid} />
              </div>
            )}

            {activeTab === 'football' && (
              <FootballBetting
                uid={user.uid}
                wallet={wallet}
                settings={settings}
                gameConfig={gameConfig}
                tickets={footballTickets}
                popularity={footballPopularity}
                soundEnabled={soundEnabled}
                onToggleSound={() => setSoundEnabled((prev) => !prev)}
                onGoToDeposit={() => setActiveTab('wallet')}
                onNotify={notify}
              />
            )}

            {activeTab === 'wallet' && (
              <WalletPanel
                user={user}
                wallet={wallet}
                settings={settings}
                registeredPhone={privateInfo?.telebirrPhone || null}
                deposits={myDeposits}
                withdrawals={myWithdrawals}
                onNotify={notify}
              />
            )}

            {activeTab === 'history' && <HistoryPanel bets={myBets} />}

            {activeTab === 'admin' && isAdmin && (
              <AdminPanel
                adminUid={user.uid}
                settings={settings}
                branding={branding}
                gameConfig={gameConfig}
                withdrawals={allWithdrawals}
                deposits={allDeposits}
                ledger={ledger}
                onNotify={notify}
              />
            )}
          </div>
        )}
      </main>

      {/* Footer with Edil Bet Branding + Logo */}
      <footer className="border-t border-slate-800/80 py-4 px-4 text-center">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-2.5 text-xs text-slate-400">
          <GameLogo logoUrl={branding?.logoDataUrl} size="sm" />
          <span className="font-bold text-slate-300">እድል ቤት · Edil Bet</span>
          <span>·</span>
          <span>Telebirr &amp; Firestore</span>
        </div>
      </footer>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 left-5 sm:left-auto z-50 pointer-events-none">
          <div className="bg-slate-900 border border-slate-700 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 max-w-md mx-auto">
            {toast.type === 'success' && (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            )}
            {toast.type === 'error' && (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            {toast.type === 'info' && <Info className="w-5 h-5 text-amber-400 shrink-0" />}
            <p className="text-sm font-bold">{toast.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
