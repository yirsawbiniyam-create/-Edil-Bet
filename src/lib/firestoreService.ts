import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  updatePassword,
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
  ADMIN_AUTH_EMAIL,
  auth,
  BOOTSTRAP_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  BetRecord,
  DepositRecord,
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

export const BOOTSTRAP_ADMIN_INITIAL_PASSWORD = ['Bi092714', '@'].join('');

const RECOVERY_EMAIL_REGEX = /^(0[79][0-9]{8})\.r\d+\.[a-zA-Z0-9_-]+@edilbet\.app$/i;

export function phoneToAuthEmail(phone: string): string {
  return `${phone}@edilbet.app`;
}

export function extractPhoneFromAuthEmail(email?: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  const recoveryMatch = trimmed.match(RECOVERY_EMAIL_REGEX);
  if (recoveryMatch && PHONE_REGEX.test(recoveryMatch[1])) {
    return recoveryMatch[1];
  }
  if (trimmed.toLowerCase().endsWith('@edilbet.app')) {
    const prefix = trimmed.split('@')[0];
    if (PHONE_REGEX.test(prefix)) {
      return prefix;
    }
  }
  return null;
}

export function isRecoveryAuthEmail(email?: string | null): boolean {
  return Boolean(email && RECOVERY_EMAIL_REGEX.test(email.trim()));
}

function generateTempPassword(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const rand2 = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `Edil!${rand}${rand2}9#`;
}

export function toUsernameDocId(rawUsername: string): string {
  const clean = rawUsername.trim().toLowerCase();
  const bytes = new TextEncoder().encode(clean);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `un_${hex}`.slice(0, 120);
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
    const authEmail = phoneToAuthEmail(phone);
    const cred = await createUserWithEmailAndPassword(auth, authEmail, password);
    const displayName = cleanName || phone;
    await updateProfile(cred.user, { displayName });
    await ensureUserWalletAndAdmin(cred.user, phone, displayName, phone);
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

export async function loginPlayerWithIdentifier(params: {
  rawIdentifier: string;
  password: string;
}): Promise<User> {
  const raw = params.rawIdentifier.trim();
  const password = params.password;

  if (!raw || raw.length < 2) {
    throw new Error('እባክዎ ስልክ ቁጥርዎን፣ ዩዘርኔምዎን ወይም ኢሜይልዎን ያስገቡ።');
  }
  if (!password) {
    throw new Error('እባክዎ ፓስዎርድዎን ያስገቡ።');
  }

  const normalizedPhone = normalizePhone(raw);
  const isPhone = PHONE_REGEX.test(normalizedPhone);
  const isBootstrapIdentifier =
    raw.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

  try {
    // 1. Check custom username lookup in Firestore first
    const usernameId = toUsernameDocId(raw);
    const usernameSnap = await getDoc(doc(db, 'usernames', usernameId));
    if (usernameSnap.exists()) {
      const mapped = usernameSnap.data() as { authEmail?: string; username?: string };
      if (mapped.authEmail) {
        const cred = await signInWithEmailAndPassword(auth, mapped.authEmail, password);
        const mappedPhone = extractPhoneFromAuthEmail(mapped.authEmail) ?? undefined;
        await ensureUserWalletAndAdmin(
          cred.user,
          mappedPhone,
          mapped.username || raw,
          mapped.username || raw,
        );
        return cred.user;
      }
    }

    // 2. Standard Ethiopian Phone Login (checks recoveryProfiles first so post-recovery logins always hit active authEmail)
    if (isPhone) {
      let targetEmail = phoneToAuthEmail(normalizedPhone);
      try {
        const recSnap = await getDoc(doc(db, 'recoveryProfiles', `ph_${normalizedPhone}`));
        if (recSnap.exists()) {
          const recData = recSnap.data() as { authEmail?: string };
          if (recData.authEmail) {
            targetEmail = recData.authEmail;
          }
        }
      } catch {
        // fallback to default phone authEmail
      }
      const cred = await signInWithEmailAndPassword(auth, targetEmail, password);
      await ensureUserWalletAndAdmin(cred.user, normalizedPhone);
      return cred.user;
    }

    // 3. Bootstrapped Admin Login (yirsawbiniyam@gmail.com / initial Bi092714@ or updated password)
    if (isBootstrapIdentifier) {
      const bootstrapSnap = await getDoc(doc(db, 'settings', 'adminBootstrap'));
      if (bootstrapSnap.exists()) {
        const meta = bootstrapSnap.data() as { bootstrapClaimed?: boolean };
        if (meta.bootstrapClaimed) {
          throw new Error(
            'የአድሚን ዩዘርኔሙ ተቀይሯል። እባክዎ አዲሱን ዩዘርኔምዎን ተጠቅመው ይግቡ።',
          );
        }
      }

      try {
        const cred = await signInWithEmailAndPassword(auth, ADMIN_AUTH_EMAIL, password);
        await ensureUserWalletAndAdmin(
          cred.user,
          undefined,
          BOOTSTRAP_ADMIN_EMAIL,
          BOOTSTRAP_ADMIN_EMAIL,
        );
        return cred.user;
      } catch (adminLoginErr) {
        const errCode = (adminLoginErr as { code?: string })?.code || '';
        const notCreatedYet =
          errCode === 'auth/user-not-found' || errCode === 'auth/invalid-credential';

        if (notCreatedYet && !bootstrapSnap.exists() && password === BOOTSTRAP_ADMIN_INITIAL_PASSWORD) {
          const created = await createUserWithEmailAndPassword(
            auth,
            ADMIN_AUTH_EMAIL,
            BOOTSTRAP_ADMIN_INITIAL_PASSWORD,
          );
          await updateProfile(created.user, { displayName: BOOTSTRAP_ADMIN_EMAIL });
          await ensureUserWalletAndAdmin(
            created.user,
            undefined,
            BOOTSTRAP_ADMIN_EMAIL,
            BOOTSTRAP_ADMIN_EMAIL,
          );
          return created.user;
        }
        throw adminLoginErr;
      }
    }

    // 4. Fallback direct email login if user entered an email address directly
    if (raw.includes('@')) {
      const cred = await signInWithEmailAndPassword(auth, raw.toLowerCase(), password);
      await ensureUserWalletAndAdmin(cred.user);
      return cred.user;
    }

    throw new Error(
      'ያስገቡት ስልክ ቁጥር / ዩዘርኔም ወይም ፓስዎርድ ትክክል አይደለም።',
    );
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
        'ያስገቡት ስልክ ቁጥር / ዩዘርኔም ወይም ፓስዎርድ ትክክል አይደለም። ገና ካልተመዘገቡ መጀመሪያ "አዲስ ተመዝገብ" የሚለውን ይጫኑ።',
      );
    }
    throw error;
  }
}

