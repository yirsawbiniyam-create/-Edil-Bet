import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAP_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  BetRecord,
  FootballPopularityRecord,
  FootballTicket,
  FootballTicketPick,
  GameConfig,
  TelebirrSettings,
  UserWallet,
  WeeklyLeaderboardEntry,
  WithdrawalRecord,
} from '../types';
import {
  CASHOUT_MAX_MINUTE,
  CASHOUT_MAX_PAYOUT_RATIO,
  CASHOUT_MIN_AMOUNT,
  CASHOUT_MIN_MINUTE,
  computeFootballCashout,
  GameConfigValues,
} from './gameEngine';
import { evaluateFootballPickOutcome } from './footballMarkets';

export const PHONE_REGEX = /^0[79][0-9]{8}$/;
export const TX_ID_REGEX = /^[A-Z0-9]{6,24}$/;
export const DAILY_BONUS_AMOUNT = 10;

export function getTodayBonusKey(date = new Date()): string {
  return `${date.getUTCFullYear()}_${date.getUTCMonth() + 1}_${date.getUTCDate()}`;
}

export function getDailyBonusClaimId(uid: string, dayKey = getTodayBonusKey()): string {
  return `${uid}_${dayKey}`;
}

export function getCurrentWeekKey(nowMs = Date.now()): string {
  return `W${Math.floor((nowMs + 259200000) / 604800000)}`;
}

export function getWeeklyLeaderboardId(uid: string, weekKey = getCurrentWeekKey()): string {
  return `${uid}_${weekKey}`;
}

export function maskPlayerDisplay(rawName: string): string {
  const clean = (rawName || '').trim();
  if (/^0[79][0-9]{8}$/.test(clean)) {
    return `${clean.slice(0, 4)}****${clean.slice(-2)}`;
  }
  if (clean.length <= 2) {
    return `${clean || 'ተጫ'}***`.slice(0, 32);
  }
  return `${clean.slice(0, 2)}***`.slice(0, 32);
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\s+/g, '').replace(/^\+251/, '0');
  if (/^[79][0-9]{8}$/.test(digits)) {
    return `0${digits}`;
  }
  return digits;
}

export function normalizeTxId(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function makeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function phoneToAuthEmail(phone: string): string {
  return `${phone}@edilbet.app`;
}

export async function registerPlayerWithPhone(params: {
  rawPhone: string;
  password: string;
  playerName?: string;
}): Promise<User> {
  const phone = normalizePhone(params.rawPhone);
  const password = params.password;
  const cleanName = (params.playerName || '').trim().slice(0, 60);

  if (!PHONE_REGEX.test(phone)) {
    throw new Error('እባክዎ ትክክለኛ የኢትዮጵያ ስልክ ቁጥር ያስገቡ (09XXXXXXXX ወይም 07XXXXXXXX)።');
  }
  if (password.length < 6) {
    throw new Error('ፓስዎርዱ ቢያንስ 6 ፊደል ወይም ቁጥር መሆን አለበት።');
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, phoneToAuthEmail(phone), password);
    const displayName = cleanName || phone;
    await updateProfile(cred.user, { displayName });
    await ensureUserWalletAndAdmin(cred.user, phone, displayName);
    return cred.user;
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (code === 'auth/email-already-in-use') {
      throw new Error(
        'ይህ ስልክ ቁጥር ቀደም ብሎ ተመዝግቧል! ድጋሚ መመዝገብ አይቻልም — እባክዎ "ሎጊን (Login)" የሚለውን ተጠቅመው ይግቡ።',
      );
    }
    if (code === 'auth/operation-not-allowed') {
      throw new Error('AUTH_PROVIDER_DISABLED');
    }
    if (code === 'auth/weak-password') {
      throw new Error('ፓስዎርዱ በጣም ደካማ ነው። ቢያንስ 6 ቁጥር ወይም ፊደል ይጠቀሙ።');
    }
    throw error;
  }
}

export async function loginPlayerWithPhone(params: {
  rawPhone: string;
  password: string;
}): Promise<User> {
  const phone = normalizePhone(params.rawPhone);
  const password = params.password;

  if (!PHONE_REGEX.test(phone)) {
    throw new Error('እባክዎ ትክክለኛ የስልክ ቁጥር ያስገቡ (09XXXXXXXX ወይም 07XXXXXXXX)።');
  }
  if (!password) {
    throw new Error('እባክዎ ፓስዎርድዎን ያስገቡ።');
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, phoneToAuthEmail(phone), password);
    await ensureUserWalletAndAdmin(cred.user, phone);
    return cred.user;
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (code === 'auth/operation-not-allowed') {
      throw new Error('AUTH_PROVIDER_DISABLED');
    }
    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found'
    ) {
      throw new Error(
        'ያስገቡት ስልክ ቁጥር ወይም ፓስዎርድ ትክክል አይደለም። ገና ካልተመዘገቡ መጀመሪያ "አዲስ ተመዝገብ" የሚለውን ይጫኑ።',
      );
    }
    throw error;
  }
}

