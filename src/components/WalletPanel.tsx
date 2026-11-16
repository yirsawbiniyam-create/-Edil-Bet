import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Lock,
  MessageSquareText,
  Phone,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { formatETB } from '../lib/gameEngine';
import {
  normalizePhone,
  normalizeTxId,
  PHONE_REGEX,
  runSystemWithdrawalVerification,
  submitTelebirrWithdrawal,
  TX_ID_REGEX,
} from '../lib/firestoreService';
import {
  DepositRecord,
  ReceivedSmsTransaction,
  TelebirrSettings,
  UserWallet,
  WithdrawalRecord,
} from '../types';

interface WalletPanelProps {
  user: User;
  wallet: UserWallet;
  settings: TelebirrSettings | null;
  registeredPhone: string | null;
  deposits: DepositRecord[];
  withdrawals: WithdrawalRecord[];
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const WalletPanel: React.FC<WalletPanelProps> = ({
  user,
  wallet,
  settings,
  registeredPhone,
  deposits,
  withdrawals,
  onNotify,
}) => {
  const [subTab, setSubTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [copied, setCopied] = useState(false);

  // Deposit Form
  const [depositPhone, setDepositPhone] = useState(registeredPhone || '');
  const [txIdInput, setTxIdInput] = useState('');
  const [isVerifyingDeposit, setIsVerifyingDeposit] = useState(false);
  const [depositSuccessMsg, setDepositSuccessMsg] = useState<string | null>(null);

  // Real-time `received_sms_transactions` lookup state
  const normalizedTx = useMemo(() => normalizeTxId(txIdInput), [txIdInput]);
  const [smsLookupState, setSmsLookupState] = useState<{
    state: 'idle' | 'checking' | 'unused' | 'used' | 'not_found';
    amount?: number;
    sourceLabel?: string;
  }>({ state: 'idle' });

  // Withdraw Form
  const [withdrawPhone, setWithdrawPhone] = useState(registeredPhone || '');
  const [withdrawAmount, setWithdrawAmount] = useState('500');
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);

  useEffect(() => {
    if (registeredPhone) {
      setDepositPhone((prev) => prev || registeredPhone);
      setWithdrawPhone(registeredPhone);
    }
  }, [registeredPhone]);

  // Real-time Firestore + Webhook lookup whenever user enters >= 6 TX ID chars
  useEffect(() => {
    if (!TX_ID_REGEX.test(normalizedTx)) {
      setSmsLookupState({ state: 'idle' });
      return;
    }

    let cancelled = false;
    setSmsLookupState({ state: 'checking' });

    const smsDocRef = doc(db, 'received_sms_transactions', normalizedTx);
    const unsub = onSnapshot(
      smsDocRef,
      async (snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as ReceivedSmsTransaction;
          if (data.status === 'unused') {
            setSmsLookupState({
              state: 'unused',
              amount: data.amount,
              sourceLabel: 'Firestore SMS',
            });
          } else {
            setSmsLookupState({
              state: 'used',
              amount: data.amount,
              sourceLabel: 'Firestore SMS',
            });
          }
          return;
        }

        // Check Express Webhook server cache if not synced via service-account REST yet
        try {
          const resp = await fetch(
            `/api/telebirr-sms-webhook/check/${encodeURIComponent(normalizedTx)}`,
          );
          if (!cancelled && resp.ok) {
            const srv = (await resp.json()) as {
              found?: boolean;
              status?: string;
              amount?: number;
            };
            if (srv.found && typeof srv.amount === 'number') {
              if (srv.status === 'unused') {
                setSmsLookupState({
                  state: 'unused',
                  amount: srv.amount,
                  sourceLabel: 'Telebirr Webhook',
                });
              } else {
                setSmsLookupState({
                  state: 'used',
                  amount: srv.amount,
                  sourceLabel: 'Telebirr Webhook',
                });
              }
              return;
            }
          }
        } catch {
          // Ignore webhook probe network failure
        }

        if (!cancelled) {
          setSmsLookupState({ state: 'not_found' });
        }
      },
      (error) => {
        console.error('received_sms_transactions lookup error:', error);
        if (!cancelled) {
          setSmsLookupState({ state: 'not_found' });
        }
      },
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [normalizedTx]);

  const handleCopyPhone = async () => {
    if (!settings?.depositPhone) return;
    try {
      await navigator.clipboard.writeText(settings.depositPhone);
      setCopied(true);
      onNotify(`የቴሌብር ስልክ ቁጥር (${settings.depositPhone}) ኮፒ ተደርጓል!`, 'success');
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      onNotify('ስልክ ቁጥሩን በእጅዎ ይቅዱት: ' + settings.depositPhone, 'info');
    }
  };

  /**
   * Directly runs an atomic Firestore transaction that:
   * 1. Queries `received_sms_transactions/{txId}` for the user's Transaction ID.
   * 2. Verifies the document exists and has `status === 'unused'`.
   * 3. Atomically updates `status` to `'used'` (with `used_by` + `used_at`) and credits
   *    the verified SMS amount to `users/{user.uid}` (plus `deposits`, `usedTxIds`, `ledger`).
   */
  const verifyAndCreditSmsTransaction = async (
    rawTxId: string,
  ): Promise<{ txId: string; amount: number }> => {
    if (!settings) {
      throw new Error('አድሚኑ የቴሌብር ስልክ ቁጥሩን እስኪያስገባ ይጠብቁ።');
    }

    const txId = normalizeTxId(rawTxId);
    const playerPhone = normalizePhone(registeredPhone || depositPhone);
    const systemPhone = normalizePhone(settings.depositPhone);

    if (!PHONE_REGEX.test(playerPhone)) {
      throw new Error(
        'እባክዎ ትክክለኛ የኢትዮጵያ ቴሌብር ስልክ ቁጥር ያስገቡ (09XXXXXXXX ወይም 07XXXXXXXX)።',
      );
    }
    if (!TX_ID_REGEX.test(txId)) {
      throw new Error('ትራንሳክሽን አይዲው ትክክል አይደለም (ከ6 እስከ 24 ፊደል ወይም ቁጥር ይሁን)።');
    }

    // Optional fallback probe to Express webhook memory cache when Firebase Admin REST sync is not configured
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
      // Non-fatal if offline or Firestore-only
    }

    if (serverSmsCheck?.found && serverSmsCheck.status === 'used') {
      throw new Error('ይህ የትራንዛክሽን ቁጥር ከዚህ በፊት ጥቅም ላይ ውሏል! (Status: Used)');
    }

    const smsRef = doc(db, 'received_sms_transactions', txId);
    const usedTxRef = doc(db, 'usedTxIds', txId);
    const depositRef = doc(db, 'deposits', txId);
    const ledgerId = `led_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ledgerRef = doc(db, 'ledger', ledgerId);
    const userRef = doc(db, 'users', user.uid);
    const privateRef = doc(db, 'users', user.uid, 'private', 'info');

    const safeName = (wallet.displayName || user.displayName || 'ተጫዋች').slice(0, 80);
    const effectivePhone = registeredPhone || playerPhone;

    let verifiedAmount = 0;
    let consumedFromServerWebhook = false;

    try {
      await runTransaction(db, async (transaction) => {
        const [smsSnap, usedSnap, userSnap, privateSnap] = await Promise.all([
          transaction.get(smsRef),
          transaction.get(usedTxRef),
          transaction.get(userRef),
          transaction.get(privateRef),
        ]);

        if (!userSnap.exists()) {
          throw new Error('የተጫዋች ቦርሳ አልተገኘም።');
        }
        if (usedSnap.exists()) {
          throw new Error('ይህ ትራንሳክሽን አይዲ ቀደም ብሎ ጥቅም ላይ ውሏል! አዲስ ትራንሳክሽን አይዲ ያስገቡ።');
        }

        const currentWallet = userSnap.data() as UserWallet;
        let hasFirestoreSms = false;

        if (smsSnap.exists()) {
          const smsData = smsSnap.data() as ReceivedSmsTransaction;
          if (smsData.status !== 'unused') {
            throw new Error('ይህ የትራንዛክሽን ቁጥር ከዚህ በፊት ጥቅም ላይ ውሏል! (Status: Used)');
          }
          const parsedAmt = Number(smsData.amount);
          if (!Number.isFinite(parsedAmt) || parsedAmt < 100 || parsedAmt > 500000) {
            throw new Error('በSMS የተመዘገበው የብር መጠን ከተፈቀደው ገደብ (100 - 500,000 ብር) ውጭ ነው።');
          }
          verifiedAmount = Number(parsedAmt.toFixed(2));
          hasFirestoreSms = true;
        } else if (
          serverSmsCheck?.found &&
          serverSmsCheck.status === 'unused' &&
          typeof serverSmsCheck.amount === 'number'
        ) {
          const parsedSrvAmt = Number(serverSmsCheck.amount);
          if (!Number.isFinite(parsedSrvAmt) || parsedSrvAmt < 100 || parsedSrvAmt > 500000) {
            throw new Error('በቴሌብር ዌብሆክ የተመዘገበው የብር መጠን ከተፈቀደው ገደብ ውጭ ነው።');
          }
          verifiedAmount = Number(parsedSrvAmt.toFixed(2));
          consumedFromServerWebhook = true;
        } else {
          throw new Error(
            `ትራንዛክሽን ${txId} በ received_sms_transactions ውስጥ አልተገኘም። እባክዎ የቴሌብር SMS እስኪገባ ይጠብቁ ወይም ትክክለኛውን TX ID ያስገቡ።`,
          );
        }

        if (hasFirestoreSms) {
          transaction.update(smsRef, {
            status: 'used',
            used_by: user.uid,
            used_at: serverTimestamp(),
          });
        }

        transaction.set(usedTxRef, {
          txId,
          uid: user.uid,
          amount: verifiedAmount,
          createdAt: serverTimestamp(),
        });

        transaction.set(depositRef, {
          id: txId,
          uid: user.uid,
          playerName: safeName,
          playerPhone: effectivePhone,
          systemPhone: PHONE_REGEX.test(systemPhone) ? systemPhone : settings.depositPhone,
          txId,
          amount: verifiedAmount,
          status: 'verified',
          verifiedMessage: 'ትክክል ነው — በቴሌብር SMS ዌብሆክ በራስ-ሰር ተረጋግጧል',
          createdAt: serverTimestamp(),
        });

        transaction.set(ledgerRef, {
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
          if (privateSnap.exists()) {
            const prevPriv = privateSnap.data() as { telebirrPhone?: string };
            if (!prevPriv.telebirrPhone) {
              transaction.update(privateRef, {
                telebirrPhone: effectivePhone,
                updatedAt: serverTimestamp(),
              });
            }
          } else {
            transaction.set(privateRef, {
              uid: user.uid,
              email: (user.email || 'user@example.com').slice(0, 150),
              telebirrPhone: effectivePhone,
              updatedAt: serverTimestamp(),
            });
          }
        }

        transaction.update(userRef, {
          balance: Number((currentWallet.balance + verifiedAmount).toFixed(2)),
          hasDeposited: true,
          totalDeposited: Number((currentWallet.totalDeposited + verifiedAmount).toFixed(2)),
          lastActionType: 'deposit',
          lastActionRef: txId,
          updatedAt: serverTimestamp(),
        });
      });

      if (consumedFromServerWebhook) {
        await fetch('/api/telebirr-sms-webhook/consume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txId, uid: user.uid }),
        }).catch(() => undefined);
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('ጥቅም ላይ ውሏል') ||
          err.message.includes('አልተገኘም') ||
          err.message.includes('ገደብ') ||
          err.message.includes('ትክክለኛ'))
      ) {
        throw err;
      }
      handleFirestoreError(err, OperationType.WRITE, `received_sms_transactions/${txId}`);
    }

    return { txId, amount: verifiedAmount };
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) {
      onNotify('አድሚኑ የቴሌብር ስልክ ቁጥሩን እስኪያስገባ ይጠብቁ።', 'error');
      return;
    }
    if (smsLookupState.state === 'used') {
      onNotify('ይህ የትራንዛክሽን ቁጥር ከዚህ በፊት ጥቅም ላይ ውሏል!', 'error');
      return;
    }

    setIsVerifyingDeposit(true);
    setDepositSuccessMsg(null);

    try {
      const result = await verifyAndCreditSmsTransaction(txIdInput);
      const okText = `በቴሌብር SMS በራስ-ሰር ተረጋግጧል! ${formatETB(result.amount)} (TX: ${result.txId}) ወደ ዋሌትዎ ገብቷል።`;
      setDepositSuccessMsg(okText);
      setTxIdInput('');
      onNotify(okText, 'success');
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : '';
      const displayMsg =
        rawMsg && !rawMsg.startsWith('{')
          ? rawMsg
          : 'ዲፖሲቱን በፋየርስቶር ማረጋገጥ አልተቻለም። እባክዎ ዳግም ይሞክሩ።';
      onNotify(displayMsg, 'error');
    } finally {
      setIsVerifyingDeposit(false);
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) {
      onNotify('የሲስተም ቴሌብር መረጃ አልተገኘም።', 'error');
      return;
    }

    setIsSubmittingWithdraw(true);
    try {
      const withdrawalId = await submitTelebirrWithdrawal({
        user,
        wallet,
        settings,
        registeredPhone,
        rawPhone: withdrawPhone,
        amount: parseFloat(withdrawAmount),
      });

      onNotify('የዊዝድሮው ጥያቄ ተልኳል። ሲስተሙ ትክክለኛነቱን እያረጋገጠ ነው (Pending)...', 'info');

      // System verifies deposit history & Telebirr phone integrity automatically
      window.setTimeout(async () => {
        try {
          await runSystemWithdrawalVerification(withdrawalId);
          onNotify('ሲስተሙ ትክክል ነው ብሎ አረጋግጧል! አሁን የአድሚን ሚስጥር ቁጥር በመጠበቅ ላይ ነው።', 'success');
        } catch {
          // Handled safely if admin already processed
        }
      }, 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'የዊዝድሮው ጥያቄውን መላክ አልተቻለም።';
      onNotify(msg, 'error');
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-Tabs: Deposit vs Withdraw */}
      <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
        <button
          type="button"
          onClick={() => setSubTab('deposit')}
          className={`py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
            subTab === 'deposit'
              ? 'bg-emerald-500 text-slate-950 shadow'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <ArrowDownCircle className="w-4 h-4" />
          <span>ዲፖሲት (ዝቅተኛ 100 ብር)</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('withdraw')}
          className={`py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
            subTab === 'withdraw'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <ArrowUpCircle className="w-4 h-4" />
          <span>ዊዝድሮው (ዝቅተኛ 500 ብር)</span>
        </button>
      </div>

      {/* DEPOSIT VIEW */}
      {subTab === 'deposit' && (
        <section className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-8 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-xl font-extrabold text-white">በቴሌብር ብር ዲፖሲት ያድርጉ</h2>
            <p className="text-sm text-slate-400 mt-1">
              ከታች ያለውን የቴሌብር ስልክ ቁጥር ኮፒ አድርገው በራስዎ ስልክ ብሩን ካስተላለፉ በኋላ ትራንሳክሽን አይዲውን ያስገቡ።
            </p>
          </div>

          {/* Admin Registered Telebirr Number Box */}
          <div className="bg-slate-950 border border-emerald-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-emerald-400">
                ብር የሚላክበት የሲስተሙ ቴሌብር ስልክ ቁጥር
              </span>
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="font-mono-num text-2xl sm:text-3xl font-black text-white tracking-wider">
                  {settings?.depositPhone || 'አልተዘጋጀም'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                የአካውንት ስም: <strong className="text-slate-200">{settings?.accountName || '—'}</strong> · ዝቅተኛ ዲፖሲት: <strong className="text-slate-200">100.00 ብር</strong>
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyPhone}
              disabled={!settings?.depositPhone}
              className="shrink-0 px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'ኮፒ ተደርጓል!' : 'ስልክ ቁጥር ኮፒ አድርግ'}</span>
            </button>
          </div>

          {/* Step-by-Step Instructions */}
          <ol className="grid sm:grid-cols-3 gap-3 text-xs sm:text-sm text-slate-300">
            <li className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
              <span className="font-bold text-amber-400 block mb-1">1. ቁጥሩን ኮፒ ያድርጉ</span>
              ከላይ ያለውን የቴሌብር ቁጥር ኮፒ አድርገው በስልክዎ ቴሌብር መተግበሪያ ይክፈቱ።
            </li>
            <li className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
              <span className="font-bold text-amber-400 block mb-1">2. ብሩን ያስተላልፉ</span>
              ቢያንስ 100 ብር ወደዚህ ስልክ ቁጥር በቴሌብር ያስተላልፉ።
            </li>
            <li className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
              <span className="font-bold text-amber-400 block mb-1">3. ትራንሳክሽን አይዲ ያስገቡ</span>
              የደረሰዎትን ትራንሳክሽን አይዲ እና የብር መጠን ከታች ሲያስገቡ ሲስተሙ አረጋግጦ ይጨምርልዎታል።
            </li>
          </ol>

          {depositSuccessMsg && (
            <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center gap-3 text-emerald-300">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <p className="text-sm font-bold">{depositSuccessMsg}</p>
            </div>
          )}

          {/* Deposit Verification Form */}
          <form onSubmit={handleDepositSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">
                  የእርስዎ ቴሌብር ስልክ ቁጥር {registeredPhone && '(የተመዘገበ)'}
                </label>
                <input
                  type="tel"
                  required
                  disabled={Boolean(registeredPhone) || isVerifyingDeposit}
                  value={registeredPhone || depositPhone}
                  onChange={(e) => setDepositPhone(e.target.value)}
                  placeholder="0912345678"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 disabled:opacity-75 rounded-xl px-4 py-3 text-base font-mono-num text-white outline-none"
                />
                {registeredPhone ? (
                  <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    <span>መጀመሪያ ዲፖሲት ያደረጉበት ቴሌብር ቁጥር ለዊዝድሮውም ተቆልፏል።</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    ማሳሰቢያ፡ ሲያሸንፉ ዊዝድሮው የሚወስዱት በዚሁ ስልክ ቁጥር ነው።
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">
                  ከቴሌብር SMS የሚረጋገጥ የብር መጠን
                </label>
                <div className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-base font-mono-num flex items-center justify-between">
                  <span
                    className={
                      smsLookupState.state === 'unused'
                        ? 'text-emerald-400 font-black'
                        : smsLookupState.state === 'used'
                          ? 'text-rose-400 font-bold'
                          : 'text-slate-400'
                    }
                  >
                    {typeof smsLookupState.amount === 'number'
                      ? formatETB(smsLookupState.amount)
                      : 'Transaction ID ሲያስገቡ በራስ-ሰር ይሞላል'}
                  </span>
                  <span className="text-[11px] font-bold text-slate-400">Auto-SMS</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5">
                የቴሌብር ትራንሳክሽን አይዲ (Transaction ID)
              </label>
              <input
                type="text"
                required
                minLength={6}
                maxLength={24}
                disabled={isVerifyingDeposit}
                value={txIdInput}
                onChange={(e) => setTxIdInput(e.target.value.toUpperCase())}
                placeholder="ምሳሌ: BIE4567890"
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-base font-mono-num uppercase text-white outline-none"
              />

              {/* Real-Time `received_sms_transactions` Auto-Verification Status */}
              {smsLookupState.state !== 'idle' && (
                <div
                  className={`mt-2 rounded-xl border px-3.5 py-2.5 text-xs flex items-center gap-2 ${
                    smsLookupState.state === 'unused'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold'
                      : smsLookupState.state === 'used'
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  {smsLookupState.state === 'unused' && (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        በራስ-ሰር ተገኝቷል ({smsLookupState.sourceLabel}) ·{' '}
                        <strong className="font-mono-num text-white">
                          {formatETB(smsLookupState.amount || 0)}
                        </strong>{' '}
                        (Unused — ለመጨመር ዝግጁ)
                      </span>
                    </>
                  )}
                  {smsLookupState.state === 'used' && (
                    <>
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>
                        ይህ የትራንዛክሽን ቁጥር ከዚህ በፊት ጥቅም ላይ ውሏል! (Status: Used)
                      </span>
                    </>
                  )}
                  {smsLookupState.state === 'checking' && (
                    <>
                      <Clock className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
                      <span>በፋየርስቶር received_sms_transactions ላይ በመፈለግ ላይ...</span>
                    </>
                  )}
                  {smsLookupState.state === 'not_found' && (
                    <>
                      <MessageSquareText className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>
                        በ received_sms_transactions ውስጥ ገና አልተገኘም — የቴሌብር SMS እስኪደርስ ጥቂት ሰከንዶች ይጠብቁ ወይም ቁልፉን ተጭነው ይሞክሩ።
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isVerifyingDeposit || !settings || smsLookupState.state === 'used'}
              className="w-full py-3.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-black text-base flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <ShieldCheck className="w-5 h-5" />
              <span>
                {isVerifyingDeposit
                  ? 'በፋየርስቶር ትራንዛክሽን እያረጋገጠ ነው...'
                  : smsLookupState.state === 'unused'
                    ? `በSMS አረጋግጥና ${formatETB(smsLookupState.amount || 0)} ጨምር`
                    : 'በ received_sms_transactions አረጋግጥና ጨምር'}
              </span>
            </button>
          </form>
        </section>
      )}

      {/* WITHDRAW VIEW */}
      {subTab === 'withdraw' && (
        <section className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-8 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-xl font-extrabold text-white">በቴሌብር ብር ዊዝድሮው ያድርጉ</h2>
            <p className="text-sm text-slate-400 mt-1">
              ዝቅተኛው ዊዝድሮው 500 ብር ሲሆን መጀመሪያ ዲፖሲት ካደረጉበት ቴሌብር ላይ ብቻ ወደ እርስዎ ቴሌብር ይላካል።
            </p>
          </div>

          {!wallet.hasDeposited || !registeredPhone ? (
            <div className="p-5 rounded-2xl bg-slate-950 border border-amber-500/40 space-y-3">
              <p className="text-sm font-bold text-amber-400">
                መጀመሪያ ዲፖሲት ማድረግ ያስፈልጋል
              </p>
              <p className="text-sm text-slate-300">
                ዊዝድሮው ለመጠየቅ መጀመሪያ በቴሌብር ቢያንስ 100 ብር ዲፖሲት ማድረግ አለብዎት። ሲያሸንፉ መጀመሪያ ዲፖሲት ካደረጉበት ቴሌብር ላይ መውሰድ ይችላሉ።
              </p>
              <button
                type="button"
                onClick={() => setSubTab('deposit')}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition cursor-pointer"
              >
                ወደ ዲፖሲት ሂድ
              </button>
            </div>
          ) : (
            <form onSubmit={handleWithdrawSubmit} className="space-y-4">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-slate-400 block">ብሩ የሚወጣበት የሲስተም ቴሌብር</span>
                  <span className="font-mono-num font-bold text-slate-200">
                    {settings?.withdrawalPhone || settings?.depositPhone || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">መጀመሪያ ዲፖሲት ያደረጉበት የእርስዎ ቴሌብር</span>
                  <span className="font-mono-num font-bold text-emerald-400">
                    {registeredPhone}
                  </span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">
                    የእርስዎ ቴሌብር ስልክ ቁጥር (ከመጀመሪያው ዲፖሲት ጋር ተመሳሳይ)
                  </label>
                  <input
                    type="tel"
                    required
                    value={withdrawPhone}
                    onChange={(e) => setWithdrawPhone(e.target.value)}
                    placeholder={registeredPhone}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-3 text-base font-mono-num text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">
                    የዊዝድሮው መጠን (ዝቅተኛ 500 ብር)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min={500}
                      max={Math.floor(wallet.balance)}
                      step={1}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-3 text-base font-mono-num text-white outline-none pr-12"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      ብር
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    ያለዎት ቀሪ ሂሳብ: <span className="font-mono-num text-amber-400">{formatETB(wallet.balance)}</span>
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingWithdraw || wallet.balance < 500}
                className="w-full py-3.5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-base flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <ArrowUpCircle className="w-5 h-5" />
                <span>
                  {isSubmittingWithdraw ? 'ጥያቄው እየተላከ ነው...' : 'ዊዝድሮው ጠይቅ'}
                </span>
              </button>
            </form>
          )}
        </section>
      )}

      {/* Player's Withdrawals & Deposits Status Lists */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Withdrawals Status */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-base font-extrabold text-white">የዊዝድሮው ጥያቄዎች ሁኔታ</h3>
            <p className="text-xs text-slate-400">አድሚኑ የቴሌብር ሚስጥር ቁጥር እስኪያስገባ ፔንዲንግ ይቆያል</p>
          </div>

          {withdrawals.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">እስካሁን ምንም የዊዝድሮው ጥያቄ የለም።</p>
          ) : (
            <div className="space-y-3">
              {withdrawals.map((w) => (
                <div
                  key={w.id}
                  className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-num text-base font-black text-white">
                      {formatETB(w.amount)}
                    </span>
                    {w.status === 'pending' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400">
                        <Clock className="w-4 h-4" />
                        <span>ፔንዲንግ (Pending)</span>
                      </span>
                    )}
                    {w.status === 'completed' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>ወደ ቴሌብርዎ ገብቷል</span>
                      </span>
                    )}
                    {w.status === 'rejected' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-400">
                        <XCircle className="w-4 h-4" />
                        <span>ተመልሷል (Refunded)</span>
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                    <span>ቴሌብር: <strong className="font-mono-num text-slate-200">{w.playerPhone}</strong></span>
                    <span>·</span>
                    <span className={w.systemVerified ? 'text-emerald-400 font-bold' : 'text-amber-300'}>
                      {w.systemVerified ? 'ትክክል ነው (ሲስተሙ አረጋግጧል)' : w.systemVerifiedText}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Deposits History */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-base font-extrabold text-white">የቴሌብር ዲፖሲት ታሪክ</h3>
            <p className="text-xs text-slate-400">በፋየርስቶር ላይ የተመዘገቡ እና የተረጋገጡ ዲፖሲቶች</p>
          </div>

          {deposits.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">እስካሁን ምንም ዲፖሲት አልተመዘገበም።</p>
          ) : (
            <div className="space-y-3">
              {deposits.map((d) => (
                <div
                  key={d.id}
                  className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-num text-base font-black text-emerald-400">
                      +{formatETB(d.amount)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>ትክክል ነው</span>
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                    <span>TX: <strong className="font-mono-num text-slate-200">{d.txId}</strong></span>
                    <span>·</span>
                    <span>ከ: <strong className="font-mono-num text-slate-200">{d.playerPhone}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