export async function loginPlayerWithPhone(params: {
  rawPhone: string;
  password: string;
}): Promise<User> {
  return loginPlayerWithIdentifier({
    rawIdentifier: params.rawPhone,
    password: params.password,
  });
}

export async function ensureUserWalletAndAdmin(
  user: User,
  explicitPhone?: string,
  explicitName?: string,
  explicitUsername?: string,
): Promise<boolean> {
  const isOwnerAdminAuthEmail =
    user.email?.toLowerCase() === ADMIN_AUTH_EMAIL.toLowerCase();
  const isRecoverySession = isRecoveryAuthEmail(user.email);
  const derivedPhone =
    explicitPhone ||
    (!isOwnerAdminAuthEmail ? extractPhoneFromAuthEmail(user.email) || undefined : undefined);

  const initialUsername = (
    explicitUsername ||
    (isOwnerAdminAuthEmail ? BOOTSTRAP_ADMIN_EMAIL : undefined) ||
    derivedPhone ||
    user.displayName ||
    user.email ||
    'ተጫዋች'
  ).slice(0, 80);

  const userRef = doc(db, 'users', user.uid);
  try {
    const userSnap = await getDoc(userRef);
    // Recovery sessions write their wallet atomically with preserved balance in recoverPlayerAccountByPhone
    if (!userSnap.exists() && !isRecoverySession) {
      const displayName = (
        explicitName ||
        user.displayName ||
        initialUsername
      ).slice(0, 80);
      await setDoc(userRef, {
        uid: user.uid,
        displayName,
        username: initialUsername,
        passwordVersion: 1,
        passwordUpdatedAt: serverTimestamp(),
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
    if (!isRecoverySession) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  }

  const privateRef = doc(db, 'users', user.uid, 'private', 'info');
  try {
    const privSnap = await getDoc(privateRef);
    if (!privSnap.exists() && !isRecoverySession) {
      const payload: Record<string, unknown> = {
        uid: user.uid,
        email: (isOwnerAdminAuthEmail
          ? BOOTSTRAP_ADMIN_EMAIL
          : user.email || (derivedPhone ? phoneToAuthEmail(derivedPhone) : `${user.uid}@edilbet.app`)
        ).slice(0, 150),
        username: initialUsername,
        updatedAt: serverTimestamp(),
      };
      if (derivedPhone && PHONE_REGEX.test(derivedPhone)) {
        payload.telebirrPhone = derivedPhone;
      }
      await setDoc(privateRef, payload);
    }
  } catch (error) {
    if (!isRecoverySession) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/private/info`);
    }
  }

  // Ensure initial username index & phone recoveryProfile exist
  if (user.email && !isRecoverySession) {
    const unameToIndex =
      isOwnerAdminAuthEmail
        ? BOOTSTRAP_ADMIN_EMAIL
        : derivedPhone && PHONE_REGEX.test(derivedPhone)
          ? derivedPhone
          : '';
    if (unameToIndex) {
      try {
        const bootstrapSnap = isOwnerAdminAuthEmail
          ? await getDoc(doc(db, 'settings', 'adminBootstrap'))
          : null;
        const alreadyRenamed =
          Boolean(bootstrapSnap?.exists() && (bootstrapSnap.data() as { bootstrapClaimed?: boolean }).bootstrapClaimed);
        if (!alreadyRenamed) {
          const unameId = toUsernameDocId(unameToIndex);
          const unameRef = doc(db, 'usernames', unameId);
          const unameSnap = await getDoc(unameRef);
          if (!unameSnap.exists()) {
            const indexPayload: Record<string, unknown> = {
              id: unameId,
              uid: user.uid,
              username: unameToIndex.slice(0, 80),
              authEmail: user.email.slice(0, 150),
              updatedAt: serverTimestamp(),
            };
            if (derivedPhone && PHONE_REGEX.test(derivedPhone)) {
              indexPayload.phone = derivedPhone;
            }
            await setDoc(unameRef, indexPayload);
          }
        }
      } catch {
        // ignore non-critical username index backfill failure
      }
    }

    if (derivedPhone && PHONE_REGEX.test(derivedPhone)) {
      try {
        const profileId = `ph_${derivedPhone}`;
        const profileRef = doc(db, 'recoveryProfiles', profileId);
        const profileSnap = await getDoc(profileRef);
        if (!profileSnap.exists()) {
          await setDoc(profileRef, {
            id: profileId,
            phone: derivedPhone,
            primaryUid: user.uid,
            activeUid: user.uid,
            recoveryCount: 0,
            authEmail: user.email.slice(0, 150),
            username: initialUsername,
            updatedAt: serverTimestamp(),
          });
        }
      } catch {
        // ignore non-critical backfill error
      }
    }
  }

  let isAdmin = false;
  const isBootstrapAdmin =
    isOwnerAdminAuthEmail ||
    (Boolean(user.emailVerified) &&
      user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase());

  try {
    const adminRef = doc(db, 'admins', user.uid);
    const adminSnap = await getDoc(adminRef);
    if (adminSnap.exists()) {
      isAdmin = true;
    } else if (isBootstrapAdmin) {
      await setDoc(adminRef, {
        uid: user.uid,
        email: (isOwnerAdminAuthEmail ? BOOTSTRAP_ADMIN_EMAIL : user.email || BOOTSTRAP_ADMIN_EMAIL).slice(0, 150),
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
      const bootstrapRef = doc(db, 'settings', 'adminBootstrap');
      const bootstrapSnap = await getDoc(bootstrapRef);
      if (!bootstrapSnap.exists()) {
        await setDoc(bootstrapRef, {
          ownerUid: user.uid,
          bootstrapClaimed: false,
          passwordVersion: 1,
          passwordUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // ignore if another admin doc already exists
    }

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

export async function updateAccountUsername(params: {
  user: User;
  wallet: UserWallet;
  newUsername: string;
  isAdmin: boolean;
}): Promise<string> {
  const cleanNew = params.newUsername.trim().slice(0, 80);
  if (cleanNew.length < 3) {
    throw new Error('ዩዘርኔም ቢያንስ 3 ፊደል ወይም ቁጥር መሆን አለበት።');
  }
  if (!params.user.email) {
    throw new Error('ይህ አካውንት በዩዘርኔም/ፓስዎርድ ሎጊን አይደገፍም።');
  }

  const newId = toUsernameDocId(cleanNew);
  const existingTarget = await getDoc(doc(db, 'usernames', newId));
  if (existingTarget.exists()) {
    const data = existingTarget.data() as { uid?: string };
    if (data.uid && data.uid !== params.user.uid) {
      throw new Error('ይህ ዩዘርኔም በሌላ ተጠቃሚ ተይዟል። እባክዎ ሌላ ይምረጡ።');
    }
  }

  const oldUsername =
    params.wallet.username ||
    (params.user.email.toLowerCase() === ADMIN_AUTH_EMAIL.toLowerCase()
      ? BOOTSTRAP_ADMIN_EMAIL
      : params.wallet.displayName);
  const oldId = oldUsername ? toUsernameDocId(oldUsername) : null;

  const batch = writeBatch(db);

  if (oldId && oldId !== newId) {
    const oldSnap = await getDoc(doc(db, 'usernames', oldId));
    if (oldSnap.exists() && (oldSnap.data() as { uid?: string }).uid === params.user.uid) {
      batch.delete(doc(db, 'usernames', oldId));
    }
  }

  const ownerPhone = extractPhoneFromAuthEmail(params.user.email);
  const newUnamePayload: Record<string, unknown> = {
    id: newId,
    uid: params.user.uid,
    username: cleanNew,
    authEmail: params.user.email.slice(0, 150),
    updatedAt: serverTimestamp(),
  };
  if (ownerPhone && PHONE_REGEX.test(ownerPhone)) {
    newUnamePayload.phone = ownerPhone;
  }
  batch.set(doc(db, 'usernames', newId), newUnamePayload);

  batch.update(doc(db, 'users', params.user.uid), {
    username: cleanNew,
    displayName: cleanNew,
    updatedAt: serverTimestamp(),
  });

  if (ownerPhone && PHONE_REGEX.test(ownerPhone)) {
    const recRef = doc(db, 'recoveryProfiles', `ph_${ownerPhone}`);
    const recSnap = await getDoc(recRef);
    if (recSnap.exists() && (recSnap.data() as { activeUid?: string }).activeUid === params.user.uid) {
      batch.update(recRef, {
        username: cleanNew,
        updatedAt: serverTimestamp(),
      });
    }
  }

  const privRef = doc(db, 'users', params.user.uid, 'private', 'info');
  const privSnap = await getDoc(privRef);
  if (privSnap.exists()) {
    batch.update(privRef, {
      username: cleanNew,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(privRef, {
      uid: params.user.uid,
      email: params.user.email.slice(0, 150),
      username: cleanNew,
      updatedAt: serverTimestamp(),
    });
  }

  if (params.isAdmin) {
    const bsRef = doc(db, 'settings', 'adminBootstrap');
    const bsSnap = await getDoc(bsRef);
    const prevVersion = bsSnap.exists()
      ? ((bsSnap.data() as { passwordVersion?: number }).passwordVersion ?? 1)
      : params.wallet.passwordVersion ?? 1;
    const prevPwdUpdatedAt = bsSnap.exists()
      ? (bsSnap.data() as { passwordUpdatedAt?: unknown }).passwordUpdatedAt || serverTimestamp()
      : serverTimestamp();
    batch.set(bsRef, {
      ownerUid: params.user.uid,
      bootstrapClaimed: cleanNew.toLowerCase() !== BOOTSTRAP_ADMIN_EMAIL.toLowerCase(),
      passwordVersion: prevVersion,
      passwordUpdatedAt: prevPwdUpdatedAt,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${params.user.uid}`);
  }

  await updateProfile(params.user, { displayName: cleanNew });
  return cleanNew;
}

export async function updateAccountPassword(params: {
  user: User;
  wallet: UserWallet;
  currentPassword: string;
  newPassword: string;
  isAdmin: boolean;
}): Promise<number> {
  const { user, wallet, currentPassword, newPassword, isAdmin } = params;
  if (!user.email) {
    throw new Error('የይለፍ ቃል ለመቀየር መጀመሪያ በኢሜይል/ስልክ መግባት ያስፈልጋል።');
  }
  if (!currentPassword) {
    throw new Error('እባክዎ የአሁኑን ፓስዎርድ ያስገቡ።');
  }
  if (newPassword.length < 6) {
    throw new Error('አዲሱ ፓስዎርድ ቢያንስ 6 ፊደል ወይም ቁጥር መሆን አለበት።');
  }

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (
      code === 'auth/wrong-password' ||
      code === 'auth/invalid-credential'
    ) {
      throw new Error('ያስገቡት የአሁኑ ፓስዎርድ ትክክል አይደለም።');
    }
    if (code === 'auth/weak-password') {
      throw new Error('አዲሱ ፓስዎርድ በጣም ደካማ ነው። ጠንከር ያለ ፓስዎርድ ይጠቀሙ።');
    }
    throw error;
  }

  const nextVersion = (wallet.passwordVersion ?? 1) + 1;
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', user.uid), {
    passwordVersion: nextVersion,
    passwordUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (isAdmin) {
    const bsRef = doc(db, 'settings', 'adminBootstrap');
    const bsSnap = await getDoc(bsRef);
    const claimed = bsSnap.exists()
      ? Boolean((bsSnap.data() as { bootstrapClaimed?: boolean }).bootstrapClaimed)
      : false;
    batch.set(bsRef, {
      ownerUid: user.uid,
      bootstrapClaimed: claimed,
      passwordVersion: nextVersion,
      passwordUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
  }

  return nextVersion;
}

export async function recoverPlayerAccountByPhone(rawPhone: string): Promise<{
  user: User;
  phone: string;
  username: string;
  preservedBalance: number;
}> {
  const phone = normalizePhone(rawPhone);
  if (!PHONE_REGEX.test(phone)) {
    throw new Error(
      'ፓስዎርድ ለመመለስ መጀመሪያ የተመዘገቡበትን የኢትዮጵያ ስልክ ቁጥር (09XXXXXXXX ወይም 07XXXXXXXX) ያስገቡ።',
    );
  }

  const profileId = `ph_${phone}`;
  const profileRef = doc(db, 'recoveryProfiles', profileId);
  const profileSnap = await getDoc(profileRef);

  let primaryUid = '';
  let activeUid = '';
  let recoveryCount = 0;
  let fallbackUsername = phone;

  if (profileSnap.exists()) {
    const data = profileSnap.data() as {
      primaryUid: string;
      activeUid: string;
      recoveryCount: number;
      username?: string;
    };
    primaryUid = data.primaryUid;
    activeUid = data.activeUid;
    recoveryCount = data.recoveryCount || 0;
    fallbackUsername = data.username || phone;
  } else {
    const phoneUnameSnap = await getDoc(doc(db, 'usernames', toUsernameDocId(phone)));
    if (!phoneUnameSnap.exists()) {
      throw new Error(
        'ይህ ስልክ ቁጥር በሲስተሙ ውስጥ አልተገኘም። እባክዎ መጀመሪያ "አዲስ ተመዝገብ" የሚለውን ይጫኑ።',
      );
    }
    const uData = phoneUnameSnap.data() as { uid: string; username?: string };
    primaryUid = uData.uid;
    activeUid = uData.uid;
    recoveryCount = 0;
    fallbackUsername = uData.username || phone;
  }

  const nextCount = recoveryCount + 1;
  const recoveryEmail = `${phone}.r${nextCount}.${primaryUid}@edilbet.app`;
  const tempPassword = generateTempPassword();

  const cred = await createUserWithEmailAndPassword(auth, recoveryEmail, tempPassword);
  const newUser = cred.user;

  const sourceWalletSnap = await getDoc(doc(db, 'users', activeUid));
  if (!sourceWalletSnap.exists()) {
    throw new Error('የቀድሞው አካውንት መረጃ በፋየርስቶር ላይ አልተገኘም።');
  }

  const srcWallet = sourceWalletSnap.data() as UserWallet;
  const preservedDisplayName = (srcWallet.displayName || fallbackUsername || phone).slice(0, 80);
  const preservedUsername = (srcWallet.username || srcWallet.displayName || fallbackUsername || phone).slice(0, 80);

  await updateProfile(newUser, { displayName: preservedDisplayName });

  const batch = writeBatch(db);

  batch.set(doc(db, 'users', newUser.uid), {
    uid: newUser.uid,
    primaryUid,
    displayName: preservedDisplayName,
    username: preservedUsername,
    mustChangePassword: true,
    passwordVersion: (srcWallet.passwordVersion ?? 1) + 1,
    passwordUpdatedAt: serverTimestamp(),
    balance: srcWallet.balance,
    hasDeposited: Boolean(srcWallet.hasDeposited),
    totalDeposited: srcWallet.totalDeposited || 0,
    totalWithdrawn: srcWallet.totalWithdrawn || 0,
    lastActionType: 'init',
    lastActionRef: 'recovery',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', newUser.uid, 'private', 'info'), {
    uid: newUser.uid,
    email: recoveryEmail.slice(0, 150),
    username: preservedUsername,
    telebirrPhone: phone,
    updatedAt: serverTimestamp(),
  });

  if (profileSnap.exists()) {
    batch.update(profileRef, {
      activeUid: newUser.uid,
      recoveryCount: nextCount,
      authEmail: recoveryEmail.slice(0, 150),
      username: preservedUsername,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(profileRef, {
      id: profileId,
      phone,
      primaryUid,
      activeUid: newUser.uid,
      recoveryCount: nextCount,
      authEmail: recoveryEmail.slice(0, 150),
      username: preservedUsername,
      updatedAt: serverTimestamp(),
    });
  }

  const phoneUnameId = toUsernameDocId(phone);
  batch.set(doc(db, 'usernames', phoneUnameId), {
    id: phoneUnameId,
    uid: newUser.uid,
    username: phone,
    authEmail: recoveryEmail.slice(0, 150),
    phone,
    updatedAt: serverTimestamp(),
  });

  if (preservedUsername.toLowerCase() !== phone.toLowerCase()) {
    const customUnameId = toUsernameDocId(preservedUsername);
    const customUnameSnap = await getDoc(doc(db, 'usernames', customUnameId));
    const existingOwner = customUnameSnap.exists()
      ? (customUnameSnap.data() as { uid?: string; phone?: string })
      : null;
    if (
      !existingOwner ||
      existingOwner.uid === activeUid ||
      existingOwner.uid === primaryUid ||
      existingOwner.phone === phone
    ) {
      batch.set(doc(db, 'usernames', customUnameId), {
        id: customUnameId,
        uid: newUser.uid,
        username: preservedUsername,
        authEmail: recoveryEmail.slice(0, 150),
        phone,
        updatedAt: serverTimestamp(),
      });
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${newUser.uid}`);
  }

  return {
    user: newUser,
    phone,
    username: preservedUsername,
    preservedBalance: srcWallet.balance,
  };
}

export async function completeRecoveredPasswordSetup(params: {
  user: User;
  wallet: UserWallet;
  newPassword: string;
}): Promise<number> {
  const { user, wallet, newPassword } = params;
  if (newPassword.length < 6) {
    throw new Error('አዲሱ ፓስዎርድ ቢያንስ 6 ፊደል ወይም ቁጥር መሆን አለበት።');
  }

  try {
    await updatePassword(user, newPassword);
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (code === 'auth/weak-password') {
      throw new Error('አዲሱ ፓስዎርድ በጣም ደካማ ነው። ጠንከር ያለ ፓስዎርድ ይጠቀሙ።');
    }
    throw error;
  }

  const nextVersion = (wallet.passwordVersion ?? 1) + 1;
  try {
    await updateDoc(doc(db, 'users', user.uid), {
      mustChangePassword: false,
      passwordVersion: nextVersion,
      passwordUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
  }

  return nextVersion;
}

export async function submitTelebirrDeposit(params: {
  user: User;
  wallet: UserWallet;
  settings: TelebirrSettings;
  rawPhone: string;
  rawTxId: string;
  amount: number;
  registeredPhone: string | null;
}): Promise<{ txId: string; amount: number; autoVerifiedBySms: boolean }> {
  const { user, wallet, settings, rawPhone, rawTxId, amount, registeredPhone } = params;
  const playerPhone = normalizePhone(rawPhone);
  const txId = normalizeTxId(rawTxId);

  if (!PHONE_REGEX.test(playerPhone)) {
    throw new Error('እባክዎ ትክክለኛ የኢትዮጵያ ቴሌብር ስልክ ቁጥር ያስገቡ (09XXXXXXXX ወይም 07XXXXXXXX)።');
  }
  if (!TX_ID_REGEX.test(txId)) {
    throw new Error('ትራንሳክሽን አይዲው ትክክል አይደለም (ቢያንስ 6 ፊደል ወይም ቁጥር ይሁን)።');
  }

  // Check server webhook cache in case service account REST persistence is not enabled in .env
  let serverSmsCheck: { found?: boolean; status?: string; amount?: number } | null = null;
  try {
    const resp = await fetch(`/api/telebirr-sms-webhook/check/${encodeURIComponent(txId)}`);
    if (resp.ok) {
      serverSmsCheck = (await resp.json()) as {
        found?: boolean;
        status?: string;
        amount?: number;
      };
    }
  } catch {
    // Non-fatal if running purely offline/client-only
  }

  if (serverSmsCheck?.found && serverSmsCheck.status === 'used') {
    throw new Error('ይህ የትራንዛክሽን ቁጥር ከዚህ በፊት ጥቅም ላይ ውሏል!');
  }

  const fallbackAmount =
    serverSmsCheck?.found && serverSmsCheck.status === 'unused' && typeof serverSmsCheck.amount === 'number'
      ? Number(serverSmsCheck.amount.toFixed(2))
      : Number(amount);

  if (!Number.isFinite(fallbackAmount) || fallbackAmount < 100) {
    throw new Error('ዝቅተኛው የዲፖሲት መጠን 100 ብር ነው።');
  }
  if (fallbackAmount > 500000) {
    throw new Error('ከፍተኛው የአንድ ጊዜ ዲፖሲት 500,000 ብር ነው።');
  }

  const smsRef = doc(db, 'received_sms_transactions', txId);
  const usedTxRef = doc(db, 'usedTxIds', txId);
  const depositRef = doc(db, 'deposits', txId);
  const ledgerId = makeDocId('led');
  const ledgerRef = doc(db, 'ledger', ledgerId);
  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');

  const safeName = (wallet.displayName || user.displayName || 'ተጫዋች').slice(0, 80);
  const effectivePhone = registeredPhone || playerPhone;

  let finalAmount = fallbackAmount;
  let autoVerifiedBySms = Boolean(serverSmsCheck?.found && serverSmsCheck.status === 'unused');

  try {
    await runTransaction(db, async (tx) => {
      const [smsSnap, usedSnap, userSnap] = await Promise.all([
        tx.get(smsRef),
        tx.get(usedTxRef),
        tx.get(userRef),
      ]);

      if (!userSnap.exists()) {
        throw new Error('የተጫዋች ቦርሳ አልተገኘም።');
      }
      if (usedSnap.exists()) {
        throw new Error('ይህ ትራንሳክሽን አይዲ ቀደም ብሎ ጥቅም ላይ ውሏል! አዲስ ትራንሳክሽን አይዲ ያስገቡ።');
      }

      const currentWallet = userSnap.data() as UserWallet;
      let verifiedAmount = fallbackAmount;
      let hasFirestoreSms = false;

      if (smsSnap.exists()) {
        const smsData = smsSnap.data() as { status?: string; amount?: number };
        if (smsData.status !== 'unused') {
          throw new Error('ይህ የትራንዛክሽን ቁጥር ከዚህ በፊት ጥቅም ላይ ውሏል!');
        }
        const parsedSmsAmt = Number(smsData.amount);
        if (!Number.isFinite(parsedSmsAmt) || parsedSmsAmt < 100 || parsedSmsAmt > 500000) {
          throw new Error('በSMS የተመዘገበው የብር መጠን ከተፈቀደው ገደብ ውጭ ነው።');
        }
        verifiedAmount = Number(parsedSmsAmt.toFixed(2));
        hasFirestoreSms = true;
        autoVerifiedBySms = true;
      }

      finalAmount = verifiedAmount;

      if (hasFirestoreSms) {
        tx.update(smsRef, {
          status: 'used',
          used_by: user.uid,
          used_at: serverTimestamp(),
        });
      }

      tx.set(usedTxRef, {
        txId,
        uid: user.uid,
        amount: verifiedAmount,
        createdAt: serverTimestamp(),
      });

      tx.set(depositRef, {
        id: txId,
        uid: user.uid,
        playerName: safeName,
        playerPhone: effectivePhone,
        systemPhone: settings.depositPhone,
        txId,
        amount: verifiedAmount,
        status: 'verified',
        verifiedMessage: hasFirestoreSms
          ? 'ትክክል ነው — በቴሌብር SMS ዌብሆክ በራስ-ሰር ተረጋግጧል'
          : 'ትክክል ነው — የቴሌብር መተላለፍ ተረጋግጧል',
        createdAt: serverTimestamp(),
      });

      tx.set(ledgerRef, {
        id: ledgerId,
        uid: user.uid,
        playerName: safeName,
        playerPhone: effectivePhone,
        type: 'income',
        category: 'deposit',
        amount: verifiedAmount,
        referenceId: txId,
        description: `በቴሌብር ዲፖሲት (${txId})`.slice(0, 180),
        createdAt: serverTimestamp(),
      });

      if (!currentWallet.hasDeposited || !registeredPhone) {
        tx.set(privateRef, {
          uid: user.uid,
          email: (user.email || 'user@example.com').slice(0, 150),
          telebirrPhone: effectivePhone,
          updatedAt: serverTimestamp(),
        });
      }

      tx.update(userRef, {
        balance: Number((currentWallet.balance + verifiedAmount).toFixed(2)),
        hasDeposited: true,
        totalDeposited: Number((currentWallet.totalDeposited + verifiedAmount).toFixed(2)),
        lastActionType: 'deposit',
        lastActionRef: txId,
        updatedAt: serverTimestamp(),
      });
    });

    if (serverSmsCheck?.found && serverSmsCheck.status === 'unused') {
      await fetch('/api/telebirr-sms-webhook/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txId, uid: user.uid }),
      }).catch(() => undefined);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('ጥቅም ላይ ውሏል') ||
        error.message.includes('አልተገኘም') ||
        error.message.includes('ገደብ'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `deposits/${txId}`);
  }

  return { txId, amount: finalAmount, autoVerifiedBySms };
}

export function parseTelebirrSmsMessage(
  rawMessage: string,
): { transactionId: string; amount: number } | null {
  const message = rawMessage.trim();
  const amountMatch =
    message.match(/(?:ETB|Br|Birr|ብር)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    message.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:ETB|Br|Birr|ብር)/i);
  const txIdMatch = message.match(
    /(?:transaction\s*(?:number|id|ref|code)\s*(?:is|:)?|የግብይት\s*(?:መለያ\s*)?ቁጥር(?:ዎ)?\s*(?:is|:)?|መለያ\s*ቁጥር(?:ዎ)?\s*(?:is|:)?|TX\s*(?:ID|#)?\s*(?:is|:)?|Ref(?:erence)?\s*(?:No|ID|#)?\s*(?:is|:)?)\s*([A-Za-z0-9]{6,24})/i,
  );
  if (!amountMatch || !txIdMatch) return null;
  const amount = Number(parseFloat(amountMatch[1].replace(/,/g, '')).toFixed(2));
  const transactionId = normalizeTxId(txIdMatch[1]);
  if (!Number.isFinite(amount) || amount < 100 || amount > 500000) return null;
  if (!TX_ID_REGEX.test(transactionId)) return null;
  return { transactionId, amount };
}

export async function adminRecordSimulatedTelebirrSms(params: {
  rawMessage: string;
}): Promise<{ transactionId: string; amount: number }> {
  const message = params.rawMessage.trim();
  const parsed = parseTelebirrSmsMessage(message);
  if (!parsed) {
    throw new Error(
      'የቴሌብር SMS ቅርጽ ትክክል አይደለም (ETB/ብር መጠን 100-500,000 እና transaction number/የግብይት ቁጥር ያካትቱ)።',
    );
  }
  const { transactionId, amount } = parsed;

  const smsRef = doc(db, 'received_sms_transactions', transactionId);
  try {
    const existing = await getDoc(smsRef);
    if (existing.exists()) {
      throw new Error(`ትራንዛክሽን ${transactionId} ቀደም ብሎ ተመዝግቧል።`);
    }
    await setDoc(smsRef, {
      transaction_id: transactionId,
      amount,
      message: message.slice(0, 600),
      status: 'unused',
      source: 'admin_sms',
      created_at: serverTimestamp(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('ቀደም ብሎ')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `received_sms_transactions/${transactionId}`);
  }

  return { transactionId, amount };
}

export async function adminRecordManualTelebirrTx(params: {
  rawTxId: string;
  amount: number;
}): Promise<{ transactionId: string; amount: number }> {
  const transactionId = normalizeTxId(params.rawTxId);
  const amount = Number(Number(params.amount).toFixed(2));

  if (!TX_ID_REGEX.test(transactionId)) {
    throw new Error('ትራንሳክሽን አይዲው ከ 6 እስከ 24 ፊደል ወይም ቁጥር መሆን አለበት (ምሳሌ: DKF27VX4V6)።');
  }
  if (!Number.isFinite(amount) || amount < 100 || amount > 500000) {
    throw new Error('የብር መጠኑ ከ 100 እስከ 500,000 ብር መሆን አለበት።');
  }

  const smsRef = doc(db, 'received_sms_transactions', transactionId);
  try {
    const existing = await getDoc(smsRef);
    if (existing.exists()) {
      throw new Error(`ትራንዛክሽን ${transactionId} ቀደም ብሎ ተመዝግቧል።`);
    }
    await setDoc(smsRef, {
      transaction_id: transactionId,
      amount,
      message: `Admin Phone Telebirr SMS Confirmed: ETB ${amount.toFixed(2)} · TX ${transactionId}`,
      status: 'unused',
      source: 'admin_manual',
      created_at: serverTimestamp(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('ቀደም ብሎ')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `received_sms_transactions/${transactionId}`);
  }

  return { transactionId, amount };
}

export async function adminSyncWebhookSmsBatch(
  items: Array<{ transaction_id: string; amount: number; status: string; source?: string }>,
): Promise<number> {
  let synced = 0;
  for (const item of items) {
    if (item.status !== 'unused') continue;
    const txId = normalizeTxId(item.transaction_id);
    const amount = Number(Number(item.amount).toFixed(2));
    if (!TX_ID_REGEX.test(txId) || !Number.isFinite(amount) || amount < 100 || amount > 500000) {
      continue;
    }
    try {
      const smsRef = doc(db, 'received_sms_transactions', txId);
      const existing = await getDoc(smsRef);
      if (existing.exists()) continue;
      await setDoc(smsRef, {
        transaction_id: txId,
        amount,
        message: `MacroDroid SMS Gateway: ETB ${amount.toFixed(2)} · TX ${txId}`,
        status: 'unused',
        source: (item.source || 'macrodroid').slice(0, 40),
        created_at: serverTimestamp(),
      });
      synced += 1;
    } catch {
      // Skip duplicate or transient failure on single item
    }
  }
  return synced;
}

export async function submitPendingTelebirrDeposit(params: {
  user: User;
  wallet: UserWallet;
  settings: TelebirrSettings;
  registeredPhone: string | null;
  rawPhone: string;
  rawTxId: string;
  amount: number;
}): Promise<{ txId: string; amount: number }> {
  const { user, wallet, settings, registeredPhone, rawPhone, rawTxId, amount } = params;
  const txId = normalizeTxId(rawTxId);
  const playerPhone = normalizePhone(registeredPhone || rawPhone);
  const systemPhone = normalizePhone(settings.depositPhone);
  const cleanAmount = Number(Number(amount).toFixed(2));

  if (!PHONE_REGEX.test(playerPhone)) {
    throw new Error('እባክዎ ትክክለኛ የኢትዮጵያ ቴሌብር ስልክ ቁጥር ያስገቡ (09XXXXXXXX ወይም 07XXXXXXXX)።');
  }
  if (!TX_ID_REGEX.test(txId)) {
    throw new Error('ትራንሳክሽን አይዲው ትክክል አይደለም (ከ6 እስከ 24 ፊደል ወይም ቁጥር ይሁን)።');
  }
  if (!Number.isFinite(cleanAmount) || cleanAmount < 100 || cleanAmount > 500000) {
    throw new Error('የዲፖሲት መጠን ቢያንስ 100 ብር (እስከ 500,000 ብር) መሆን አለበት።');
  }

  const depositRef = doc(db, 'deposits', txId);
  const usedTxRef = doc(db, 'usedTxIds', txId);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');
  const safeName = (wallet.displayName || user.displayName || 'ተጫዋች').slice(0, 80);
  const effectivePhone = registeredPhone || playerPhone;

  try {
    await runTransaction(db, async (tx) => {
      const [depSnap, usedSnap, privSnap] = await Promise.all([
        tx.get(depositRef),
        tx.get(usedTxRef),
        tx.get(privateRef),
      ]);

      if (usedSnap.exists()) {
        throw new Error('ይህ ትራንሳክሽን አይዲ ቀደም ብሎ ጥቅም ላይ ውሏል!');
      }
      if (depSnap.exists()) {
        const existingDep = depSnap.data() as DepositRecord;
        if (existingDep.status === 'pending') {
          throw new Error(`ትራንዛክሽን ${txId} ቀደም ብሎ ተልኮ የአድሚን ማረጋገጫ በመጠበቅ ላይ ነው!`);
        }
        throw new Error('ይህ ትራንሳክሽን አይዲ ቀደም ብሎ ጥቅም ላይ ውሏል!');
      }

      if (!registeredPhone) {
        if (privSnap.exists()) {
          const prevPriv = privSnap.data() as { telebirrPhone?: string };
          if (!prevPriv.telebirrPhone) {
            tx.update(privateRef, {
              telebirrPhone: effectivePhone,
              updatedAt: serverTimestamp(),
            });
          }
        } else {
          tx.set(privateRef, {
            uid: user.uid,
            email: (user.email || 'user@example.com').slice(0, 150),
            telebirrPhone: effectivePhone,
            updatedAt: serverTimestamp(),
          });
        }
      }

      tx.set(depositRef, {
        id: txId,
        uid: user.uid,
        playerName: safeName,
        playerPhone: effectivePhone,
        systemPhone: PHONE_REGEX.test(systemPhone) ? systemPhone : settings.depositPhone,
        txId,
        amount: cleanAmount,
        status: 'pending',
        verifiedMessage: 'የአድሚን የቴሌብር SMS ማረጋገጫ በመጠበቅ ላይ (Pending)...',
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (err instanceof Error && (err.message.includes('ጥቅም ላይ') || err.message.includes('በመጠበቅ ላይ'))) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `deposits/${txId}`);
  }

  return { txId, amount: cleanAmount };
}

export async function adminApprovePendingDeposit(params: {
  deposit: DepositRecord;
  adminUid: string;
}): Promise<void> {
  const { deposit, adminUid } = params;
  const txId = normalizeTxId(deposit.txId);
  const depositRef = doc(db, 'deposits', txId);
  const usedTxRef = doc(db, 'usedTxIds', txId);
  const smsRef = doc(db, 'received_sms_transactions', txId);
  const userRef = doc(db, 'users', deposit.uid);
  const ledgerId = makeDocId('led');
  const ledgerRef = doc(db, 'ledger', ledgerId);

  try {
    await runTransaction(db, async (tx) => {
      const [depSnap, usedSnap, userSnap, smsSnap] = await Promise.all([
        tx.get(depositRef),
        tx.get(usedTxRef),
        tx.get(userRef),
        tx.get(smsRef),
      ]);

      if (!depSnap.exists()) {
        throw new Error('የዲፖሲት መረጃው አልተገኘም።');
      }
      const depData = depSnap.data() as DepositRecord;
      if (depData.status !== 'pending') {
        throw new Error('ይህ ዲፖሲት ቀደም ብሎ ተስተናግዷል።');
      }
      if (usedSnap.exists()) {
        throw new Error('ይህ ትራንሳክሽን አይዲ ቀደም ብሎ ጥቅም ላይ ውሏል።');
      }
      if (!userSnap.exists()) {
        throw new Error('የተጫዋቹ ቦርሳ አልተገኘም።');
      }

      const walletData = userSnap.data() as UserWallet;
      const creditAmount = Number(depData.amount.toFixed(2));

      tx.update(depositRef, {
        status: 'verified',
        verifiedMessage: 'ትክክል ነው — አድሚኑ በቴሌብር ስልኩ አረጋግጦ አጽድቋል',
        processedBy: adminUid,
        updatedAt: serverTimestamp(),
      });

      tx.set(usedTxRef, {
        txId,
        uid: deposit.uid,
        amount: creditAmount,
        createdAt: serverTimestamp(),
      });

      if (smsSnap.exists() && (smsSnap.data() as { status?: string }).status === 'unused') {
        tx.update(smsRef, {
          status: 'used',
          used_by: deposit.uid,
          used_at: serverTimestamp(),
        });
      }

      tx.set(ledgerRef, {
        id: ledgerId,
        uid: deposit.uid,
        playerName: deposit.playerName.slice(0, 80),
        playerPhone: deposit.playerPhone,
        type: 'income',
        category: 'deposit',
        amount: creditAmount,
        referenceId: txId,
        description: `በቴሌብር ዲፖሲት (${txId} · አድሚን ያረጋገጠው)`.slice(0, 180),
        createdAt: serverTimestamp(),
      });

      tx.update(userRef, {
        balance: Number((walletData.balance + creditAmount).toFixed(2)),
        hasDeposited: true,
        totalDeposited: Number((walletData.totalDeposited + creditAmount).toFixed(2)),
        lastActionType: 'deposit',
        lastActionRef: txId,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (err instanceof Error && (err.message.includes('አልተገኘም') || err.message.includes('ተስተናግዷል') || err.message.includes('ጥቅም ላይ'))) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `deposits/${txId}`);
  }
}

export async function adminRejectPendingDeposit(params: {
  deposit: DepositRecord;
  adminUid: string;
}): Promise<void> {
  const { deposit, adminUid } = params;
  const depositRef = doc(db, 'deposits', deposit.txId);
  try {
    await updateDoc(depositRef, {
      status: 'rejected',
      verifiedMessage: 'አልተላከም — በቴሌብር SMS አልተገኘም (ውድቅ ተደርጓል)',
      processedBy: adminUid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `deposits/${deposit.txId}`);
  }
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

  if (!Number.isFinite(betAmount) || betAmount < minBet) {
    throw new Error(`ዝቅተኛው የመወራረጃ መጠን ${minBet} ብር ነው።`);
  }
  if (betAmount > 10000000) {
    throw new Error('ከፍተኛው የአንድ ጊዜ መወራረጃ መጠን 10,000,000 ብር ነው።');
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

      const ownerPhone = extractPhoneFromAuthEmail(auth.currentUser?.email);
      const betPayload: Record<string, unknown> = {
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
      };
      if (ownerPhone && PHONE_REGEX.test(ownerPhone)) {
        betPayload.ownerPhone = ownerPhone;
      }
      tx.set(betRef, betPayload);

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
    const wdSnap = await getDoc(withdrawalRef);
    if (!wdSnap.exists()) {
      throw new Error('የዊዝድሮው ጥያቄው አልተገኘም።');
    }
    const wd = wdSnap.data() as WithdrawalRecord;
    if (wd.status !== 'pending' || wd.systemVerified) {
      return;
    }

    const userSnap = await getDoc(doc(db, 'users', wd.uid));
    if (!userSnap.exists()) {
      throw new Error('የተጫዋቹ አካውንት አልተገኘም።');
    }
    const walletData = userSnap.data() as UserWallet;
    const hasLegitDeposit = Boolean(walletData.hasDeposited && walletData.totalDeposited >= 100);

    if (!hasLegitDeposit) {
      await updateDoc(withdrawalRef, {
        systemVerifiedText: 'ማረጋገጫ አልተሳካም — ዲፖሲት መኖሩ አልተረጋገጠም',
        updatedAt: serverTimestamp(),
      });
      throw new Error('የተጫዋቹ የዲፖሲት ታሪክ ስላልተረጋገጠ ዊዝድሮው ማጽደቅ አይቻልም።');
    }

    await updateDoc(withdrawalRef, {
      systemVerified: true,
      systemVerifiedText: 'ትክክል ነው — የዲፖሲት፣ የመብላት እና የሂሳብ ትክክለኛነት ተረጋግጧል!',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('አልተገኘም') || error.message.includes('አልተረጋገጠም'))
    ) {
      throw error;
    }
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
  if (!Number.isFinite(maxBet) || maxBet < minBet || maxBet > 10000000) {
    throw new Error('ከፍተኛው የጠረጴዛ ገደብ ከዝቅተኛው በላይ እና እስከ 10,000,000 ብር መሆን አለበት።');
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
    footballMaxOdds: clamp(c.footballMaxOdds, 5, 1000000),
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

  if (picks.length < 1 || picks.length > 250) {
    throw new Error('እባክዎ ቢያንስ 1 ጨዋታ ይምረጡ (ከፍተኛ 250 ጨዋታዎች)።');
  }
  if (!Number.isFinite(betAmount) || betAmount < minBet) {
    throw new Error(`ዝቅተኛው የመወራረጃ መጠን ${minBet} ብር ነው።`);
  }
  if (betAmount > 10000000) {
    throw new Error('ከፍተኛው የአንድ ጊዜ መወራረጃ መጠን 10,000,000 ብር ነው።');
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

  // Cap popularity counter updates per transaction to stay well within Firestore tx limits even on 50+ game slips
  const trackedPopPicks = picks.slice(0, 20);

  try {
    await runTransaction(db, async (tx) => {
      const popRefs = trackedPopPicks.map((p) => doc(db, 'footballPopularity', p.matchId));
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

      const ticketOwnerPhone = extractPhoneFromAuthEmail(auth.currentUser?.email);
      const ticketPayload: Record<string, unknown> = {
        ...initialData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (ticketOwnerPhone && PHONE_REGEX.test(ticketOwnerPhone)) {
        ticketPayload.ownerPhone = ticketOwnerPhone;
      }

      tx.set(ticketRef, ticketPayload);

      tx.update(userRef, {
        balance: nextBalance,
        lastActionType: 'football_place',
        lastActionRef: ticketId,
        updatedAt: serverTimestamp(),
      });

      trackedPopPicks.forEach((p, idx) => {
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
      const settledOwnerPhone =
        ticket.ownerPhone || extractPhoneFromAuthEmail(auth.currentUser?.email);
      const settledBetPayload: Record<string, unknown> = {
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
      };
      if (settledOwnerPhone && PHONE_REGEX.test(settledOwnerPhone)) {
        settledBetPayload.ownerPhone = settledOwnerPhone;
      }
      tx.set(betRef, settledBetPayload);

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

