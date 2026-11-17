import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
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
  ArrowDownCircle,
  ArrowLeft,
  ArrowUpCircle,
  CheckCircle2,
  Coins,
  Copy,
  Dice5,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Footprints,
  Gift,
  Globe,
  History,
  Info,
  KeyRound,
  LayoutGrid,
  Lock,
  LogIn,
  LogOut,
  Menu,
  Phone,
  Radio,
  Shield,
  Trophy,
  User as UserIcon,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { ChickenJumpGame } from './components/ChickenJumpGame';
import { FootballBetting, SportsSection } from './components/FootballBetting';
import { GameLogo } from './components/GameLogo';
import { GameArena } from './components/GameArena';
import { GamesDashboard } from './components/GamesDashboard';
import { HistoryPanel } from './components/HistoryPanel';
import { LiveWinnersTicker } from './components/LiveWinnersTicker';
import { WalletPanel } from './components/WalletPanel';
import { WeeklyLeaderboard } from './components/WeeklyLeaderboard';
import { WinConfetti } from './components/WinConfetti';
import { buildFootballSchedule } from './lib/footballSchedule';
import {
  ACTIVE_FIREBASE_PROJECT_ID,
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  claimDailyLoginBonus,
  completeRecoveredPasswordSetup,
  DAILY_BONUS_AMOUNT,
  DEFAULT_TELEBIRR_PHONE,
  ensureUserWalletAndAdmin,
  extractPhoneFromAuthEmail,
  getCurrentWeekKey,
  getDailyBonusClaimId,
  loginPlayerWithIdentifier,
  PHONE_REGEX,
  recoverPlayerAccountByPhone,
  registerPlayerWithPhone,
  updateAccountPassword,
  updateAccountUsername,
} from './lib/firestoreService';
import { formatETB } from './lib/gameEngine';
import { useLanguage } from './lib/i18n';
import { playGameSound } from './lib/sound';
import {
  BetRecord,
  DepositRecord,
  FootballPopularityRecord,
  FootballTicket,
  GameBranding,
  GameCategory,
  GameConfig,
  LedgerEntry,
  RecentWinnerRecord,
  TelebirrSettings,
  UserPrivateInfo,
  UserWallet,
  WeeklyLeaderboardEntry,
  WithdrawalRecord,
} from './types';

type NavTab = 'dashboard' | 'football' | 'chicken' | 'play' | 'wallet' | 'history' | 'admin';
type AuthMode = 'login' | 'register';

const LAST_PHONE_STORAGE_KEY = 'edilbet_last_phone';

