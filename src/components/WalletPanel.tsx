import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Lock,
  Phone,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { formatETB } from '../lib/gameEngine';
import {
  runSystemWithdrawalVerification,
  submitTelebirrDeposit,
  submitTelebirrWithdrawal,
} from '../lib/firestoreService';
import {
  DepositRecord,
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
  const [depositAmount, setDepositAmount] = useState('100');
  const [isVerifyingDeposit, setIsVerifyingDeposit] = useState(false);
  const [depositSuccessMsg, setDepositSuccessMsg] = useState<string | null>(null);

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

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) {
      onNotify('አድሚኑ የቴሌብር ስልክ ቁጥሩን እስኪያስገባ ይጠብቁ።', 'error');
      return;
    }

    setIsVerifyingDeposit(true);
    setDepositSuccessMsg(null);

    try {
      // Brief system verification step for clear visual confirmation
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      const result = await submitTelebirrDeposit({
        user,
        wallet,
        settings,
        rawPhone: registeredPhone || depositPhone,
        rawTxId: txIdInput,
        amount: parseFloat(depositAmount),
        registeredPhone,
      });

      const okText = `ትክክል ነው! ${formatETB(result.amount)} (TX: ${result.txId}) ወደ ሂሳብዎ ገብቷል።`;
      setDepositSuccessMsg(okText);
      setTxIdInput('');
      onNotify(okText, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ዲፖሲቱን ማረጋገጥ አልተቻለም።';
      onNotify(msg, 'error');
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
                  ያስተላለፉት ብር መጠን (ዝቅተኛ 100 ብር)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min={100}
                    max={500000}
                    step={1}
                    disabled={isVerifyingDeposit}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-base font-mono-num text-white outline-none pr-12"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    ብር
                  </span>
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
                placeholder="ምሳሌ: CL84X92K1M"
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-base font-mono-num uppercase text-white outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isVerifyingDeposit || !settings}
              className="w-full py-3.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-black text-base flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <ShieldCheck className="w-5 h-5" />
              <span>
                {isVerifyingDeposit
                  ? 'ሲስተሙ የቴሌብር መተላለፍን እያረጋገጠ ነው...'
                  : 'አረጋግጥና ብሩን ዲፖሲት አድርግ'}
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