export async function ensureUserWalletAndAdmin(
  user: User,
  explicitPhone?: string,
  explicitName?: string,
): Promise<boolean> {
  const derivedPhone =
    explicitPhone ||
    (user.email?.endsWith('@edilbet.app') ? user.email.split('@')[0] : undefined);

  const userRef = doc(db, 'users', user.uid);
  try {
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      const displayName = (
        explicitName ||
        user.displayName ||
        derivedPhone ||
        user.email?.split('@')[0] ||
        'ተጫዋች'
      ).slice(0, 80);
      await setDoc(userRef, {
        uid: user.uid,
        displayName,
        balance: 0,
        hasDeposited: false,
        totalDeposited: 0,
        totalWithdrawn: 0,
        lastActionType: 'init',
        lastActionRef: 'init',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }

  if (derivedPhone && PHONE_REGEX.test(derivedPhone)) {
    const privateRef = doc(db, 'users', user.uid, 'private', 'info');
    try {
      const privSnap = await getDoc(privateRef);
      if (!privSnap.exists()) {
        await setDoc(privateRef, {
          uid: user.uid,
          email: (user.email || phoneToAuthEmail(derivedPhone)).slice(0, 150),
          telebirrPhone: derivedPhone,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/private/info`);
    }
  }

  let isAdmin = false;
  const isBootstrapAdmin =
    Boolean(user.emailVerified) &&
    user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

  try {
    const adminRef = doc(db, 'admins', user.uid);
    const adminSnap = await getDoc(adminRef);
    if (adminSnap.exists()) {
      isAdmin = true;
    } else if (isBootstrapAdmin) {
      await setDoc(adminRef, {
        uid: user.uid,
        email: (user.email || BOOTSTRAP_ADMIN_EMAIL).slice(0, 150),
        createdAt: serverTimestamp(),
      });
      isAdmin = true;
    }
  } catch (error) {
    if (isBootstrapAdmin) {
      handleFirestoreError(error, OperationType.WRITE, `admins/${user.uid}`);
    }
  }

  if (isAdmin) {
    try {
      const settingsRef = doc(db, 'settings', 'telebirr');
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) {
        await setDoc(settingsRef, {
          depositPhone: '0911000000',
          withdrawalPhone: '0911000000',
          accountName: 'እድል ቤት · Edil Bet',
          minDeposit: 100,
          minWithdraw: 500,
          houseWinRate: 0.28,
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/telebirr');
    }
  }

  return isAdmin;
}

export async function submitTelebirrDeposit(params: {
  user: User;
  wallet: UserWallet;
  settings: TelebirrSettings;
  rawPhone: string;
  rawTxId: string;
  amount: number;
  registeredPhone: string | null;
}): Promise<{ txId: string; amount: number }> {
  const { user, wallet, settings, rawPhone, rawTxId, amount, registeredPhone } = params;
  const playerPhone = normalizePhone(rawPhone);
  const txId = normalizeTxId(rawTxId);

  if (!PHONE_REGEX.test(playerPhone)) {
    throw new Error('እባክዎ ትክክለኛ የኢትዮጵያ ቴሌብር ስልክ ቁጥር ያስገቡ (09XXXXXXXX ወይም 07XXXXXXXX)።');
  }
  if (!TX_ID_REGEX.test(txId)) {
    throw new Error('ትራንሳክሽን አይዲው ትክክል አይደለም (ቢያንስ 6 ፊደል ወይም ቁጥር ይሁን)።');
  }
  if (!Number.isFinite(amount) || amount < 100) {
    throw new Error('ዝቅተኛው የዲፖሲት መጠን 100 ብር ነው።');
  }
  if (amount > 500000) {
    throw new Error('ከፍተኛው የአንድ ጊዜ ዲፖሲት 500,000 ብር ነው።');
  }

  // Verify transaction ID has not been used previously
  const usedTxRef = doc(db, 'usedTxIds', txId);
  try {
    const existingTx = await getDoc(usedTxRef);
    if (existingTx.exists()) {
      throw new Error('ይህ ትራንሳክሽን አይዲ ቀደም ብሎ ጥቅም ላይ ውሏል! አዲስ ትራንሳክሽን አይዲ ያስገቡ።');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('ቀደም ብሎ')) {
      throw err;
    }
    // Permission denied on getDoc means the document already exists and belongs to another user!
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
      throw new Error('ይህ ትራንሳክሽን አይዲ ቀደም ብሎ በሌላ ዲፖሲት ጥቅም ላይ ውሏል!');
    }
  }

  const batch = writeBatch(db);
  const depositRef = doc(db, 'deposits', txId);
  const ledgerId = makeDocId('led');
  const ledgerRef = doc(db, 'ledger', ledgerId);
  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');

  const safeName = (wallet.displayName || user.displayName || 'ተጫዋች').slice(0, 80);
  const effectivePhone = registeredPhone || playerPhone;

  batch.set(usedTxRef, {
    txId,
    uid: user.uid,
    amount,
    createdAt: serverTimestamp(),
  });

  batch.set(depositRef, {
    id: txId,
    uid: user.uid,
    playerName: safeName,
    playerPhone: effectivePhone,
    systemPhone: settings.depositPhone,
    txId,
    amount,
    status: 'verified',
    verifiedMessage: 'ትክክል ነው — የቴሌብር መተላለፍ ተረጋግጧል',
    createdAt: serverTimestamp(),
  });

  batch.set(ledgerRef, {
    id: ledgerId,
    uid: user.uid,
    playerName: safeName,
    playerPhone: effectivePhone,
    type: 'income',
    category: 'deposit',
    amount,
    referenceId: txId,
    description: `በቴሌብር ዲፖሲት (${txId})`.slice(0, 180),
    createdAt: serverTimestamp(),
  });

  if (!wallet.hasDeposited || !registeredPhone) {
    batch.set(privateRef, {
      uid: user.uid,
      email: (user.email || 'user@example.com').slice(0, 150),
      telebirrPhone: effectivePhone,
      updatedAt: serverTimestamp(),
    });
  }

  batch.update(userRef, {
    balance: Number((wallet.balance + amount).toFixed(2)),
    hasDeposited: true,
    totalDeposited: Number((wallet.totalDeposited + amount).toFixed(2)),
    lastActionType: 'deposit',
    lastActionRef: txId,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `deposits/${txId}`);
  }

  return { txId, amount };
}

export async function recordGameBet(params: {
  uid: string;
  wallet: UserWallet;
  gameType: BetRecord['gameType'];
  gameName: string;
  betAmount: number;
  multiplier: number;
  choiceText: string;
  resultText: string;
  won: boolean;
  payout: number;
  gameConfig?: GameConfig | null;
}): Promise<string> {
  const {
    uid,
    wallet,
    gameType,
    gameName,
    betAmount,
    multiplier,
    choiceText,
    resultText,
    won,
    payout,
    gameConfig,
  } = params;

  const minBet = gameConfig?.minBet ?? 1;
  const maxBet = gameConfig?.maxBet ?? 500000;

  if (!Number.isFinite(betAmount) || betAmount < minBet) {
    throw new Error(`ዝቅተኛው የመወራረጃ መጠን ${minBet} ብር ነው።`);
  }
  if (betAmount > maxBet) {
    throw new Error(`ከፍተኛው የጠረጴዛ መወራረጃ ገደብ ${maxBet.toLocaleString()} ብር ነው።`);
  }
  if (betAmount > wallet.balance) {
    throw new Error('በቂ ቀሪ ሂሳብ የለዎትም።');
  }

  const betId = makeDocId('bet');
  const weekKey = getCurrentWeekKey();
  const lbId = getWeeklyLeaderboardId(uid, weekKey);
  const betRef = doc(db, 'bets', betId);
  const userRef = doc(db, 'users', uid);
  const winnerRef = doc(db, 'recentWinners', betId);
  const lbRef = doc(db, 'weeklyLeaderboard', lbId);
  const safeGameName = gameName.slice(0, 80);

  try {
    await runTransaction(db, async (tx) => {
      const [userSnap, lbSnap] = await Promise.all([
        tx.get(userRef),
        won && payout > 0 ? tx.get(lbRef) : Promise.resolve(null),
      ]);
      if (!userSnap.exists()) {
        throw new Error('የተጫዋች ቦርሳ አልተገኘም።');
      }
      const currentWallet = userSnap.data() as UserWallet;
      if (currentWallet.balance < betAmount) {
        throw new Error('በቂ ቀሪ ሂሳብ የለዎትም።');
      }
      const newBalance = Math.max(0, Number((currentWallet.balance - betAmount + payout).toFixed(2)));

      tx.set(betRef, {
        id: betId,
        uid,
        gameType,
        gameName: safeGameName,
        betAmount,
        multiplier,
        choiceText: choiceText.slice(0, 200),
        resultText: resultText.slice(0, 250),
        won,
        payout,
        createdAt: serverTimestamp(),
      });

      tx.update(userRef, {
        balance: newBalance,
        lastActionType: 'bet',
        lastActionRef: betId,
        updatedAt: serverTimestamp(),
      });

      if (won && payout > 0) {
        const playerMask = maskPlayerDisplay(currentWallet.displayName);
        tx.set(winnerRef, {
          id: betId,
          uid,
          playerMask,
          gameType,
          gameName: safeGameName,
          multiplier,
          payout,
          createdAt: serverTimestamp(),
        });

        if (lbSnap && lbSnap.exists()) {
          const existingLb = lbSnap.data() as WeeklyLeaderboardEntry;
          tx.update(lbRef, {
            playerMask,
            totalWinnings: Number((existingLb.totalWinnings + payout).toFixed(2)),
            winsCount: existingLb.winsCount + 1,
            biggestWin: Number(Math.max(existingLb.biggestWin, payout).toFixed(2)),
            lastGameName: safeGameName,
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.set(lbRef, {
            id: lbId,
            uid,
            weekKey,
            playerMask,
            totalWinnings: Number(payout.toFixed(2)),
            winsCount: 1,
            biggestWin: Number(payout.toFixed(2)),
            lastGameName: safeGameName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('በቂ ቀሪ ሂሳብ')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `bets/${betId}`);
  }

  return betId;
}

export async function submitTelebirrWithdrawal(params: {
  user: User;
  wallet: UserWallet;
  settings: TelebirrSettings;
  registeredPhone: string | null;
  rawPhone: string;
  amount: number;
}): Promise<string> {
  const { user, wallet, settings, registeredPhone, rawPhone, amount } = params;
  const playerPhone = normalizePhone(rawPhone);

  if (!wallet.hasDeposited || !registeredPhone) {
    throw new Error('ዊዝድሮው ለማድረግ መጀመሪያ ቢያንስ አንድ ጊዜ በቴሌብር ዲፖሲት ማድረግ አለብዎት።');
  }
  if (!PHONE_REGEX.test(playerPhone)) {
    throw new Error('እባክዎ ትክክለኛ የቴሌብር ስልክ ቁጥር ያስገቡ (09XXXXXXXX)።');
  }
  if (playerPhone !== registeredPhone) {
    throw new Error(
      `ዊዝድሮው ማድረግ የሚቻለው መጀመሪያ ዲፖሲት ባደረጉበት ቴሌብር ስልክ ቁጥር (${registeredPhone}) ብቻ ነው!`,
    );
  }
  if (!Number.isFinite(amount) || amount < 500) {
    throw new Error('ዝቅተኛው የዊዝድሮው መጠን 500 ብር ነው።');
  }
  if (amount > wallet.balance) {
    throw new Error('የጠየቁት መጠን ካለዎት ቀሪ ሂሳብ ይበልጣል።');
  }

  const withdrawalId = makeDocId('wd');
  const batch = writeBatch(db);
  const withdrawalRef = doc(db, 'withdrawals', withdrawalId);
  const userRef = doc(db, 'users', user.uid);

  batch.set(withdrawalRef, {
    id: withdrawalId,
    uid: user.uid,
    playerName: (wallet.displayName || user.displayName || 'ተጫዋች').slice(0, 80),
    playerPhone,
    sourceSystemPhone: settings.withdrawalPhone || settings.depositPhone,
    amount,
    status: 'pending',
    systemVerified: false,
    systemVerifiedText: 'ሲስተሙ የዲፖሲት እና የቀሪ ሂሳብ ትክክለኛነት እያረጋገጠ ነው...',
    adminPinConfirmed: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(userRef, {
    balance: Number((wallet.balance - amount).toFixed(2)),
    totalWithdrawn: Number((wallet.totalWithdrawn + amount).toFixed(2)),
    lastActionType: 'withdraw',
    lastActionRef: withdrawalId,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `withdrawals/${withdrawalId}`);
  }

  return withdrawalId;
}

export async function runSystemWithdrawalVerification(withdrawalId: string): Promise<void> {
  const withdrawalRef = doc(db, 'withdrawals', withdrawalId);
  try {
    await updateDoc(withdrawalRef, {
      systemVerified: true,
      systemVerifiedText: 'ትክክል ነው — ተረጋግጧል',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `withdrawals/${withdrawalId}`);
  }
}

export async function adminSaveTelebirrSettings(params: {
  adminUid: string;
  depositPhone: string;
  withdrawalPhone: string;
  accountName: string;
  houseWinRate: number;
}): Promise<void> {
  const depPhone = normalizePhone(params.depositPhone);
  const wdrPhone = normalizePhone(params.withdrawalPhone || params.depositPhone);
  const name = params.accountName.trim().slice(0, 80);

  if (!PHONE_REGEX.test(depPhone)) {
    throw new Error('እባክዎ ትክክለኛ የዲፖሲት ቴሌብር ስልክ ቁጥር ያስገቡ (09XXXXXXXX ወይም 07XXXXXXXX)።');
  }
  if (!PHONE_REGEX.test(wdrPhone)) {
    throw new Error('እባክዎ ትክክለኛ የዊዝድሮው ቴሌብር ስልክ ቁጥር ያስገቡ (09XXXXXXXX ወይም 07XXXXXXXX)።');
  }
  if (name.length < 2) {
    throw new Error('እባክዎ የቴሌብር አካውንት ስም ያስገቡ።');
  }

  const rate = Math.min(0.45, Math.max(0.1, Number(params.houseWinRate)));
  const settingsRef = doc(db, 'settings', 'telebirr');

  try {
    await setDoc(settingsRef, {
      depositPhone: depPhone,
      withdrawalPhone: wdrPhone,
      accountName: name,
      minDeposit: 100,
      minWithdraw: 500,
      houseWinRate: rate,
      updatedBy: params.adminUid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/telebirr');
  }
}

export async function adminSaveGameLogo(params: {
  adminUid: string;
  logoDataUrl: string;
}): Promise<void> {
  const trimmed = params.logoDataUrl.trim();
  if (trimmed.length > 200000) {
    throw new Error('የሎጎው ምስል መጠን በጣም ትልቅ ነው። እባክዎ አነስ ያለ ምስል ይምረጡ።');
  }
  if (
    trimmed.length > 0 &&
    !trimmed.startsWith('data:image/') &&
    !trimmed.startsWith('https://')
  ) {
    throw new Error('እባክዎ ትክክለኛ የምስል ፋይል ወይም https:// ሊንክ ያስገቡ።');
  }

  const brandingRef = doc(db, 'settings', 'branding');
  try {
    await setDoc(brandingRef, {
      logoDataUrl: trimmed,
      updatedBy: params.adminUid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/branding');
  }
}

export async function adminSaveGameConfig(params: {
  adminUid: string;
  config: GameConfigValues;
}): Promise<void> {
  const c = params.config;
  const minBet = Math.round(Number(c.minBet));
  const maxBet = Math.round(Number(c.maxBet));

  if (!Number.isFinite(minBet) || minBet < 1 || minBet > 50000) {
    throw new Error('ዝቅተኛው የመወራረጃ ገደብ ከ 1 እስከ 50,000 ብር መሆን አለበት።');
  }
  if (!Number.isFinite(maxBet) || maxBet < minBet || maxBet > 500000) {
    throw new Error('ከፍተኛው የጠረጴዛ ገደብ ከዝቅተኛው በላይ እና እስከ 500,000 ብር መሆን አለበት።');
  }

  const clamp = (val: number, min: number, max: number) =>
    Number(Math.min(max, Math.max(min, Number(val) || min)).toFixed(2));

  const payload = {
    minBet,
    maxBet,
    houseWinRate: clamp(c.houseWinRate, 0.05, 0.5),
    singleDiceRangeOdds: clamp(c.singleDiceRangeOdds, 1.2, 5.0),
    singleDiceExactOdds: clamp(c.singleDiceExactOdds, 2.0, 12.0),
    doubleDiceRangeOdds: clamp(c.doubleDiceRangeOdds, 1.2, 5.0),
    doubleDiceLucky7Odds: clamp(c.doubleDiceLucky7Odds, 2.0, 12.0),
    coinOdds: clamp(c.coinOdds, 1.2, 4.0),
    luckyOdds: clamp(c.luckyOdds, 5.0, 35.0),
    footballOddsScale: clamp(c.footballOddsScale, 0.7, 1.5),
    footballMaxOdds: clamp(c.footballMaxOdds, 5, 500),
    updatedBy: params.adminUid,
    updatedAt: serverTimestamp(),
  };

  const configRef = doc(db, 'settings', 'gameConfig');
  try {
    await setDoc(configRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/gameConfig');
  }
}

export async function adminCompleteWithdrawalWithPin(params: {
  withdrawal: WithdrawalRecord;
  adminUid: string;
  telebirrPin: string;
}): Promise<void> {
  const { withdrawal, adminUid, telebirrPin } = params;
  const cleanPin = telebirrPin.trim();
  if (!/^\d{4,6}$/.test(cleanPin)) {
    throw new Error('እባክዎ ትክክለኛ ባለ 4 እስከ 6 አሃዝ የቴሌብር ሚስጥር ቁጥር (PIN) ያስገቡ።');
  }
  if (!withdrawal.systemVerified) {
    throw new Error('ሲስተሙ ይህን ዊዝድሮው ገና አላረጋገጠውም።');
  }

  const batch = writeBatch(db);
  const withdrawalRef = doc(db, 'withdrawals', withdrawal.id);
  const ledgerId = makeDocId('led');
  const ledgerRef = doc(db, 'ledger', ledgerId);

  batch.update(withdrawalRef, {
    status: 'completed',
    adminPinConfirmed: true,
    processedBy: adminUid,
    updatedAt: serverTimestamp(),
  });

  batch.set(ledgerRef, {
    id: ledgerId,
    uid: withdrawal.uid,
    playerName: withdrawal.playerName.slice(0, 80),
    playerPhone: withdrawal.playerPhone,
    type: 'expense',
    category: 'withdrawal',
    amount: withdrawal.amount,
    referenceId: withdrawal.id,
    description: `የቴሌብር ዊዝድሮው ክፍያ ወደ ${withdrawal.playerPhone}`.slice(0, 180),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `withdrawals/${withdrawal.id}`);
  }
}

export async function adminRejectAndRefundWithdrawal(params: {
  withdrawal: WithdrawalRecord;
  adminUid: string;
}): Promise<void> {
  const { withdrawal, adminUid } = params;
  const userRef = doc(db, 'users', withdrawal.uid);
  const withdrawalRef = doc(db, 'withdrawals', withdrawal.id);

  let playerWallet: UserWallet;
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      throw new Error('የተጫዋቹ ሂሳብ አልተገኘም።');
    }
    playerWallet = snap.data() as UserWallet;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${withdrawal.uid}`);
  }

  const batch = writeBatch(db);
  batch.update(withdrawalRef, {
    status: 'rejected',
    processedBy: adminUid,
    updatedAt: serverTimestamp(),
  });
  batch.update(userRef, {
    balance: Number((playerWallet.balance + withdrawal.amount).toFixed(2)),
    totalWithdrawn: Math.max(0, Number((playerWallet.totalWithdrawn - withdrawal.amount).toFixed(2))),
    lastActionType: 'refund',
    lastActionRef: withdrawal.id,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `withdrawals/${withdrawal.id}`);
  }
}

export async function claimDailyLoginBonus(params: {
  uid: string;
  wallet: UserWallet;
}): Promise<{ amount: number; dayKey: string }> {
  const { uid, wallet } = params;
  const dayKey = getTodayBonusKey();
  const claimId = getDailyBonusClaimId(uid, dayKey);
  const bonusRef = doc(db, 'dailyBonuses', claimId);
  const userRef = doc(db, 'users', uid);

  try {
    const existing = await getDoc(bonusRef);
    if (existing.exists()) {
      throw new Error('የዛሬውን ዕለታዊ ጉርሻ ቀደም ብለው ወስደዋል! ነገ እንደገና ይመለሱ።');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('ቀደም ብለው')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.GET, `dailyBonuses/${claimId}`);
  }

  const batch = writeBatch(db);
  batch.set(bonusRef, {
    id: claimId,
    uid,
    dayKey,
    amount: DAILY_BONUS_AMOUNT,
    createdAt: serverTimestamp(),
  });
  batch.update(userRef, {
    balance: Number((wallet.balance + DAILY_BONUS_AMOUNT).toFixed(2)),
    lastActionType: 'bonus',
    lastActionRef: claimId,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `dailyBonuses/${claimId}`);
  }

  return { amount: DAILY_BONUS_AMOUNT, dayKey };
}

export async function placeLiveFootballTicket(params: {
  uid: string;
  wallet: UserWallet;
  betAmount: number;
  totalOdds: number;
  picks: FootballTicketPick[];
  choiceText: string;
  initialMinute?: number;
  leagueLabelsByMatch?: Record<string, string>;
  gameConfig?: GameConfig | null;
}): Promise<FootballTicket> {
  const {
    uid,
    wallet,
    betAmount,
    totalOdds,
    picks,
    choiceText,
    initialMinute = 1,
    leagueLabelsByMatch = {},
    gameConfig,
  } = params;

  const minBet = gameConfig?.minBet ?? 1;
  const maxBet = gameConfig?.maxBet ?? 500000;

  if (picks.length < 1 || picks.length > 8) {
    throw new Error('በአንድ ትኬት ከ 1 እስከ 8 ጨዋታዎች ብቻ መምረጥ ይችላሉ።');
  }
  if (!Number.isFinite(betAmount) || betAmount < minBet) {
    throw new Error(`ዝቅተኛው የመወራረጃ መጠን ${minBet} ብር ነው።`);
  }
  if (betAmount > maxBet) {
    throw new Error(`ከፍተኛው የጠረጴዛ መወራረጃ ገደብ ${maxBet.toLocaleString()} ብር ነው።`);
  }
  if (betAmount > wallet.balance) {
    throw new Error('በቂ ቀሪ ሂሳብ የለዎትም።');
  }

  const ticketId = makeDocId('ft');
  const ticketRef = doc(db, 'footballTickets', ticketId);
  const userRef = doc(db, 'users', uid);
  const potentialPayout = Number((betAmount * totalOdds).toFixed(2));
  const safeChoiceText = choiceText.slice(0, 200);
  const safeMinute = Math.min(85, Math.max(1, Math.round(initialMinute)));
  const initialQuote = computeFootballCashout(picks, betAmount, potentialPayout, safeMinute);

  const initialData = {
    id: ticketId,
    uid,
    betAmount,
    totalOdds,
    potentialPayout,
    picksCount: picks.length,
    choiceText: safeChoiceText,
    picks,
    currentMinute: safeMinute,
    cashoutOffer: initialQuote.offer,
    cashoutEligible: initialQuote.eligible,
    status: 'live' as const,
    payout: 0,
    resultText:
      safeMinute > 1
        ? `ላይቭ ጨዋታ ተጀምሯል (${safeMinute}')`
        : "ጨዋታዎቹ ተጀምረዋል (1')",
  };

  try {
    await runTransaction(db, async (tx) => {
      const popRefs = picks.map((p) => doc(db, 'footballPopularity', p.matchId));
      const [userSnap, ...popSnaps] = await Promise.all([
        tx.get(userRef),
        ...popRefs.map((ref) => tx.get(ref)),
      ]);
      if (!userSnap.exists()) {
        throw new Error('የተጫዋች ቦርሳ አልተገኘም።');
      }
      const currentWallet = userSnap.data() as UserWallet;
      if (currentWallet.balance < betAmount) {
        throw new Error('በቂ ቀሪ ሂሳብ የለዎትም።');
      }
      const nextBalance = Math.max(0, Number((currentWallet.balance - betAmount).toFixed(2)));

      tx.set(ticketRef, {
        ...initialData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.update(userRef, {
        balance: nextBalance,
        lastActionType: 'football_place',
        lastActionRef: ticketId,
        updatedAt: serverTimestamp(),
      });

      picks.forEach((p, idx) => {
        const popRef = popRefs[idx];
        const popSnap = popSnaps[idx];
        const addHome =
          p.market === '1' ||
          p.market === '1X' ||
          p.market === 'DNB_1' ||
          p.market === 'HCP_H1' ||
          p.market === 'FH_1' ||
          p.market === 'C_1_GG' ||
          p.market === 'C_1_O25'
            ? 1
            : 0;
        const addDraw = p.market === 'X' || p.market === 'FH_X' || p.market === 'WM_D' ? 1 : 0;
        const addAway =
          p.market === '2' ||
          p.market === 'X2' ||
          p.market === 'DNB_2' ||
          p.market === 'HCP_AP1' ||
          p.market === 'FH_2' ||
          p.market === 'C_2_GG' ||
          p.market === 'C_2_O25'
            ? 1
            : 0;
        const leagueLabel = (leagueLabelsByMatch[p.matchId] || 'Football').slice(0, 80);

        if (popSnap.exists()) {
          const existing = popSnap.data() as FootballPopularityRecord;
          tx.update(popRef, {
            home: p.home.slice(0, 80),
            away: p.away.slice(0, 80),
            homeCode: p.homeCode.slice(0, 6),
            awayCode: p.awayCode.slice(0, 6),
            leagueLabel,
            homeBets: existing.homeBets + addHome,
            drawBets: existing.drawBets + addDraw,
            awayBets: existing.awayBets + addAway,
            totalBets: existing.totalBets + 1,
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.set(popRef, {
            matchId: p.matchId,
            home: p.home.slice(0, 80),
            away: p.away.slice(0, 80),
            homeCode: p.homeCode.slice(0, 6),
            awayCode: p.awayCode.slice(0, 6),
            leagueLabel,
            homeBets: addHome,
            drawBets: addDraw,
            awayBets: addAway,
            totalBets: 1,
            updatedAt: serverTimestamp(),
          });
        }
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('በቂ ቀሪ ሂሳብ')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `footballTickets/${ticketId}`);
  }

  return initialData as unknown as FootballTicket;
}

export async function syncLiveFootballTicketProgress(params: {
  ticketId: string;
  picks: FootballTicketPick[];
  currentMinute: number;
  cashoutOffer: number;
  cashoutEligible: boolean;
  resultText: string;
}): Promise<void> {
  const { ticketId, picks, currentMinute, cashoutOffer, cashoutEligible, resultText } = params;
  const ticketRef = doc(db, 'footballTickets', ticketId);
  try {
    await updateDoc(ticketRef, {
      picks,
      currentMinute,
      cashoutOffer,
      cashoutEligible,
      resultText: resultText.slice(0, 250),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal if ticket already settled concurrently
  }
}

export async function settleOrCashoutFootballTicket(params: {
  uid: string;
  ticket: FootballTicket;
  mode: 'cashout' | 'full_time';
  picks: FootballTicketPick[];
  minute: number;
}): Promise<{ status: 'cashed_out' | 'won' | 'lost'; payout: number; resultText: string }> {
  const { uid, ticket, mode, picks, minute } = params;
  const ticketRef = doc(db, 'footballTickets', ticket.id);
  const userRef = doc(db, 'users', uid);
  const betRef = doc(db, 'bets', ticket.id);
  const winnerRef = doc(db, 'recentWinners', ticket.id);

  let finalStatus: 'cashed_out' | 'won' | 'lost' = 'lost';
  let finalPayout = 0;
  let resultText = '';

  if (mode === 'cashout') {
    if (minute < CASHOUT_MIN_MINUTE || minute > CASHOUT_MAX_MINUTE) {
      throw new Error(
        `በካሽአውት ህግ መሰረት ካሽአውት የሚቻለው ከ ${CASHOUT_MIN_MINUTE}' እስከ ${CASHOUT_MAX_MINUTE}' ደቂቃ ብቻ ነው።`,
      );
    }
    const quote = computeFootballCashout(
      picks,
      ticket.betAmount,
      ticket.potentialPayout,
      minute,
    );
    if (!quote.eligible || quote.offer < CASHOUT_MIN_AMOUNT) {
      throw new Error(quote.reason);
    }
    const maxAllowed = Number((ticket.potentialPayout * CASHOUT_MAX_PAYOUT_RATIO).toFixed(2));
    finalStatus = 'cashed_out';
    finalPayout = Math.min(maxAllowed, quote.offer);
    const scoreSummary = picks
      .map((p) => `${p.homeCode} ${p.homeGoals}-${p.awayGoals} ${p.awayCode}`)
      .join(' | ');
    resultText = `በ ${minute}' ካሽአውት (${finalPayout.toFixed(2)} ብር) · ${scoreSummary}`.slice(0, 250);
  } else {
    let anyLost = false;
    let effectiveOdds = 1;
    let voidCount = 0;

    for (const p of picks) {
      const outcome = evaluateFootballPickOutcome(p, true);
      if (outcome === 'loss') {
        anyLost = true;
        break;
      } else if (outcome === 'void') {
        voidCount += 1;
      } else {
        effectiveOdds *= p.odd;
      }
    }

    const cappedEffectiveOdds = Math.min(ticket.totalOdds, Number(effectiveOdds.toFixed(2)));
    finalStatus = anyLost ? 'lost' : 'won';
    finalPayout = anyLost
      ? 0
      : voidCount === picks.length
        ? ticket.betAmount
        : Math.min(
            ticket.potentialPayout,
            Number((ticket.betAmount * cappedEffectiveOdds).toFixed(2)),
          );
    const scoreLine = picks
      .map((p) => `${p.home} ${p.homeGoals}-${p.awayGoals} ${p.away}`)
      .join(' | ');
    resultText = (
      voidCount > 0 && !anyLost
        ? `${scoreLine} · DNB አቻ (ብር ተመልሷል)`
        : scoreLine
    ).slice(0, 250);
  }

  const weekKey = getCurrentWeekKey();
  const lbId = getWeeklyLeaderboardId(uid, weekKey);
  const lbRef = doc(db, 'weeklyLeaderboard', lbId);
  const countsTowardLeaderboard = finalPayout > ticket.betAmount;

  try {
    await runTransaction(db, async (tx) => {
      const [userSnap, ticketSnap, lbSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(ticketRef),
        countsTowardLeaderboard ? tx.get(lbRef) : Promise.resolve(null),
      ]);
      if (!userSnap.exists() || !ticketSnap.exists()) {
        throw new Error('ትኬቱ ወይም የተጫዋቹ ቦርሳ አልተገኘም።');
      }
      const liveTicket = ticketSnap.data() as FootballTicket;
      if (liveTicket.status !== 'live') {
        throw new Error('ይህ ትኬት ቀድሞ ተዘግቷል።');
      }
      const currentWallet = userSnap.data() as UserWallet;
      const nextBalance = Math.max(0, Number((currentWallet.balance + finalPayout).toFixed(2)));
      const gameName =
        finalStatus === 'cashed_out'
          ? `እግር ኳስ ካሽአውት (${ticket.picksCount} ጨዋታ)`
          : ticket.picksCount > 1
            ? `እግር ኳስ (${ticket.picksCount} ጨዋታ)`
            : 'የእግር ኳስ ቤቲንግ';
      const safeGameName = gameName.slice(0, 80);

      tx.update(ticketRef, {
        picks,
        currentMinute: mode === 'cashout' ? minute : 90,
        cashoutOffer: 0,
        cashoutEligible: false,
        status: finalStatus,
        payout: finalPayout,
        resultText,
        updatedAt: serverTimestamp(),
      });

      tx.update(userRef, {
        balance: nextBalance,
        lastActionType: 'football_settle',
        lastActionRef: ticket.id,
        updatedAt: serverTimestamp(),
      });

      const betWon = finalPayout > 0;
      tx.set(betRef, {
        id: ticket.id,
        uid,
        gameType: 'football',
        gameName: safeGameName,
        betAmount: ticket.betAmount,
        multiplier: ticket.totalOdds,
        choiceText: ticket.choiceText.slice(0, 200),
        resultText,
        won: betWon,
        payout: finalPayout,
        createdAt: serverTimestamp(),
      });

      if (betWon) {
        const playerMask = maskPlayerDisplay(currentWallet.displayName);
        if (finalPayout > ticket.betAmount) {
          tx.set(winnerRef, {
            id: ticket.id,
            uid,
            playerMask,
            gameType: 'football',
            gameName: safeGameName,
            multiplier: ticket.totalOdds,
            payout: finalPayout,
            createdAt: serverTimestamp(),
          });
        }

        if (countsTowardLeaderboard) {
          if (lbSnap && lbSnap.exists()) {
            const existingLb = lbSnap.data() as WeeklyLeaderboardEntry;
            tx.update(lbRef, {
              playerMask,
              totalWinnings: Number((existingLb.totalWinnings + finalPayout).toFixed(2)),
              winsCount: existingLb.winsCount + 1,
              biggestWin: Number(Math.max(existingLb.biggestWin, finalPayout).toFixed(2)),
              lastGameName: safeGameName,
              updatedAt: serverTimestamp(),
            });
          } else {
            tx.set(lbRef, {
              id: lbId,
              uid,
              weekKey,
              playerMask,
              totalWinnings: Number(finalPayout.toFixed(2)),
              winsCount: 1,
              biggestWin: Number(finalPayout.toFixed(2)),
              lastGameName: safeGameName,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('ቀድሞ ተዘግቷል') || error.message.includes('ካሽአውት'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `footballTickets/${ticket.id}`);
  }

  return { status: finalStatus, payout: finalPayout, resultText };
}