export default function App() {
  const { lang, setLang, toggleLang, bi } = useLanguage();

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [sportsSection, setSportsSection] = useState<SportsSection>('sport');
  const [quickStake, setQuickStake] = useState<number>(50);
  const [arenaInitialGame, setArenaInitialGame] = useState<Exclude<GameCategory, 'chicken'>>('dice');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Player / Admin Login & Registration State
  const [authMode, setAuthMode] = useState<AuthMode>('login');
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

  // Account Settings (Post-login Change Username & Password in Firestore)
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [newUsernameInput, setNewUsernameInput] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  const [showAccountPasswords, setShowAccountPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [accountSettingsError, setAccountSettingsError] = useState<string | null>(null);
  const [accountSettingsSuccess, setAccountSettingsSuccess] = useState<string | null>(null);

  // Subtle Win Confetti Celebration Key
  const [winCelebrateKey, setWinCelebrateKey] = useState(0);
  const triggerWinCelebrate = useCallback(() => {
    setWinCelebrateKey((prev) => prev + 1);
  }, []);

  // Forgot Password Recovery & Mandatory Save-New-Password State
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [recoveryShowPasswords, setRecoveryShowPasswords] = useState(false);
  const [savingRecoveredPassword, setSavingRecoveredPassword] = useState(false);
  const [recoveryModalError, setRecoveryModalError] = useState<string | null>(null);

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

  // Public Branding Listener
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
            const extractedPhone = extractPhoneFromAuthEmail(firebaseUser.email);
            const rememberValue =
              extractedPhone ||
              (firebaseUser.email.startsWith('owner.admin')
                ? firebaseUser.displayName || 'yirsawbiniyam@gmail.com'
                : firebaseUser.email.split('@')[0]);
            try {
              localStorage.setItem(LAST_PHONE_STORAGE_KEY, rememberValue);
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

    const accountPhone = extractPhoneFromAuthEmail(user.email);

    const unsubDeposits = onSnapshot(
      accountPhone
        ? query(collection(db, 'deposits'), where('playerPhone', '==', accountPhone), limit(100))
        : query(collection(db, 'deposits'), where('uid', '==', user.uid), limit(50)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as DepositRecord);
        list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setMyDeposits(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'deposits'),
    );

    const withdrawalBuckets = {
      current: [] as WithdrawalRecord[],
      primary: [] as WithdrawalRecord[],
      phone: [] as WithdrawalRecord[],
    };
    const syncMergedWithdrawals = () => {
      const byId = new Map<string, WithdrawalRecord>();
      for (const w of [
        ...withdrawalBuckets.current,
        ...withdrawalBuckets.primary,
        ...withdrawalBuckets.phone,
      ]) {
        byId.set(w.id, w);
      }
      const merged = Array.from(byId.values());
      merged.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setMyWithdrawals(merged.slice(0, 100));
    };

    const unsubWithdrawalsCurrent = onSnapshot(
      query(collection(db, 'withdrawals'), where('uid', '==', user.uid), limit(50)),
      (snap) => {
        withdrawalBuckets.current = snap.docs.map((d) => d.data() as WithdrawalRecord);
        syncMergedWithdrawals();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'withdrawals'),
    );

    const unsubWithdrawalsPhone = accountPhone
      ? onSnapshot(
          query(collection(db, 'withdrawals'), where('playerPhone', '==', accountPhone), limit(80)),
          (snap) => {
            withdrawalBuckets.phone = snap.docs.map((d) => d.data() as WithdrawalRecord);
            syncMergedWithdrawals();
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'withdrawals'),
        )
      : null;

    const unsubWithdrawalsPrimary =
      wallet?.primaryUid && wallet.primaryUid !== user.uid
        ? onSnapshot(
            query(collection(db, 'withdrawals'), where('uid', '==', wallet.primaryUid), limit(50)),
            (snap) => {
              withdrawalBuckets.primary = snap.docs.map((d) => d.data() as WithdrawalRecord);
              syncMergedWithdrawals();
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'withdrawals'),
          )
        : null;

    // Merge bets across active UID, phone owner records, and original primaryUid (if recovered)
    const betsBuckets = {
      current: [] as BetRecord[],
      primary: [] as BetRecord[],
      phone: [] as BetRecord[],
    };
    const syncMergedBets = () => {
      const byId = new Map<string, BetRecord>();
      for (const b of [...betsBuckets.current, ...betsBuckets.primary, ...betsBuckets.phone]) {
        byId.set(b.id, b);
      }
      const merged = Array.from(byId.values());
      merged.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setMyBets(merged.slice(0, 100));
    };

    const unsubBetsCurrent = onSnapshot(
      query(collection(db, 'bets'), where('uid', '==', user.uid), limit(60)),
      (snap) => {
        betsBuckets.current = snap.docs.map((d) => d.data() as BetRecord);
        syncMergedBets();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'bets'),
    );

    const unsubBetsPhone = accountPhone
      ? onSnapshot(
          query(collection(db, 'bets'), where('ownerPhone', '==', accountPhone), limit(80)),
          (snap) => {
            betsBuckets.phone = snap.docs.map((d) => d.data() as BetRecord);
            syncMergedBets();
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'bets'),
        )
      : null;

    const unsubBetsPrimary =
      wallet?.primaryUid && wallet.primaryUid !== user.uid
        ? onSnapshot(
            query(collection(db, 'bets'), where('uid', '==', wallet.primaryUid), limit(60)),
            (snap) => {
              betsBuckets.primary = snap.docs.map((d) => d.data() as BetRecord);
              syncMergedBets();
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'bets'),
          )
        : null;

    const todayClaimId = getDailyBonusClaimId(user.uid);
    const unsubDailyBonus = onSnapshot(
      doc(db, 'dailyBonuses', todayClaimId),
      (snap) => {
        setDailyBonusClaimed(snap.exists());
        setDailyBonusLoaded(true);
      },
      (error) => handleFirestoreError(error, OperationType.GET, `dailyBonuses/${todayClaimId}`),
    );

    // Merge football tickets across active UID, phone owner records, and original primaryUid
    const ticketBuckets = {
      current: [] as FootballTicket[],
      primary: [] as FootballTicket[],
      phone: [] as FootballTicket[],
    };
    const syncMergedTickets = () => {
      const byId = new Map<string, FootballTicket>();
      for (const t of [...ticketBuckets.current, ...ticketBuckets.primary, ...ticketBuckets.phone]) {
        byId.set(t.id, t);
      }
      const merged = Array.from(byId.values());
      merged.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setFootballTickets(merged.slice(0, 50));
    };

    const unsubFootballTicketsCurrent = onSnapshot(
      query(collection(db, 'footballTickets'), where('uid', '==', user.uid), limit(30)),
      (snap) => {
        ticketBuckets.current = snap.docs.map((d) => d.data() as FootballTicket);
        syncMergedTickets();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'footballTickets'),
    );

    const unsubFootballTicketsPhone = accountPhone
      ? onSnapshot(
          query(collection(db, 'footballTickets'), where('ownerPhone', '==', accountPhone), limit(40)),
          (snap) => {
            ticketBuckets.phone = snap.docs.map((d) => d.data() as FootballTicket);
            syncMergedTickets();
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'footballTickets'),
        )
      : null;

    const unsubFootballTicketsPrimary =
      wallet?.primaryUid && wallet.primaryUid !== user.uid
        ? onSnapshot(
            query(collection(db, 'footballTickets'), where('uid', '==', wallet.primaryUid), limit(30)),
            (snap) => {
              ticketBuckets.primary = snap.docs.map((d) => d.data() as FootballTicket);
              syncMergedTickets();
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'footballTickets'),
          )
        : null;

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
      unsubWithdrawalsCurrent();
      unsubWithdrawalsPhone?.();
      unsubWithdrawalsPrimary?.();
      unsubBetsCurrent();
      unsubBetsPhone?.();
      unsubBetsPrimary?.();
      unsubDailyBonus();
      unsubFootballTicketsCurrent();
      unsubFootballTicketsPhone?.();
      unsubFootballTicketsPrimary?.();
      unsubFootballPopularity();
      unsubWinners();
      unsubWeeklyLeaderboard();
    };
  }, [authReady, user, wallet?.primaryUid]);

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

  const effectiveSettings = useMemo<TelebirrSettings>(() => {
    const dep = settings?.depositPhone;
    const wdr = settings?.withdrawalPhone;
    const validDep =
      dep && dep !== '0911000000' && PHONE_REGEX.test(dep) ? dep : DEFAULT_TELEBIRR_PHONE;
    const validWdr =
      wdr && wdr !== '0911000000' && PHONE_REGEX.test(wdr) ? wdr : validDep;
    return {
      depositPhone: validDep,
      withdrawalPhone: validWdr,
      accountName: settings?.accountName || 'እድል ቤት · Edil Bet',
      minDeposit: 50,
      minWithdraw: 0,
      houseWinRate: settings?.houseWinRate ?? 0.28,
      updatedBy: settings?.updatedBy || 'system',
      updatedAt: settings?.updatedAt as TelebirrSettings['updatedAt'],
    };
  }, [settings]);

  const pendingAdminCount = useMemo(
    () =>
      allWithdrawals.filter((w) => w.status === 'pending').length +
      allDeposits.filter((d) => d.status === 'pending').length,
    [allWithdrawals, allDeposits],
  );

  const liveMatchesCount = useMemo(
    () => buildFootballSchedule().filter((m) => m.isLive).length,
    [],
  );

  const displayAccountPhone = useMemo(() => {
    if (wallet?.username) return wallet.username;
    if (privateInfo?.username) return privateInfo.username;
    if (privateInfo?.telebirrPhone) return privateInfo.telebirrPhone;
    const extracted = extractPhoneFromAuthEmail(user?.email);
    if (extracted) return extracted;
    return user?.displayName || user?.email || user?.uid.slice(0, 8) || '';
  }, [wallet, privateInfo, user]);

  const handlePhoneAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setProviderDisabledError(false);

    if (authMode === 'register' && passwordInput !== confirmPasswordInput) {
      setAuthError(
        bi(
          'ያስገቡት ሁለቱ ፓስዎርዶች አይመሳሰሉም። እባክዎ አንድ አይነት ፓስዎርድ ያስገቡ።',
          'Passwords do not match. Please enter identical passwords.',
        ),
      );
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
        notify(
          bi(
            'በተሳካ ሁኔታ ተመዝግበው ገብተዋል! ቀሪ ሂሳብዎ በፋየርስቶር ተቀምጧል።',
            'Account registered! Your wallet is ready in Firestore.',
          ),
          'success',
        );
      } else {
        await loginPlayerWithIdentifier({
          rawIdentifier: phoneInput,
          password: passwordInput,
        });
        notify(
          bi(
            'እንኳን በደህና ተመለሱ! መረጃዎ በፋየርስቶር ተመሳስሏል።',
            'Welcome back! Account synced with Firestore.',
          ),
          'success',
        );
      }
      setPasswordInput('');
      setConfirmPasswordInput('');
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/multi-factor-auth-required') {
        setAuthError(
          bi(
            'ባለ 6-አሃዝ 2FA አያስፈልግም። እባክዎ የተመዘገበውን ስልክ ቁጥርዎንና ፓስዎርድዎን ወይም "ፓስዎርድ ረሳሁ?" የሚለውን ተጠቅመው በቀጥታ ይግቡ።',
            '2FA verification is disabled. Please sign in directly using your registered phone number or "Forgot Password?".',
          ),
        );
        return;
      }
      const msg = err instanceof Error ? err.message : bi('መግባት አልተቻለም።', 'Sign in failed.');
      if (msg === 'AUTH_PROVIDER_DISABLED') {
        setProviderDisabledError(true);
        setAuthError(
          bi(
            'በFirebase Console ውስጥ "Email/Password" sign-in provider ገና አልበራም።',
            'Email/Password sign-in provider is disabled in Firebase Console.',
          ),
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

  const handleForgotPasswordRecovery = async () => {
    if (recoveringPassword || authSubmitting) return;
    setAuthError(null);
    setProviderDisabledError(false);

    if (!phoneInput.trim()) {
      setAuthError(
        bi(
          'መጀመሪያ የተመዘገቡበትን ስልክ ቁጥር (09XXXXXXXX) ከላይ ባለው ሳጥን ውስጥ ያስገቡና "ፓስዎርድ ረሳሁ?" የሚለውን ይጫኑ።',
          'Please enter your registered phone number (09XXXXXXXX) above first, then tap Forgot Password.',
        ),
      );
      phoneInputRef.current?.focus();
      return;
    }

    setRecoveringPassword(true);
    try {
      const result = await recoverPlayerAccountByPhone(phoneInput);
      setPasswordInput('');
      setConfirmPasswordInput('');
      setRecoveryNewPassword('');
      setRecoveryConfirmPassword('');
      setRecoveryModalError(null);
      notify(
        bi(
          `ሲስተሙ በ${result.phone} አስገብቶዎታል (${formatETB(result.preservedBalance)} እና ታሪክዎ ተጠብቋል)። አሁን አዲስ ፓስዎርድ ይሙሉና ሴቭ ያድርጉ!`,
          `Auto-signed in for ${result.phone} (${formatETB(result.preservedBalance)} & history preserved). Please set and save your new password!`,
        ),
        'info',
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : bi('ፓስዎርድ መመለስ አልተቻለም።', 'Could not recover account.');
      setAuthError(msg);
    } finally {
      setRecoveringPassword(false);
    }
  };

  const handleCompleteRecoveredPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !wallet || savingRecoveredPassword) return;
    setRecoveryModalError(null);

    if (recoveryNewPassword.length < 6) {
      setRecoveryModalError(
        bi(
          'አዲሱ ፓስዎርድ ቢያንስ 6 ፊደል ወይም ቁጥር መሆን አለበት።',
          'New password must be at least 6 characters.',
        ),
      );
      return;
    }
    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setRecoveryModalError(
        bi(
          'ያስገቡት ሁለቱ አዲስ ፓስዎርዶች አይመሳሰሉም።',
          'Passwords do not match. Please enter the same password twice.',
        ),
      );
      return;
    }

    setSavingRecoveredPassword(true);
    try {
      await completeRecoveredPasswordSetup({
        user,
        wallet,
        newPassword: recoveryNewPassword,
      });
      setRecoveryNewPassword('');
      setRecoveryConfirmPassword('');
      setRecoveryModalError(null);
      notify(
        bi(
          'አዲሱ ፓስዎርድዎ ተመዝግቦ ሴቭ ተደርጓል! ወደ መጀመሪያው ቀሪ ሂሳብዎ እና ታሪክዎ በሰላም ገብተዋል።',
          'New password saved! Welcome back to your preserved balance & full history.',
        ),
        'success',
      );
    } catch (err) {
      setRecoveryModalError(
        err instanceof Error
          ? err.message
          : bi('አዲሱን ፓስዎርድ ማስቀመጥ አልተቻለም።', 'Failed to save new password.'),
      );
    } finally {
      setSavingRecoveredPassword(false);
    }
  };

  const handleCopyRecoveredCredentials = async () => {
    const loginId = extractPhoneFromAuthEmail(user?.email) || displayAccountPhone;
    const text = `Edil Bet · እድል ቤት\nPhone / Username: ${loginId}\nPassword: ${recoveryNewPassword}`;
    try {
      await navigator.clipboard.writeText(text);
      notify(
        bi('ስልክ ቁጥርዎ እና አዲሱ ፓስዎርድዎ ተቀድተዋል!', 'Login phone & new password copied!'),
        'success',
      );
    } catch {
      notify(bi('መቅዳት አልተቻለም፤ እባክዎ በእጅ ይጻፉት።', 'Could not copy automatically.'), 'error');
    }
  };

  const handleDownloadRecoveredCredentials = () => {
    const loginId = extractPhoneFromAuthEmail(user?.email) || displayAccountPhone;
    const content = `Edil Bet (እድል ቤት) Login Backup\nPhone / Username: ${loginId}\nNew Password: ${recoveryNewPassword}\nSaved At: ${new Date().toLocaleString()}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `edilbet-login-${loginId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify(
      bi('የመግቢያ መረጃ ፋይል ወደ መሳሪያዎ ተቀምጧል!', 'Login backup file downloaded!'),
      'success',
    );
  };

  const openAccountSettings = () => {
    setNewUsernameInput(displayAccountPhone);
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmNewPasswordInput('');
    setAccountSettingsError(null);
    setAccountSettingsSuccess(null);
    setDrawerOpen(false);
    setAccountSettingsOpen(true);
  };

  const handleUpdateUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !wallet || savingUsername) return;
    setAccountSettingsError(null);
    setAccountSettingsSuccess(null);
    setSavingUsername(true);
    try {
      const savedUsername = await updateAccountUsername({
        user,
        wallet,
        newUsername: newUsernameInput,
        isAdmin,
      });
      const msg = bi(
        `ዩዘርኔምዎ ወደ "${savedUsername}" ተቀይሮ በፋየርስቶር ተመዝግቧል!`,
        `Username updated to "${savedUsername}" and saved in Firestore!`,
      );
      setAccountSettingsSuccess(msg);
      notify(msg, 'success');
    } catch (err) {
      setAccountSettingsError(
        err instanceof Error
          ? err.message
          : bi('ዩዘርኔም መቀየር አልተቻለም።', 'Failed to update username.'),
      );
    } finally {
      setSavingUsername(false);
    }
  };

  const handleUpdatePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !wallet || savingPassword) return;
    setAccountSettingsError(null);
    setAccountSettingsSuccess(null);

    if (newPasswordInput !== confirmNewPasswordInput) {
      setAccountSettingsError(
        bi(
          'አዲሱ ፓስዎርድ እና ማረጋገጫው አይመሳሰሉም።',
          'New password and confirmation do not match.',
        ),
      );
      return;
    }

    setSavingPassword(true);
    try {
      await updateAccountPassword({
        user,
        wallet,
        currentPassword: currentPasswordInput,
        newPassword: newPasswordInput,
        isAdmin,
      });
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmNewPasswordInput('');
      const msg = bi(
        'ፓስዎርድዎ በተሳካ ሁኔታ ተቀይሮ በፋየርስቶር ተመዝግቧል!',
        'Password updated and recorded in Firestore!',
      );
      setAccountSettingsSuccess(msg);
      notify(msg, 'success');
    } catch (err) {
      setAccountSettingsError(
        err instanceof Error
          ? err.message
          : bi('ፓስዎርድ መቀየር አልተቻለም።', 'Failed to update password.'),
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setDrawerOpen(false);
    setActiveTab('dashboard');
    setSportsSection('sport');
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
        bi(
          `እንኳን ደስ አለዎት! የዛሬው ${formatETB(result.amount)} ዕለታዊ ጉርሻ ወደ ሂሳብዎ ገብቷል።`,
          `Daily bonus claimed! +${formatETB(result.amount)} added to your wallet.`,
        ),
        'success',
      );
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : bi('ዕለታዊ ጉርሻውን መውሰድ አልተቻለም።', 'Failed to claim daily bonus.'),
        'error',
      );
    } finally {
      setClaimingBonus(false);
    }
  };

  const [viewHistory, setViewHistory] = useState<Array<{ tab: NavTab; section: SportsSection }>>([]);

  const navigateWithHistory = useCallback(
    (nextTab: NavTab, nextSection: SportsSection) => {
      setViewHistory((prev) => {
        if (activeTab === nextTab && sportsSection === nextSection) return prev;
        return [...prev.slice(-14), { tab: activeTab, section: sportsSection }];
      });
      setActiveTab(nextTab);
      setSportsSection(nextSection);
      setDrawerOpen(false);
    },
    [activeTab, sportsSection],
  );

  const openSportsSection = (sec: SportsSection) => {
    navigateWithHistory('football', sec);
  };

  const openTab = (tab: NavTab) => {
    navigateWithHistory(tab, tab === 'football' ? sportsSection : 'sport');
  };

  const handleBackNavigation = useCallback(() => {
    if (accountSettingsOpen) {
      setAccountSettingsOpen(false);
      return;
    }
    if (drawerOpen) {
      setDrawerOpen(false);
      return;
    }
    if (viewHistory.length > 0) {
      const last = viewHistory[viewHistory.length - 1];
      setViewHistory((prev) => prev.slice(0, -1));
      setActiveTab(last.tab);
      setSportsSection(last.section);
      return;
    }
    if (activeTab !== 'dashboard' || sportsSection !== 'sport') {
      setActiveTab('dashboard');
      setSportsSection('sport');
    }
  }, [accountSettingsOpen, drawerOpen, viewHistory, activeTab, sportsSection]);

  const canGoBackNav =
    viewHistory.length > 0 || activeTab !== 'dashboard' || sportsSection !== 'sport';

  const pushedAppHistoryRef = useRef(false);
  useEffect(() => {
    const shouldPush = drawerOpen || accountSettingsOpen || canGoBackNav;
    if (shouldPush && !pushedAppHistoryRef.current) {
      try {
        window.history.pushState({ edilAppNav: true }, '');
        pushedAppHistoryRef.current = true;
      } catch {
        // ignore
      }
    } else if (!shouldPush) {
      pushedAppHistoryRef.current = false;
    }
  }, [drawerOpen, accountSettingsOpen, canGoBackNav]);

  useEffect(() => {
    const onPopState = () => {
      if (drawerOpen || accountSettingsOpen || canGoBackNav) {
        handleBackNavigation();
        pushedAppHistoryRef.current = false;
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [drawerOpen, accountSettingsOpen, canGoBackNav, handleBackNavigation]);

  return (
    <div className="min-h-dvh flex flex-col bg-[#E9ECEF] text-slate-900 overflow-x-hidden">
      {/* PROFESSIONAL EMERALD SPORTSBOOK HEADER & NAV BAR (Matching Reference Screenshots) */}
      <header className="sticky top-0 z-30 bg-[#0E8A38] text-white shadow-md">
        {/* Primary Top Bar */}
        <div className="max-w-7xl mx-auto px-2.5 sm:px-4 h-13 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={bi('ሜኑ ክፈት', 'Open menu')}
              className="w-10 h-10 -ml-1 rounded-lg hover:bg-black/15 flex items-center justify-center cursor-pointer transition shrink-0"
            >
              <Menu className="w-6 h-6 text-white" />
            </button>
            <GameLogo logoUrl={branding?.logoDataUrl} size="sm" />
            <span className="text-sm sm:text-lg font-black tracking-tight text-white truncate">
              እድል ቤት · Edil Bet
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Bilingual Language Toggle */}
            <button
              type="button"
              onClick={toggleLang}
              className="px-2.5 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
              title={bi('ቋንቋ ቀይር (አማርኛ / English)', 'Switch language (Amharic / English)')}
            >
              <Globe className="w-3.5 h-3.5 text-[#9AD84B]" />
              <span>{lang === 'am' ? 'አማ | EN' : 'EN | አማ'}</span>
            </button>

            {user && wallet ? (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-black/25 hover:bg-black/35 flex items-center gap-2 cursor-pointer transition whitespace-nowrap"
              >
                <span className="font-mono-num text-xs sm:text-sm font-black text-[#9AD84B]">
                  {formatETB(wallet.balance)}
                </span>
                <UserIcon className="w-4 h-4 text-white shrink-0" />
              </button>
            ) : (
              authReady && (
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-[#9AD84B] hover:bg-[#a9e45d] text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{bi('ግባ', 'LOGIN')}</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Secondary Sportsbook Navigation Bar */}
        {user && (
          <nav
            aria-label={bi('ዋና የቤቲንግ ማውጫ', 'Primary sportsbook navigation')}
            className="border-t border-white/15 bg-[#0E8A38]"
          >
            <div className="max-w-7xl mx-auto px-2.5 sm:px-4 py-1.5 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar text-xs font-extrabold">
              <button
                type="button"
                onClick={() => openTab('dashboard')}
                className={`px-3 py-1.5 rounded transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
                  activeTab === 'dashboard'
                    ? 'bg-[#9AD84B] text-slate-950 font-black'
                    : 'text-white hover:bg-black/15'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{bi('ዳሽቦርድ', 'HUB')}</span>
              </button>

              <button
                type="button"
                onClick={() => openTab('chicken')}
                className={`px-3 py-1.5 rounded transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
                  activeTab === 'chicken'
                    ? 'bg-[#9AD84B] text-slate-950 font-black'
                    : 'text-white hover:bg-black/15'
                }`}
              >
                <Footprints className="w-3.5 h-3.5" />
                <span>{bi('ዶሮ ዝላይ', 'CHICKEN')}</span>
              </button>

              <button
                type="button"
                onClick={() => openSportsSection('sport')}
                className={`px-3 py-1.5 rounded transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
                  activeTab === 'football'
                    ? 'bg-[#9AD84B] text-slate-950 font-black'
                    : 'text-white hover:bg-black/15'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>{bi('እግር ኳስ', 'FOOTBALL')}</span>
              </button>

              <button
                type="button"
                onClick={() => openTab('play')}
                className={`px-3 py-1.5 rounded transition cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'play'
                    ? 'bg-[#9AD84B] text-slate-950 font-black'
                    : 'text-white hover:bg-black/15'
                }`}
              >
                {bi('ዳይስ & ሳንቲም', 'DICE & COIN')}
              </button>

              <button
                type="button"
                onClick={() => openTab('wallet')}
                className={`px-3 py-1.5 rounded transition cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'wallet'
                    ? 'bg-[#9AD84B] text-slate-950 font-black'
                    : 'text-white hover:bg-black/15'
                }`}
              >
                {bi('ቴሌብር ቦርሳ', 'WALLET')}
              </button>

              <button
                type="button"
                onClick={() => openTab('history')}
                className={`px-3 py-1.5 rounded transition cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'history'
                    ? 'bg-[#9AD84B] text-slate-950 font-black'
                    : 'text-white hover:bg-black/15'
                }`}
              >
                {bi('ታሪክ', 'HISTORY')}
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => openTab('admin')}
                  className={`px-3 py-1.5 rounded transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
                    activeTab === 'admin'
                      ? 'bg-[#9AD84B] text-slate-950 font-black'
                      : 'text-white hover:bg-black/15'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>
                    {bi('አድሚን', 'ADMIN')} {pendingAdminCount > 0 ? `(${pendingAdminCount})` : ''}
                  </span>
                </button>
              )}
            </div>
          </nav>
        )}
      </header>

      {/* SLIDE-OUT ACCOUNT & NAVIGATION DRAWER (Matching Screenshots #6 & #7) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" role="dialog" aria-modal="true">
          <div className="w-full max-w-[330px] bg-white text-slate-900 h-full overflow-y-auto shadow-2xl flex flex-col">
            {/* Top Bar inside Drawer */}
            <div className="bg-[#0E8A38] text-white px-3 py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="px-2 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 text-white text-xs font-black flex items-center gap-1 cursor-pointer shrink-0"
                  aria-label={bi('ተመለስ', 'Back')}
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[#9AD84B]" />
                  <span>{bi('ተመለስ', 'Back')}</span>
                </button>
                <span className="font-mono-num text-xs sm:text-sm font-black truncate">
                  {user ? displayAccountPhone : bi('የእድል ቤት መለያ', 'Edil Bet Account')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={bi('ዝጋ', 'Close drawer')}
                className="w-9 h-9 rounded-lg hover:bg-black/20 flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {user && wallet ? (
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  {/* Real Balance & Deposit / Withdraw CTA Box */}
                  <div className="p-4 border-b border-slate-200 space-y-3 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs text-slate-500 block">
                          {bi('ቀሪ ሂሳብ (Real Balance)', 'Real Balance')}
                        </span>
                        <strong className="font-mono-num text-lg font-black text-slate-900">
                          {formatETB(wallet.balance)}
                        </strong>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openTab('wallet')}
                          className="px-2.5 py-2 rounded bg-[#0E8A38] hover:bg-[#0B732E] text-white text-[11px] font-black cursor-pointer"
                        >
                          {bi('ዲፖሲት', 'DEPOSIT')}
                        </button>
                        <button
                          type="button"
                          onClick={() => openTab('wallet')}
                          className="px-2.5 py-2 rounded bg-[#0E8A38] hover:bg-[#0B732E] text-white text-[11px] font-black cursor-pointer"
                        >
                          {bi('ዊዝድሮው', 'WITHDRAW')}
                        </button>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#0E8A38]">{bi('ጠቅላላ ሂሳብ', 'Total Balance')}</span>
                        <span className="font-mono-num font-black text-[#0E8A38]">
                          {formatETB(wallet.balance)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>{bi('ጠቅላላ ዲፖሲት', 'Total Deposited')}</span>
                        <span className="font-mono-num font-bold">{formatETB(wallet.totalDeposited)}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>{bi('ጠቅላላ ዊዝድሮው', 'Total Withdrawn')}</span>
                        <span className="font-mono-num font-bold">{formatETB(wallet.totalWithdrawn)}</span>
                      </div>
                    </div>

                    {dailyBonusLoaded && !dailyBonusClaimed && (
                      <button
                        type="button"
                        disabled={claimingBonus}
                        onClick={handleClaimDailyBonus}
                        className="w-full py-2 px-3 rounded-lg bg-[#9AD84B] hover:bg-[#8ccc3d] text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Gift className="w-4 h-4" />
                        <span>
                          {claimingBonus
                            ? bi('በመስጠት ላይ...', 'Claiming...')
                            : bi(
                                `ዕለታዊ ጉርሻ ውሰድ (+${DAILY_BONUS_AMOUNT} ብር)`,
                                `Claim Daily Bonus (+${DAILY_BONUS_AMOUNT} ETB)`,
                              )}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Drawer Navigation Rows */}
                  <div className="divide-y divide-slate-200 text-sm font-semibold text-slate-800">
                    <button
                      type="button"
                      onClick={() => openTab('dashboard')}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer text-left font-bold text-[#0E8A38]"
                    >
                      <LayoutGrid className="w-4 h-4 text-[#0E8A38]" />
                      <span>{bi('ዋና ዳሽቦርድ (ሁሉም ጨዋታዎች)', 'Games Dashboard Hub')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openTab('chicken')}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer text-left"
                    >
                      <Footprints className="w-4 h-4 text-amber-600" />
                      <span>{bi('ዶሮ ዝላይ ውርርድ (Chicken Jump)', 'Chicken Jump Betting')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openTab('wallet')}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer text-left"
                    >
                      <ArrowDownCircle className="w-4 h-4 text-slate-500" />
                      <span>{bi('ቴሌብር ዲፖሲት (ገቢ)', 'Deposit via Telebirr')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openTab('wallet')}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer text-left"
                    >
                      <ArrowUpCircle className="w-4 h-4 text-slate-500" />
                      <span>{bi('ቴሌብር ዊዝድሮው (ወጪ)', 'Withdraw via Telebirr')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openSportsSection('cashout')}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer text-left"
                    >
                      <Radio className="w-4 h-4 text-[#0E8A38]" />
                      <span>
                        {bi('ላይቭ ካሽአውት እና ትኬቶች', 'Live Cashout & Tickets')} (
                        {footballTickets.filter((t) => t.status === 'live').length})
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openTab('history')}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer text-left"
                    >
                      <History className="w-4 h-4 text-slate-500" />
                      <span>{bi('የጨዋታ እና ትኬት ታሪክ', 'Bet History & Analytics')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openTab('play')}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer text-left"
                    >
                      <Dice5 className="w-4 h-4 text-slate-500" />
                      <span>{bi('ዳይስ፣ ሳንቲም እና የሳምንቱ ሰንጠረዥ', 'Dice Games & Leaderboard')}</span>
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => openTab('admin')}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer text-left text-[#0E8A38] font-bold"
                      >
                        <Shield className="w-4 h-4" />
                        <span>
                          {bi('አድሚን ፓነል', 'Admin Panel')}{' '}
                          {pendingAdminCount > 0 ? `(${pendingAdminCount})` : ''}
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={openAccountSettings}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer text-left text-slate-800 font-bold"
                    >
                      <KeyRound className="w-4 h-4 text-[#0E8A38]" />
                      <span>{bi('ዩዘርኔም እና ፓስዎርድ ቀይር', 'Change Username & Password')}</span>
                    </button>
                  </div>
                </div>

                {/* Language Switch + Green Logout Footer */}
                <div className="border-t border-slate-200">
                  <div className="px-4 py-3 flex items-center justify-between gap-2 bg-slate-50">
                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                      <Globe className="w-4 h-4 text-[#0E8A38]" />
                      <span>{bi('ቋንቋ / Language', 'Language')}</span>
                    </span>
                    <div className="flex rounded-lg overflow-hidden border border-slate-300 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setLang('am')}
                        className={`px-2.5 py-1 cursor-pointer ${
                          lang === 'am' ? 'bg-[#0E8A38] text-white' : 'bg-white text-slate-700'
                        }`}
                      >
                        አማርኛ
                      </button>
                      <button
                        type="button"
                        onClick={() => setLang('en')}
                        className={`px-2.5 py-1 cursor-pointer ${
                          lang === 'en' ? 'bg-[#0E8A38] text-white' : 'bg-white text-slate-700'
                        }`}
                      >
                        English
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full py-3.5 px-4 bg-[#0E8A38] hover:bg-[#0B732E] text-white font-black text-sm flex items-center justify-center gap-2 cursor-pointer transition"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{bi('ውጣ · Logout', 'Logout')}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* LOGGED-OUT DRAWER (Matching Screenshot #7) */
              <div className="p-5 space-y-5 flex-1 flex flex-col justify-between">
                <div className="space-y-4 text-center">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-600">
                      {bi('ቀደም ብለው ተመዝግበዋል?', 'Account already existing?')}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setDrawerOpen(false);
                        window.setTimeout(() => phoneInputRef.current?.focus(), 80);
                      }}
                      className="w-full py-3 rounded bg-[#0E8A38] hover:bg-[#0B732E] text-white font-black text-sm cursor-pointer transition"
                    >
                      {bi('ግባ · LOGIN', 'LOGIN')}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-600">
                      {bi('አዲስ ተጠቃሚ ነዎት?', 'New user?')}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('register');
                        setDrawerOpen(false);
                        window.setTimeout(() => phoneInputRef.current?.focus(), 80);
                      }}
                      className="w-full py-3 rounded bg-[#0E8A38] hover:bg-[#0B732E] text-white font-black text-sm cursor-pointer transition"
                    >
                      {bi('ተመዝገብ · REGISTER', 'REGISTER')}
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-4 space-y-2">
                  <span className="text-xs font-bold text-slate-600 flex items-center justify-center gap-1.5">
                    <Globe className="w-4 h-4 text-[#0E8A38]" />
                    <span>{bi('ቋንቋ ይምረጡ / Select Language', 'Select Language')}</span>
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setLang('am')}
                      className={`py-2 rounded border text-xs font-extrabold cursor-pointer ${
                        lang === 'am'
                          ? 'bg-[#0E8A38] border-[#0E8A38] text-white'
                          : 'bg-slate-50 border-slate-300 text-slate-800'
                      }`}
                    >
                      አማርኛ
                    </button>
                    <button
                      type="button"
                      onClick={() => setLang('en')}
                      className={`py-2 rounded border text-xs font-extrabold cursor-pointer ${
                        lang === 'en'
                          ? 'bg-[#0E8A38] border-[#0E8A38] text-white'
                          : 'bg-slate-50 border-slate-300 text-slate-800'
                      }`}
                    >
                      English
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MAIN WORKSPACE */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-2.5 sm:px-4 pb-28 lg:pb-8">
        {!authReady ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-600 text-sm mt-6 shadow-xs">
            {bi('ሲስተሙን እና ፋየርስቶርን በመጫን ላይ...', 'Loading Edil Bet & Firestore...')}
          </div>
        ) : !user ? (
          <section className="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-md mt-6">
            <div className="bg-[#0E8A38] text-white p-6 text-center space-y-2">
              <div className="flex justify-center">
                <GameLogo logoUrl={branding?.logoDataUrl} size="lg" />
              </div>
              <h1 className="text-2xl font-black">እድል ቤት · Edil Bet</h1>
              <p className="text-xs text-emerald-100 leading-relaxed">
                {bi(
                  'የእግር ኳስ ቤቲንግ (135+ ገበያዎች)፣ ዳይስ (1-100)፣ ሳንቲም እና እድል ቁጥር! በስልክ ቁጥርዎ ተመዝግበው ወዲያውኑ ይጀምሩ።',
                  'Professional Football Sportsbook (135+ Markets), Dice, Coin Flip & Telebirr Wallet.',
                )}
              </p>
            </div>

            <div className="p-6 space-y-5">
              {/* Mode Switcher */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError(null);
                    setProviderDisabledError(false);
                  }}
                  className={`py-2.5 px-3 rounded-lg text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    authMode === 'login'
                      ? 'bg-[#0E8A38] text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <LogIn className="w-4 h-4" />
                  <span>{bi('ሎጊን (Login)', 'Login')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setAuthError(null);
                    setProviderDisabledError(false);
                  }}
                  className={`py-2.5 px-3 rounded-lg text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    authMode === 'register'
                      ? 'bg-[#0E8A38] text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{bi('አዲስ ተመዝገብ', 'Register')}</span>
                </button>
              </div>

              {authError && (
                <div className="bg-rose-50 border border-rose-300 rounded-xl p-3 space-y-1.5 text-xs text-rose-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <p className="font-bold">{authError}</p>
                  </div>
                  {providerDisabledError && (
                    <a
                      href={`https://console.firebase.google.com/project/${ACTIVE_FIREBASE_PROJECT_ID}/authentication/providers`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[#0E8A38] underline font-bold pl-6"
                    >
                      <span>Firebase Console Sign-in Providers</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}

              <form onSubmit={handlePhoneAuthSubmit} className="space-y-3.5">
                {authMode === 'register' && (
                  <div>
                    <label htmlFor="playerNameInput" className="block text-xs font-bold text-slate-700 mb-1">
                      {bi('ስም (አማራጭ)', 'Full Name (Optional)')}
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="playerNameInput"
                        type="text"
                        maxLength={50}
                        value={playerNameInput}
                        onChange={(e) => setPlayerNameInput(e.target.value)}
                        placeholder={bi('ለምሳሌ: አበበ', 'e.g. Abebe')}
                        className="w-full bg-slate-50 border border-slate-300 focus:border-[#0E8A38] rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-900 outline-none"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="authPhoneInput" className="block text-xs font-bold text-slate-700 mb-1">
                    {authMode === 'login'
                      ? bi('ስልክ ቁጥር ወይም ዩዘርኔም / ኢሜይል', 'Phone, Username or Email')
                      : bi('የቴሌብር / ስልክ ቁጥር', 'Telebirr / Phone Number')}
                  </label>
                  <div className="relative">
                    {authMode === 'login' ? (
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    ) : (
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    )}
                    <input
                      ref={phoneInputRef}
                      id="authPhoneInput"
                      type={authMode === 'login' ? 'text' : 'tel'}
                      required
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder={
                        authMode === 'login'
                          ? '0911223344 / username / email'
                          : '0911223344'
                      }
                      className="w-full bg-slate-50 border border-slate-300 focus:border-[#0E8A38] rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-900 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="authPasswordInput" className="block text-xs font-bold text-slate-700 mb-1">
                    {bi('ፓስዎርድ (ቢያንስ 6 ፊደል/ቁጥር)', 'Password (min 6 chars)')}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="authPasswordInput"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="••••••"
                      className="w-full bg-slate-50 border border-slate-300 focus:border-[#0E8A38] rounded-lg pl-9 pr-10 py-2.5 text-sm text-slate-900 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 cursor-pointer"
                      aria-label={showPassword ? bi('ደብቅ', 'Hide') : bi('አሳይ', 'Show')}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {authMode === 'register' && (
                  <div>
                    <label htmlFor="authConfirmPassword" className="block text-xs font-bold text-slate-700 mb-1">
                      {bi('ፓስዎርድ በድጋሚ ያረጋግጡ', 'Confirm Password')}
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="authConfirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={confirmPasswordInput}
                        onChange={(e) => setConfirmPasswordInput(e.target.value)}
                        placeholder="••••••"
                        className="w-full bg-slate-50 border border-slate-300 focus:border-[#0E8A38] rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-900 outline-none"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authSubmitting || recoveringPassword}
                  className="w-full py-3 px-5 rounded-lg bg-[#0E8A38] hover:bg-[#0B732E] disabled:opacity-60 text-white font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  {authMode === 'register' ? (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>
                        {authSubmitting
                          ? bi('በመመዝገብ ላይ...', 'Creating Account...')
                          : bi('ተመዝገብና ጨዋታ ጀምር', 'Register & Start Betting')}
                      </span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>
                        {authSubmitting
                          ? bi('በመግባት ላይ...', 'Signing In...')
                          : bi('ግባ (Login)', 'Login')}
                      </span>
                    </>
                  )}
                </button>

                {authMode === 'login' && (
                  <div className="pt-1 border-t border-slate-100 flex flex-col items-center gap-1.5">
                    <button
                      type="button"
                      disabled={recoveringPassword || authSubmitting}
                      onClick={handleForgotPasswordRecovery}
                      className="w-full py-2.5 px-4 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-extrabold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                      <span>
                        {recoveringPassword
                          ? bi('ሲስተሙ በራሱ እያስገባዎት ነው...', 'Signing you in automatically...')
                          : bi(
                              'ፓስዎርድ ረሳሁ? (በስልክ ቁጥር ቀጥታ ግባ)',
                              'Forgot Password? (Auto-Login with Phone)',
                            )}
                      </span>
                    </button>
                    <p className="text-[11px] text-slate-500 text-center">
                      {bi(
                        'ስልክ ቁጥርዎን አስገብተው ይህን ሲጫኑ ሲስተሙ ወዲያውኑ አስገብቶ አዲስ ፓስዎርድ እንዲሞሉ ያደርጋል — ታሪክዎና ቀሪ ሂሳብዎ አይጠፋም።',
                        'Enter your phone above and tap this: the system signs you in automatically to set a new password while keeping your full balance & history.',
                      )}
                    </p>
                  </div>
                )}
              </form>
            </div>
          </section>
        ) : !wallet ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-600 text-sm mt-6 shadow-xs">
            {bi('የፋየርስቶር ቦርሳዎን በማዘጋጀት ላይ...', 'Preparing your wallet...')}
          </div>
        ) : (
          <div className="space-y-2.5 sm:space-y-4">
            {canGoBackNav && (
              <div className="pt-1.5 sm:pt-2.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleBackNavigation}
                  className="min-h-[38px] sm:min-h-[42px] px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-900 text-xs font-black flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                >
                  <ArrowLeft className="w-4 h-4 text-[#0E8A38]" />
                  <span>{bi('ተመለስ · Back', 'Back')}</span>
                </button>
                <span className="text-[11px] font-bold text-slate-500 truncate">
                  {activeTab === 'dashboard'
                    ? bi('ዋና ዳሽቦርድ', 'Games Dashboard')
                    : activeTab === 'chicken'
                      ? bi('ዶሮ ዝላይ ውርርድ', 'Chicken Jump')
                      : activeTab === 'play'
                        ? bi('ዳይስ እና ጨዋታዎች', 'Dice & Games')
                        : activeTab === 'wallet'
                          ? bi('ቴሌብር ቦርሳ', 'Telebirr Wallet')
                          : activeTab === 'history'
                            ? bi('የውርርድ ታሪክ', 'Bet History')
                            : activeTab === 'admin'
                              ? bi('አድሚን ፓነል', 'Admin Panel')
                              : sportsSection === 'live' || sportsSection === 'cashout'
                                ? bi('እግር ኳስ · ላይቭ እና ካሽአውት', 'Football · Live & Cashout')
                                : sportsSection === 'promos'
                                  ? bi('እግር ኳስ · ማስታወቂያ እና ህጎች', 'Football · Promos & Rules')
                                  : bi('እግር ኳስ · ውርርድ', 'Football · Betting')}
                </span>
              </div>
            )}

            {activeTab === 'dashboard' && (
              <GamesDashboard
                wallet={wallet}
                gameConfig={gameConfig}
                liveMatchesCount={liveMatchesCount}
                liveTicketsCount={footballTickets.filter((t) => t.status === 'live').length}
                dailyBonusAvailable={dailyBonusLoaded && !dailyBonusClaimed}
                dailyBonusAmount={DAILY_BONUS_AMOUNT}
                claimingBonus={claimingBonus}
                quickStake={quickStake}
                onChangeQuickStake={setQuickStake}
                onClaimDailyBonus={handleClaimDailyBonus}
                onOpenChickenJump={(stake) => {
                  setQuickStake(stake);
                  openTab('chicken');
                }}
                onOpenFootball={(sec) => openSportsSection(sec ?? 'sport')}
                onOpenArenaGame={(cat, stake) => {
                  setArenaInitialGame(cat);
                  setQuickStake(stake);
                  openTab('play');
                }}
                onGoToWallet={() => openTab('wallet')}
                onGoToHistory={() => openTab('history')}
              />
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
                sportsSection={sportsSection}
                onChangeSportsSection={(sec) => navigateWithHistory('football', sec)}
                onToggleSound={() => setSoundEnabled((prev) => !prev)}
                onGoToDeposit={() => openTab('wallet')}
                onNotify={notify}
                onWinCelebrate={triggerWinCelebrate}
              />
            )}

            {(activeTab === 'dashboard' || activeTab === 'football') && (
              <LiveWinnersTicker winners={recentWinners} />
            )}

            {activeTab === 'chicken' && (
              <div className="space-y-4">
                <ChickenJumpGame
                  uid={user.uid}
                  wallet={wallet}
                  settings={settings}
                  gameConfig={gameConfig}
                  soundEnabled={soundEnabled}
                  initialStake={quickStake}
                  onToggleSound={() => setSoundEnabled((prev) => !prev)}
                  onGoToDeposit={() => openTab('wallet')}
                  onNotify={notify}
                  onWinCelebrate={triggerWinCelebrate}
                />
                <LiveWinnersTicker winners={recentWinners} />
                <WeeklyLeaderboard entries={weeklyLeaderboard} currentUid={user.uid} />
              </div>
            )}

            {activeTab === 'dashboard' && (
              <WeeklyLeaderboard entries={weeklyLeaderboard} currentUid={user.uid} />
            )}

            {activeTab === 'play' && (
              <div className="space-y-4">
                {/* Daily Login Bonus Card */}
                {dailyBonusLoaded && !dailyBonusClaimed && (
                  <div className="bg-white border border-[#0E8A38]/40 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#9AD84B]/30 text-[#0E8A38] flex items-center justify-center shrink-0">
                        <Gift className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900">
                          {bi('ዕለታዊ ጉርሻ', 'Daily Login Bonus')} (+{formatETB(DAILY_BONUS_AMOUNT)})
                        </h3>
                        <p className="text-xs text-slate-600">
                          {bi(
                            `ዛሬ ለመጀመሪያ ጊዜ ስለገቡ ነፃ ${formatETB(DAILY_BONUS_AMOUNT)} ጉርሻ ይውሰዱ!`,
                            `Claim your free ${formatETB(DAILY_BONUS_AMOUNT)} daily login bonus!`,
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={claimingBonus}
                      onClick={handleClaimDailyBonus}
                      className="shrink-0 px-4 py-2 rounded-lg bg-[#0E8A38] hover:bg-[#0B732E] text-white font-black text-xs flex items-center gap-1.5 cursor-pointer"
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

                <GameArena
                  uid={user.uid}
                  wallet={wallet}
                  settings={settings}
                  gameConfig={gameConfig}
                  soundEnabled={soundEnabled}
                  initialGame={arenaInitialGame}
                  initialStake={quickStake}
                  onToggleSound={() => setSoundEnabled((prev) => !prev)}
                  onGoToDeposit={() => setActiveTab('wallet')}
                  onNotify={notify}
                  onWinCelebrate={triggerWinCelebrate}
                />

                <LiveWinnersTicker winners={recentWinners} />
                <WeeklyLeaderboard entries={weeklyLeaderboard} currentUid={user.uid} />
              </div>
            )}

            {activeTab === 'wallet' && (
              <div className="pt-3">
                <WalletPanel
                  user={user}
                  wallet={wallet}
                  settings={effectiveSettings}
                  registeredPhone={
                    privateInfo?.telebirrPhone || extractPhoneFromAuthEmail(user.email) || null
                  }
                  deposits={myDeposits}
                  withdrawals={myWithdrawals}
                  onNotify={notify}
                />
              </div>
            )}

            {activeTab === 'history' && (
              <div className="pt-3">
                <HistoryPanel
                  bets={myBets}
                  tickets={footballTickets}
                  deposits={myDeposits}
                  withdrawals={myWithdrawals}
                />
              </div>
            )}

            {activeTab === 'admin' && isAdmin && (
              <div className="pt-3">
                <AdminPanel
                  adminUid={user.uid}
                  settings={effectiveSettings}
                  branding={branding}
                  gameConfig={gameConfig}
                  withdrawals={allWithdrawals}
                  deposits={allDeposits}
                  ledger={ledger}
                  onNotify={notify}
                  onOpenAccountSettings={openAccountSettings}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Compact Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 pb-20 lg:pb-4 px-4 text-center">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-2.5 text-xs text-slate-600">
          <GameLogo logoUrl={branding?.logoDataUrl} size="sm" />
          <span className="font-extrabold text-slate-900">እድል ቤት · Edil Bet</span>
          <span aria-hidden="true">·</span>
          <span>Telebirr &amp; Live Sportsbook</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={toggleLang}
            className="font-bold text-[#0E8A38] hover:underline cursor-pointer"
          >
            {lang === 'am' ? 'Switch to English' : 'ወደ አማርኛ ቀይር'}
          </button>
        </div>
      </footer>

      {/* Account & Security Settings Modal (Change Username & Password synced with Firestore) */}
      {accountSettingsOpen && user && wallet && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={bi('ዩዘርኔም እና ፓስዎርድ ማስተካከያ', 'Account Username & Password Settings')}
        >
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] overflow-y-auto shadow-2xl text-slate-900 pb-[env(safe-area-inset-bottom)]">
            <div className="bg-[#0E8A38] text-white px-3.5 sm:px-5 py-3.5 flex items-center justify-between gap-2 sticky top-0 z-10">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setAccountSettingsOpen(false)}
                  className="min-h-[38px] px-2.5 py-1 rounded-lg bg-black/20 hover:bg-black/30 text-white text-xs font-black flex items-center gap-1 cursor-pointer shrink-0"
                  aria-label={bi('ተመለስ', 'Back')}
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[#9AD84B]" />
                  <span>{bi('ተመለስ', 'Back')}</span>
                </button>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-black truncate">
                    {bi('ዩዘርኔም እና ፓስዎርድ', 'Account Settings')}
                  </h2>
                  <p className="text-[10px] sm:text-[11px] text-emerald-100 truncate">
                    {bi('በፋየርስቶር ላይ ይመዘገባል', 'Saved in Firestore')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAccountSettingsOpen(false)}
                aria-label={bi('ዝጋ', 'Close')}
                className="w-9 h-9 rounded-lg hover:bg-black/20 flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{bi('የአሁኑ ዩዘርኔም:', 'Current Username:')}</span>
                  <strong className="text-slate-900 font-bold">{displayAccountPhone}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{bi('ሚና:', 'Role:')}</span>
                  <strong className="text-[#0E8A38] font-extrabold">
                    {isAdmin ? bi('አድሚን (Admin)', 'Admin') : bi('ተጫዋች (Player)', 'Player')}
                  </strong>
                </div>
              </div>

              {accountSettingsError && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-700 font-semibold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{accountSettingsError}</span>
                </div>
              )}

              {accountSettingsSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 font-semibold flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{accountSettingsSuccess}</span>
                </div>
              )}

              {/* Change Username Form */}
              <form onSubmit={handleUpdateUsernameSubmit} className="space-y-3 border-b border-slate-200 pb-5">
                <h3 className="text-sm font-black text-slate-900">
                  {bi('1. ዩዘርኔም ቀይር (Change Username)', '1. Change Username')}
                </h3>
                <div>
                  <label htmlFor="newUsernameInput" className="block text-xs font-bold text-slate-700 mb-1">
                    {bi('አዲስ ዩዘርኔም / ኢሜይል', 'New Username / Email')}
                  </label>
                  <input
                    id="newUsernameInput"
                    type="text"
                    required
                    minLength={3}
                    maxLength={80}
                    value={newUsernameInput}
                    onChange={(e) => setNewUsernameInput(e.target.value)}
                    placeholder={bi('አዲሱን ዩዘርኔም ያስገቡ', 'Enter new username')}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0E8A38] rounded-lg px-3 py-2.5 text-sm text-slate-900 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingUsername}
                  className="w-full py-2.5 rounded-lg bg-[#0E8A38] hover:bg-[#0B732E] disabled:opacity-50 text-white font-black text-xs cursor-pointer transition"
                >
                  {savingUsername
                    ? bi('በማስቀመጥ ላይ...', 'Saving Username...')
                    : bi('ዩዘርኔም አዘምን (Save to Firestore)', 'Update Username')}
                </button>
              </form>

              {/* Change Password Form */}
              <form onSubmit={handleUpdatePasswordSubmit} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900">
                    {bi('2. ፓስዎርድ ቀይር (Change Password)', '2. Change Password')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowAccountPasswords((p) => !p)}
                    className="text-xs font-bold text-[#0E8A38] flex items-center gap-1 cursor-pointer"
                  >
                    {showAccountPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showAccountPasswords ? bi('ደብቅ', 'Hide') : bi('አሳይ', 'Show')}</span>
                  </button>
                </div>

                <div>
                  <label htmlFor="currentPasswordInput" className="block text-xs font-bold text-slate-700 mb-1">
                    {bi('የአሁኑ ፓስዎርድ', 'Current Password')}
                  </label>
                  <input
                    id="currentPasswordInput"
                    type={showAccountPasswords ? 'text' : 'password'}
                    required
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    placeholder="••••••"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0E8A38] rounded-lg px-3 py-2.5 text-sm text-slate-900 outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="newPasswordInput" className="block text-xs font-bold text-slate-700 mb-1">
                    {bi('አዲስ ፓስዎርድ (ቢያንስ 6 ፊደል/ቁጥር)', 'New Password (min 6 chars)')}
                  </label>
                  <input
                    id="newPasswordInput"
                    type={showAccountPasswords ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder="••••••"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0E8A38] rounded-lg px-3 py-2.5 text-sm text-slate-900 outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="confirmNewPasswordInput" className="block text-xs font-bold text-slate-700 mb-1">
                    {bi('አዲሱን ፓስዎርድ በድጋሚ ያረጋግጡ', 'Confirm New Password')}
                  </label>
                  <input
                    id="confirmNewPasswordInput"
                    type={showAccountPasswords ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmNewPasswordInput}
                    onChange={(e) => setConfirmNewPasswordInput(e.target.value)}
                    placeholder="••••••"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#0E8A38] rounded-lg px-3 py-2.5 text-sm text-slate-900 outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingPassword}
                  className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-black text-xs cursor-pointer transition"
                >
                  {savingPassword
                    ? bi('በማዘመን ላይ...', 'Updating Password...')
                    : bi('ፓስዎርድ አዘምን (Save to Firestore)', 'Update Password')}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory New Password & Save Modal after Phone Password Recovery */}
      {user && wallet?.mustChangePassword && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={bi('አዲስ ፓስዎርድ ይሙሉና ሴቭ ያድርጉ', 'Set & Save New Password')}
        >
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] overflow-y-auto shadow-2xl text-slate-900 pb-[env(safe-area-inset-bottom)]">
            <div className="bg-[#0E8A38] text-white px-5 py-4 space-y-1">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-[#9AD84B]" />
                <h2 className="text-base font-black">
                  {bi('አዲስ ፓስዎርድ ይሙሉና ሴቭ ያድርጉ', 'Set & Save Your New Password')}
                </h2>
              </div>
              <p className="text-xs text-emerald-100">
                {bi(
                  `ቀሪ ሂሳብዎ (${formatETB(wallet.balance)}) እና ሙሉ የጨዋታ ታሪክዎ ሳይጠፋ ተመልሷል። እንዳይረሱ አዲስ ፓስዎርድ አስገብተው ሴቭ ያድርጉ!`,
                  `Your balance (${formatETB(wallet.balance)}) & full history are restored. Enter and save your new password so you never forget it!`,
                )}
              </p>
            </div>

            <form
              onSubmit={handleCompleteRecoveredPassword}
              autoComplete="on"
              className="p-5 space-y-4"
            >
              <div>
                <label htmlFor="recoveryUsernameDisplay" className="block text-xs font-bold text-slate-700 mb-1">
                  {bi('የመግቢያ ስልክ ቁጥር / ዩዘርኔም', 'Login Phone / Username')}
                </label>
                <input
                  id="recoveryUsernameDisplay"
                  name="username"
                  type="text"
                  autoComplete="username"
                  readOnly
                  value={extractPhoneFromAuthEmail(user.email) || displayAccountPhone}
                  className="w-full bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono-num font-bold text-slate-800 outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="recoveryNewPasswordInput" className="text-xs font-bold text-slate-700">
                    {bi('አዲስ ፓስዎርድ (ቢያንስ 6 ፊደል/ቁጥር)', 'New Password (min 6 chars)')}
                  </label>
                  <button
                    type="button"
                    onClick={() => setRecoveryShowPasswords((prev) => !prev)}
                    className="text-xs font-bold text-[#0E8A38] flex items-center gap-1 cursor-pointer"
                  >
                    {recoveryShowPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{recoveryShowPasswords ? bi('ደብቅ', 'Hide') : bi('አሳይ', 'Show')}</span>
                  </button>
                </div>
                <input
                  id="recoveryNewPasswordInput"
                  name="new-password"
                  type={recoveryShowPasswords ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoFocus
                  required
                  minLength={6}
                  value={recoveryNewPassword}
                  onChange={(e) => setRecoveryNewPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-[#0E8A38] rounded-lg px-3 py-2.5 text-sm text-slate-900 outline-none"
                />
              </div>

              <div>
                <label htmlFor="recoveryConfirmPasswordInput" className="block text-xs font-bold text-slate-700 mb-1">
                  {bi('አዲሱን ፓስዎርድ በድጋሚ ያረጋግጡ', 'Confirm New Password')}
                </label>
                <input
                  id="recoveryConfirmPasswordInput"
                  name="confirm-new-password"
                  type={recoveryShowPasswords ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={recoveryConfirmPassword}
                  onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-[#0E8A38] rounded-lg px-3 py-2.5 text-sm text-slate-900 outline-none"
                />
              </div>

              {recoveryNewPassword.length >= 6 &&
                recoveryNewPassword === recoveryConfirmPassword && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                    <p className="text-[11px] font-bold text-emerald-900">
                      {bi(
                        'ፓስዎርድዎን እንዳይረሱ ሴቭ ያድርጉ (Copy ወይም File Download):',
                        'Save your login credentials so you do not forget them:',
                      )}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleCopyRecoveredCredentials}
                        className="py-2 px-2.5 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{bi('መረጃ ቅዳ', 'Copy Info')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadRecoveredCredentials}
                        className="py-2 px-2.5 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{bi('ፋይል ሴቭ አድርግ', 'Save .txt')}</span>
                      </button>
                    </div>
                  </div>
                )}

              {recoveryModalError && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-700 font-semibold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{recoveryModalError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={savingRecoveredPassword}
                className="w-full py-3 px-4 rounded-xl bg-[#0E8A38] hover:bg-[#0B732E] disabled:opacity-50 text-white font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-[#9AD84B]" />
                <span>
                  {savingRecoveredPassword
                    ? bi('በማስቀመጥ ላይ...', 'Saving New Password...')
                    : bi(
                        'ፓስዎርድ ሴቭ አድርግና ወደ ታሪኬ ግባ',
                        'Save New Password & Open History',
                      )}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Subtle Celebratory Confetti Overlay */}
      <WinConfetti triggerKey={winCelebrateKey} />

      {/* Mobile Bottom Thumb Navigation Bar (Phone-style quick navigation for all ratios) */}
      {user && wallet && (
        <nav
          aria-label={bi('የስልክ የታች ማውጫ', 'Mobile bottom navigation')}
          className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] pb-[env(safe-area-inset-bottom)]"
        >
          <div className="grid grid-cols-5 items-stretch text-[10px] font-extrabold">
            {(
              [
                {
                  id: 'dashboard',
                  icon: LayoutGrid,
                  label: bi('ዳሽቦርድ', 'Hub'),
                  active: activeTab === 'dashboard',
                  onClick: () => openTab('dashboard'),
                },
                {
                  id: 'chicken',
                  icon: Footprints,
                  label: bi('ዶሮ ዝላይ', 'Chicken'),
                  active: activeTab === 'chicken',
                  onClick: () => openTab('chicken'),
                },
                {
                  id: 'sport',
                  icon: Trophy,
                  label: bi('እግር ኳስ', 'Football'),
                  active: activeTab === 'football',
                  onClick: () => openSportsSection('sport'),
                },
                {
                  id: 'wallet',
                  icon: Wallet,
                  label: bi('ቦርሳ', 'Wallet'),
                  active: activeTab === 'wallet',
                  onClick: () => openTab('wallet'),
                },
                {
                  id: 'history',
                  icon: History,
                  label: bi('ታሪክ', 'History'),
                  active: activeTab === 'history',
                  onClick: () => openTab('history'),
                },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className={`min-h-[56px] py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${
                    item.active
                      ? 'text-[#0E8A38] bg-[#EAF3ED]/70 border-t-2 border-t-[#0E8A38]'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${item.active ? 'text-[#0E8A38]' : 'text-slate-500'}`} />
                  <span className="truncate max-w-full">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-32 lg:bottom-5 right-4 left-4 sm:left-auto z-50 pointer-events-none">
          <div className="bg-slate-900 border border-slate-700 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 max-w-md mx-auto">
            {toast.type === 'success' && (
              <CheckCircle2 className="w-5 h-5 text-[#9AD84B] shrink-0" />
            )}
            {toast.type === 'error' && (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            {toast.type === 'info' && <Info className="w-5 h-5 text-amber-400 shrink-0" />}
            <p className="text-xs sm:text-sm font-bold">{toast.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
