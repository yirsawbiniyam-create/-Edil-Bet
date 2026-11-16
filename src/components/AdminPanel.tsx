import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Copy,
  ImagePlus,
  KeyRound,
  MessageSquareText,
  Phone,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { DEFAULT_GAME_CONFIG, formatETB, GameConfigValues } from '../lib/gameEngine';
import {
  adminCompleteWithdrawalWithPin,
  adminRecordSimulatedTelebirrSms,
  adminRejectAndRefundWithdrawal,
  adminSaveGameConfig,
  adminSaveGameLogo,
  adminSaveTelebirrSettings,
  runSystemWithdrawalVerification,
} from '../lib/firestoreService';
import {
  DepositRecord,
  GameBranding,
  GameConfig,
  LedgerEntry,
  TelebirrSettings,
  WithdrawalRecord,
} from '../types';
import { GameLogo } from './GameLogo';

interface AdminPanelProps {
  adminUid: string;
  settings: TelebirrSettings | null;
  branding: GameBranding | null;
  gameConfig: GameConfig | null;
  withdrawals: WithdrawalRecord[];
  deposits: DepositRecord[];
  ledger: LedgerEntry[];
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
  onOpenAccountSettings?: () => void;
}

function compressImageToLogoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ፋይሉን ማንበብ አልተቻለም።'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('ትክክለኛ የምስል ፋይል አይደለም።'));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('ምስሉን ማዘጋጀት አልተቻለም።'));
          return;
        }
        ctx.clearRect(0, 0, size, size);
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (size - w) / 2;
        const y = (size - h) / 2;
        ctx.drawImage(img, x, y, w, h);

        let dataUrl = canvas.toDataURL('image/webp', 0.85);
        if (dataUrl.length > 180000) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        }
        if (dataUrl.length > 195000) {
          reject(new Error('የምስሉ መጠን በጣም ትልቅ ነው። እባክዎ ቀለል ያለ ሎጎ ይምረጡ።'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  adminUid,
  settings,
  branding,
  gameConfig,
  withdrawals,
  deposits,
  ledger,
  onNotify,
  onOpenAccountSettings,
}) => {
  const [depositPhoneInput, setDepositPhoneInput] = useState(settings?.depositPhone || '');
  const [withdrawalPhoneInput, setWithdrawalPhoneInput] = useState(
    settings?.withdrawalPhone || settings?.depositPhone || '',
  );
  const [accountNameInput, setAccountNameInput] = useState(
    settings?.accountName || 'እድል ቤት · Edil Bet',
  );
  const [winRateInput, setWinRateInput] = useState(
    String(Math.round((settings?.houseWinRate ?? 0.28) * 100)),
  );
  const [savingSettings, setSavingSettings] = useState(false);

  // Game Odds & Table Limits State
  const [oddsForm, setOddsForm] = useState<GameConfigValues>(() => ({
    ...DEFAULT_GAME_CONFIG,
    ...(gameConfig
      ? {
          minBet: gameConfig.minBet,
          maxBet: gameConfig.maxBet,
          houseWinRate: gameConfig.houseWinRate,
          singleDiceRangeOdds: gameConfig.singleDiceRangeOdds,
          singleDiceExactOdds: gameConfig.singleDiceExactOdds,
          doubleDiceRangeOdds: gameConfig.doubleDiceRangeOdds,
          doubleDiceLucky7Odds: gameConfig.doubleDiceLucky7Odds,
          coinOdds: gameConfig.coinOdds,
          luckyOdds: gameConfig.luckyOdds,
          footballOddsScale: gameConfig.footballOddsScale,
          footballMaxOdds: gameConfig.footballMaxOdds,
        }
      : {}),
  }));
  const [savingGameConfig, setSavingGameConfig] = useState(false);

  // Game Logo Branding State
  const [logoInput, setLogoInput] = useState(branding?.logoDataUrl || '');
  const [savingLogo, setSavingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Selected withdrawal for sequential PIN processing
  const [selectedWithdrawalId, setSelectedWithdrawalId] = useState<string | null>(null);
  const [telebirrPin, setTelebirrPin] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Activity Log Views
  const [logView, setLogView] = useState<'ledger' | 'deposits' | 'withdrawals'>('ledger');
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'income' | 'expense'>('all');

  // Telebirr MacroDroid SMS Gateway Test State
  const [simSmsText, setSimSmsText] = useState(
    'You have received ETB 500.00 from 0911223344. Your transaction number is TB84X92K1M.',
  );
  const [sendingSimSms, setSendingSimSms] = useState(false);

  useEffect(() => {
    if (settings) {
      setDepositPhoneInput(settings.depositPhone);
      setWithdrawalPhoneInput(settings.withdrawalPhone || settings.depositPhone);
      setAccountNameInput(settings.accountName);
      setWinRateInput(String(Math.round(settings.houseWinRate * 100)));
    }
  }, [settings]);

  useEffect(() => {
    if (branding) {
      setLogoInput(branding.logoDataUrl);
    }
  }, [branding]);

  useEffect(() => {
    if (gameConfig) {
      setOddsForm({
        minBet: gameConfig.minBet,
        maxBet: gameConfig.maxBet,
        houseWinRate: gameConfig.houseWinRate,
        singleDiceRangeOdds: gameConfig.singleDiceRangeOdds,
        singleDiceExactOdds: gameConfig.singleDiceExactOdds,
        doubleDiceRangeOdds: gameConfig.doubleDiceRangeOdds,
        doubleDiceLucky7Odds: gameConfig.doubleDiceLucky7Odds,
        coinOdds: gameConfig.coinOdds,
        luckyOdds: gameConfig.luckyOdds,
        footballOddsScale: gameConfig.footballOddsScale,
        footballMaxOdds: gameConfig.footballMaxOdds,
      });
    }
  }, [gameConfig]);

  const pendingQueue = useMemo(() => {
    return [...withdrawals]
      .filter((w) => w.status === 'pending')
      .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
  }, [withdrawals]);

  const completedWithdrawals = useMemo(
    () => withdrawals.filter((w) => w.status === 'completed'),
    [withdrawals],
  );

  const totals = useMemo(() => {
    const totalIncome = ledger
      .filter((e) => e.type === 'income')
      .reduce((acc, item) => acc + item.amount, 0);
    const totalExpense = ledger
      .filter((e) => e.type === 'expense')
      .reduce((acc, item) => acc + item.amount, 0);
    const pendingSum = pendingQueue.reduce((acc, item) => acc + item.amount, 0);
    return {
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
      pendingSum,
    };
  }, [ledger, pendingQueue]);

  const filteredLedger = useMemo(() => {
    return ledger.filter((e) => {
      if (ledgerFilter === 'income') return e.type === 'income';
      if (ledgerFilter === 'expense') return e.type === 'expense';
      return true;
    });
  }, [ledger, ledgerFilter]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const numericRate = Math.min(45, Math.max(10, Number(winRateInput) || 28)) / 100;
      await adminSaveTelebirrSettings({
        adminUid,
        depositPhone: depositPhoneInput,
        withdrawalPhone: withdrawalPhoneInput,
        accountName: accountNameInput,
        houseWinRate: numericRate,
      });
      onNotify(
        'የዲፖሲት እና የዊዝድሮው ቴሌብር ስልክ ቁጥሮች በፋየርስቶር ላይ ተቀምጠዋል!',
        'success',
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'ቅንብሩን ማስቀመጥ አልተቻለም።', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleLogoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToLogoDataUrl(file);
      setLogoInput(compressed);
      setSavingLogo(true);
      await adminSaveGameLogo({ adminUid, logoDataUrl: compressed });
      onNotify('የእድል ቤት (Edil Bet) ሎጎ በሁሉም ቦታ ላይ እንዲታይ ተቀምጧል!', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'ሎጎውን መጫን አልተቻለም።', 'error');
    } finally {
      setSavingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveLogoUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLogo(true);
    try {
      await adminSaveGameLogo({ adminUid, logoDataUrl: logoInput });
      onNotify('የጌሙ ሎጎ በፋየርስቶር ላይ ተቀምጧል!', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'ሎጎውን ማስቀመጥ አልተቻለም።', 'error');
    } finally {
      setSavingLogo(false);
    }
  };

  const handleResetLogo = async () => {
    setSavingLogo(true);
    try {
      await adminSaveGameLogo({ adminUid, logoDataUrl: '' });
      setLogoInput('');
      onNotify('ሎጎው ወደ መጀመሪያው ተመልሷል።', 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'ሎጎውን ማጥፋት አልተቻለም።', 'error');
    } finally {
      setSavingLogo(false);
    }
  };

  const applyOddsPreset = (preset: 'tight' | 'standard' | 'generous') => {
    if (preset === 'tight') {
      setOddsForm({
        minBet: 20,
        maxBet: 25000,
        houseWinRate: 0.18,
        singleDiceRangeOdds: 1.85,
        singleDiceExactOdds: 4.8,
        doubleDiceRangeOdds: 2.0,
        doubleDiceLucky7Odds: 4.2,
        coinOdds: 1.85,
        luckyOdds: 15,
        footballOddsScale: 0.9,
        footballMaxOdds: 250,
      });
    } else if (preset === 'generous') {
      setOddsForm({
        minBet: 5,
        maxBet: 100000,
        houseWinRate: 0.38,
        singleDiceRangeOdds: 2.1,
        singleDiceExactOdds: 6.0,
        doubleDiceRangeOdds: 2.4,
        doubleDiceLucky7Odds: 5.5,
        coinOdds: 2.1,
        luckyOdds: 22,
        footballOddsScale: 1.15,
        footballMaxOdds: 500,
      });
    } else {
      setOddsForm({ ...DEFAULT_GAME_CONFIG });
    }
  };

  const handleSaveGameConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGameConfig(true);
    try {
      await adminSaveGameConfig({
        adminUid,
        config: oddsForm,
      });
      onNotify(
        'የጨዋታ አሸናፊነት (Odds) እና የጠረጴዛ ገደቦች (Table Limits) በፋየርስቶር ላይ ተቀምጠዋል!',
        'success',
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'የጨዋታ ገደቦችን እና ኦድሶችን ማስቀመጥ አልተቻለም።',
        'error',
      );
    } finally {
      setSavingGameConfig(false);
    }
  };

  const handleCompleteWithPin = async (withdrawal: WithdrawalRecord) => {
    setProcessingId(withdrawal.id);
    try {
      await adminCompleteWithdrawalWithPin({
        withdrawal,
        adminUid,
        telebirrPin,
      });
      onNotify(
        `${formatETB(withdrawal.amount)} ወደ ${withdrawal.playerPhone} ቴሌብር ተልኳል (ወጪ ተመዝግቧል)!`,
        'success',
      );
      setTelebirrPin('');
      setSelectedWithdrawalId(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'ክፍያውን ማጽደቅ አልተቻለም።', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (withdrawal: WithdrawalRecord) => {
    setProcessingId(withdrawal.id);
    try {
      await adminRejectAndRefundWithdrawal({ withdrawal, adminUid });
      onNotify(
        `የ${withdrawal.playerName} ጥያቄ ተሰርዞ ${formatETB(withdrawal.amount)} ወደ ሂሳባቸው ተመልሷል።`,
        'info',
      );
      setSelectedWithdrawalId(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'ጥያቄውን መመለስ አልተቻለም።', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleManualVerify = async (withdrawalId: string) => {
    try {
      await runSystemWithdrawalVerification(withdrawalId);
      onNotify('ትክክል ነው — ሲስተሙ አረጋግጧል!', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'ማረጋገጥ አልተቻለም።', 'error');
    }
  };

  const webhookEndpointUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/telebirr-sms-webhook`
      : '/api/telebirr-sms-webhook';

  const handleSimulateWebhookSms = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingSimSms(true);
    try {
      const firestoreRes = await adminRecordSimulatedTelebirrSms({
        rawMessage: simSmsText,
      });
      await fetch('/api/telebirr-sms-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret_key: 'yene_betting_secret_key_123',
          message: simSmsText,
          source: 'admin_sim',
        }),
      }).catch(() => undefined);

      onNotify(
        `የቴሌብር SMS (TX: ${firestoreRes.transactionId} · ${formatETB(firestoreRes.amount)}) በFirestore received_sms_transactions ላይ ተመዝግቧል!`,
        'success',
      );
      const randSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
      setSimSmsText(
        `You have received ETB 500.00 from 0911223344. Your transaction number is TB${randSuffix}.`,
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'የቴሌብር SMS መመዝገብ አልተቻለም።',
        'error',
      );
    } finally {
      setSendingSimSms(false);
    }
  };

  return (
    <div className="space-y-6">
      {onOpenAccountSettings && (
        <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <h2 className="text-sm font-extrabold text-white">
                የአድሚን ዩዘርኔም እና ፓስዎርድ ማስተካከያ (Firestore Sync)
              </h2>
              <p className="text-xs text-slate-400">
                ከፈለጉ የመግቢያ ዩዘርኔምዎን እና ፓስዎርድዎን እዚህ በቀጥታ መቀየር ይችላሉ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenAccountSettings}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
          >
            <KeyRound className="w-4 h-4" />
            <span>ዩዘርኔም እና ፓስዎርድ ቀይር</span>
          </button>
        </div>
      )}

      {/* Financial KPI Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs font-semibold text-slate-400">ጠቅላላ ገቢ (ዲፖሲት)</span>
          <p className="font-mono-num text-xl sm:text-2xl font-black text-emerald-400 mt-1">
            +{formatETB(totals.totalIncome)}
          </p>
          <span className="text-xs text-slate-500">{deposits.length} ዲፖሲቶች</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs font-semibold text-slate-400">ጠቅላላ ወጪ (ዊዝድሮው)</span>
          <p className="font-mono-num text-xl sm:text-2xl font-black text-rose-400 mt-1">
            -{formatETB(totals.totalExpense)}
          </p>
          <span className="text-xs text-slate-500">{completedWithdrawals.length} የተከፈሉ</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs font-semibold text-slate-400">የተጣራ ቀሪ (Net)</span>
          <p className="font-mono-num text-xl sm:text-2xl font-black text-amber-400 mt-1">
            {formatETB(totals.net)}
          </p>
          <span className="text-xs text-slate-500">ገቢ ሲቀነስ ወጪ</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs font-semibold text-slate-400">በመጠባበቅ ላይ (Pending)</span>
          <p className="font-mono-num text-xl sm:text-2xl font-black text-white mt-1">
            {formatETB(totals.pendingSum)}
          </p>
          <span className="text-xs text-slate-500">{pendingQueue.length} የዊዝድሮው ጥያቄዎች</span>
        </div>
      </div>

      {/* 1. Admin Game Logo Upload & Branding */}
      <section className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <GameLogo logoUrl={logoInput || branding?.logoDataUrl} size="md" />
          <div>
            <h2 className="text-lg font-extrabold text-white">
              የጌሙ ሎጎ ማስገቢያ (እድል ቤት · Edil Bet Logo)
            </h2>
            <p className="text-xs text-slate-400">
              እዚህ የሚያስገቡት የጌሙ ሎጎ ለሁሉም ተጫዋቾች በመላው ሲስተሙ ላይ (Header፣ መግቢያ እና ጨዋታ) ይታያል
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-end">
          <div className="shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoFileSelected}
              className="hidden"
              id="adminLogoUpload"
            />
            <label
              htmlFor="adminLogoUpload"
              className="px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
            >
              <ImagePlus className="w-4 h-4" />
              <span>ሎጎ ከስልክ / ኮምፒውተር ምረጥ</span>
            </label>
          </div>

          <form onSubmit={handleSaveLogoUrl} className="flex-1 flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={logoInput}
              onChange={(e) => setLogoInput(e.target.value)}
              placeholder="ወይም የምስል ሊንክ (https://...) ያስገቡ"
              className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
            />
            <button
              type="submit"
              disabled={savingLogo}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>{savingLogo ? 'በማስቀመጥ ላይ...' : 'ሎጎውን አስቀምጥ'}</span>
            </button>
            {(logoInput || branding?.logoDataUrl) && (
              <button
                type="button"
                disabled={savingLogo}
                onClick={handleResetLogo}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4" />
                <span>አጥፋ</span>
              </button>
            )}
          </form>
        </div>
      </section>

      {/* 2. Admin Telebirr Deposit & Withdrawal Phone Configuration */}
      <section className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
            <Phone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white">
              የቴሌብር ዲፖሲት እና ዊዝድሮው ስልክ ቁጥር ማስተካከያ
            </h2>
            <p className="text-xs text-slate-400">
              ተጫዋቾች ብር ዲፖሲት የሚያደርጉበትን እና ዊዝድሮው የሚከፈልበትን የቴሌብር ስልክ ቁጥሮች እዚህ ያስገቡ እና ይቀይሩ
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveSettings} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5">
              የዲፖሲት ቴሌብር ቁጥር (Deposit Phone)
            </label>
            <input
              type="tel"
              required
              value={depositPhoneInput}
              onChange={(e) => setDepositPhoneInput(e.target.value)}
              placeholder="0911223344"
              className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-base font-mono-num text-white outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5">
              የዊዝድሮው ቴሌብር ቁጥር (Withdrawal Phone)
            </label>
            <input
              type="tel"
              required
              value={withdrawalPhoneInput}
              onChange={(e) => setWithdrawalPhoneInput(e.target.value)}
              placeholder="0911223344"
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-base font-mono-num text-white outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5">
              የቴሌብር አካውንት ስም
            </label>
            <input
              type="text"
              required
              value={accountNameInput}
              onChange={(e) => setAccountNameInput(e.target.value)}
              placeholder="እድል ቤት · Edil Bet"
              className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-base text-white outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5">
              የተጫዋች የማሸነፍ እድል (10% - 45%)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min={10}
                max={45}
                value={winRateInput}
                onChange={(e) => setWinRateInput(e.target.value)}
                className="w-20 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2.5 text-base font-mono-num text-white outline-none"
              />
              <button
                type="submit"
                disabled={savingSettings}
                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
              >
                <Save className="w-4 h-4" />
                <span>{savingSettings ? 'በማስቀመጥ ላይ...' : 'ቁጥሮችን አስቀምጥ'}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Telebirr SMS Gateway / MacroDroid Webhook Setup & Test Simulator */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <MessageSquareText className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  የቴሌብር አውቶማቲክ SMS Gateway (MacroDroid Webhook)
                </h3>
                <p className="text-xs text-slate-400">
                  ከቴሌብር (127) የሚመጡ SMS ዎችን በMacroDroid POST Webhook ወደ `received_sms_transactions` ይላኩ
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(webhookEndpointUrl)
                  .then(() => onNotify('Webhook URL ኮፒ ተደርጓል!', 'success'))
                  .catch(() => onNotify(webhookEndpointUrl, 'info'));
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-emerald-300 flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Webhook URL ቅዳ</span>
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1">
              <span className="text-slate-400 font-bold block">POST Webhook Endpoint</span>
              <code className="font-mono-num text-emerald-300 break-all block">
                {webhookEndpointUrl}
              </code>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1">
              <span className="text-slate-400 font-bold block">MacroDroid JSON Body Format</span>
              <code className="font-mono-num text-amber-300 break-all block">
                {'{"secret_key":"yene_betting_secret_key_123","message":"{sms_text}"}'}
              </code>
            </div>
          </div>

          <form onSubmit={handleSimulateWebhookSms} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              required
              value={simSmsText}
              onChange={(e) => setSimSmsText(e.target.value)}
              placeholder="You have received ETB 500.00 ... transaction number is TB..."
              className="flex-1 bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs font-mono-num text-white outline-none"
            />
            <button
              type="submit"
              disabled={sendingSimSms}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sendingSimSms ? 'በመመዝገብ ላይ...' : 'የሙከራ SMS ላክ'}</span>
            </button>
          </form>
        </div>
      </section>

      {/* 2B. Admin Game Odds & Table Limits Configuration */}
      <section className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white">
                የጨዋታ አሸናፊነት (Odds) እና የጠረጴዛ ገደቦች (Table Limits)
              </h2>
              <p className="text-xs text-slate-400">
                ዝቅተኛ/ከፍተኛ መወራረጃ፣ የተጫዋች የማሸነፍ እድል፣ እና የእያንዳንዱ ጨዋታ ሽልማት (Odds) እዚህ ይቆጣጠሩ
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => applyOddsPreset('tight')}
              className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-rose-300 transition cursor-pointer"
            >
              ጠንካራ (18%)
            </button>
            <button
              type="button"
              onClick={() => applyOddsPreset('standard')}
              className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-amber-300 transition cursor-pointer"
            >
              መደበኛ (28%)
            </button>
            <button
              type="button"
              onClick={() => applyOddsPreset('generous')}
              className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-emerald-300 transition cursor-pointer"
            >
              ለጋስ (38%)
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveGameConfig} className="space-y-5">
          {/* Table Limits Row */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
              የጠረጴዛ ገደቦች (Table Betting Limits)
            </h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">
                  ዝቅተኛ መወራረጃ (Min Bet · ብር)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50000}
                  step={1}
                  required
                  value={oddsForm.minBet}
                  onChange={(e) =>
                    setOddsForm((prev) => ({ ...prev, minBet: Number(e.target.value) }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-base font-mono-num text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">
                  ከፍተኛ መወራረጃ (Max Bet · ብር)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10000000}
                  step={1}
                  required
                  value={oddsForm.maxBet}
                  onChange={(e) =>
                    setOddsForm((prev) => ({ ...prev, maxBet: Number(e.target.value) }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-base font-mono-num text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">
                  ከፍተኛ የእግር ኳስ ትኬት ኦድ (Max Slip Odds)
                </label>
                <input
                  type="number"
                  min={5}
                  max={1000000}
                  step={5}
                  required
                  value={oddsForm.footballMaxOdds}
                  onChange={(e) =>
                    setOddsForm((prev) => ({ ...prev, footballMaxOdds: Number(e.target.value) }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-base font-mono-num text-white outline-none"
                />
              </div>
            </div>
          </div>

          {/* Win Probability & Football Odds Scale Sliders */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300">
                  የተጫዋች የማሸነፍ እድል (Win Probability)
                </label>
                <span className="font-mono-num text-sm font-black text-amber-400">
                  {Math.round(oddsForm.houseWinRate * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={50}
                step={1}
                value={Math.round(oddsForm.houseWinRate * 100)}
                onChange={(e) =>
                  setOddsForm((prev) => ({
                    ...prev,
                    houseWinRate: Number(e.target.value) / 100,
                  }))
                }
                className="w-full accent-amber-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-500 font-mono-num">
                <span>5% (ለቤት ጠንካራ)</span>
                <span>28% (መደበኛ)</span>
                <span>50% (እኩል)</span>
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300">
                  የእግር ኳስ ቤቲንግ ኦድስ መጠን (Football Odds Scale)
                </label>
                <span className="font-mono-num text-sm font-black text-emerald-400">
                  {oddsForm.footballOddsScale.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={70}
                max={150}
                step={5}
                value={Math.round(oddsForm.footballOddsScale * 100)}
                onChange={(e) =>
                  setOddsForm((prev) => ({
                    ...prev,
                    footballOddsScale: Number(e.target.value) / 100,
                  }))
                }
                className="w-full accent-emerald-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-500 font-mono-num">
                <span>0.70x (-30%)</span>
                <span>1.00x (መደበኛ)</span>
                <span>1.50x (+50%)</span>
              </div>
            </div>
          </div>

          {/* Individual Game Payout Odds */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
              የጨዋታዎች ሽልማት መጠን (Game Payout Multipliers)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  ባለ 1 ዳይስ (1-3/4-6)
                </label>
                <input
                  type="number"
                  min={1.2}
                  max={5.0}
                  step={0.1}
                  value={oddsForm.singleDiceRangeOdds}
                  onChange={(e) =>
                    setOddsForm((prev) => ({
                      ...prev,
                      singleDiceRangeOdds: Number(e.target.value),
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-sm font-mono-num text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  ባለ 1 ዳይስ (Exact)
                </label>
                <input
                  type="number"
                  min={2.0}
                  max={12.0}
                  step={0.1}
                  value={oddsForm.singleDiceExactOdds}
                  onChange={(e) =>
                    setOddsForm((prev) => ({
                      ...prev,
                      singleDiceExactOdds: Number(e.target.value),
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-sm font-mono-num text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  ባለ 2 ዳይስ (2-6/8-12)
                </label>
                <input
                  type="number"
                  min={1.2}
                  max={5.0}
                  step={0.1}
                  value={oddsForm.doubleDiceRangeOdds}
                  onChange={(e) =>
                    setOddsForm((prev) => ({
                      ...prev,
                      doubleDiceRangeOdds: Number(e.target.value),
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-sm font-mono-num text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  ባለ 2 ዳይስ (Lucky 7)
                </label>
                <input
                  type="number"
                  min={2.0}
                  max={12.0}
                  step={0.1}
                  value={oddsForm.doubleDiceLucky7Odds}
                  onChange={(e) =>
                    setOddsForm((prev) => ({
                      ...prev,
                      doubleDiceLucky7Odds: Number(e.target.value),
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-sm font-mono-num text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  የሳንቲም ውርርድ (x)
                </label>
                <input
                  type="number"
                  min={1.2}
                  max={4.0}
                  step={0.1}
                  value={oddsForm.coinOdds}
                  onChange={(e) =>
                    setOddsForm((prev) => ({ ...prev, coinOdds: Number(e.target.value) }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-sm font-mono-num text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  የእድል ቁጥር 1-20 (x)
                </label>
                <input
                  type="number"
                  min={5.0}
                  max={35.0}
                  step={0.5}
                  value={oddsForm.luckyOdds}
                  onChange={(e) =>
                    setOddsForm((prev) => ({ ...prev, luckyOdds: Number(e.target.value) }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-sm font-mono-num text-white outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              ለውጦቹ ሲቀመጡ ወዲያውኑ በሁሉም ተጫዋቾች ላይ ተግባራዊ ይሆናሉ።
            </p>
            <button
              type="submit"
              disabled={savingGameConfig}
              className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-black text-sm flex items-center gap-2 transition cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>{savingGameConfig ? 'በማስቀመጥ ላይ...' : 'ኦድስ እና ገደቦችን አስቀምጥ'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* 3. Sequential Pending Withdrawals Queue */}
      <section className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white">
                ዊዝድሮው የጠየቁ ተጫዋቾች ({pendingQueue.length} ፔንዲንግ)
              </h2>
              <p className="text-xs text-slate-400">
                ሲስተሙ "ትክክል ነው" ብሎ አረንጓዴ ሲያሳይ በየተራ ክሊክ እያደረጉ የቴሌብር ሚስጥር ቁጥርዎን (Secret Code) ያስገቡ
              </p>
            </div>
          </div>
        </div>

        {pendingQueue.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-sm">
            በአሁኑ ጊዜ በመጠባበቅ ላይ ያለ የዊዝድሮው ጥያቄ የለም።
          </div>
        ) : (
          <div className="space-y-3">
            {pendingQueue.map((w, index) => {
              const isSelected = selectedWithdrawalId === w.id;
              const isProcessing = processingId === w.id;

              return (
                <div
                  key={w.id}
                  className={`rounded-2xl border p-4 transition ${
                    isSelected
                      ? 'bg-slate-950 border-emerald-500'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono-num text-xs font-black text-amber-400">
                          #{index + 1}
                        </span>
                        <span className="font-bold text-white">{w.playerName}</span>
                        <span className="font-mono-num text-sm font-bold text-slate-300">
                          {w.playerPhone}
                        </span>
                        <span className="font-mono-num text-base font-black text-amber-400">
                          {formatETB(w.amount)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {w.systemVerified ? (
                          <span className="inline-flex items-center gap-1.5 font-extrabold text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>ትክክል ነው — ሲስተሙ አረጋግጧል</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-bold text-amber-300">
                            <Clock className="w-4 h-4" />
                            <span>{w.systemVerifiedText}</span>
                          </span>
                        )}
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400">
                          ከሲስተም ቴሌብር: <strong className="font-mono-num">{w.sourceSystemPhone}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!w.systemVerified && (
                        <button
                          type="button"
                          onClick={() => handleManualVerify(w.id)}
                          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-emerald-400 transition cursor-pointer"
                        >
                          ትክክለኛነት አረጋግጥ
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedWithdrawalId(isSelected ? null : w.id);
                          setTelebirrPin('');
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
                          isSelected
                            ? 'bg-slate-800 text-slate-300'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                        }`}
                      >
                        {isSelected ? 'ዝጋ' : 'ክሊክ አድርገህ ክፈል'}
                      </button>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                      {!w.systemVerified ? (
                        <p className="text-xs font-bold text-amber-400">
                          እባክዎ መጀመሪያ ሲስተሙ "ትክክል ነው" ብሎ እስኪያረጋግጥ ይጠብቁ ወይም "ትክክለኛነት አረጋግጥ" የሚለውን ይጫኑ።
                        </p>
                      ) : (
                        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                          <div className="flex-1">
                            <label className="block text-xs font-bold text-emerald-400 mb-1.5">
                              የቴሌብር ሚስጥር ቁጥር (Telebirr Secret Code) ያስገቡ — {formatETB(w.amount)} ወደ {w.playerPhone}
                            </label>
                            <input
                              type="password"
                              inputMode="numeric"
                              maxLength={6}
                              value={telebirrPin}
                              onChange={(e) => setTelebirrPin(e.target.value.replace(/\D/g, ''))}
                              placeholder="••••••"
                              className="w-full bg-slate-900 border border-emerald-500/50 focus:border-emerald-400 rounded-xl px-4 py-2.5 text-lg font-mono-num tracking-widest text-white outline-none"
                            />
                          </div>

                          <button
                            type="button"
                            disabled={isProcessing || telebirrPin.length < 4}
                            onClick={() => handleCompleteWithPin(w)}
                            className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            <span>{isProcessing ? 'በመላክ ላይ...' : 'ሚስጥር ቁጥር አረጋግጥና ብር ላክ'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleReject(w)}
                            className="px-4 py-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                          >
                            <RotateCcw className="w-4 h-4" />
                            <span>መልስ (Refund)</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Complete Logs: Incoming Deposits, Outgoing Withdrawals & Income/Expense Ledger */}
      <section className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-extrabold text-white">
              የገቢ ዲፖሲቶች፣ የወጪ ዊዝድሮዎች እና የሂሳብ መዝገብ
            </h2>
            <p className="text-xs text-slate-400">
              Incoming Deposits &amp; Outgoing Withdrawals Log (በፋየርስቶር የተመዘገበ)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
            {(
              [
                ['ledger', `ሁሉም መዝገብ (${ledger.length})`],
                ['deposits', `ገቢ ዲፖሲቶች (${deposits.length})`],
                ['withdrawals', `ወጪ ዊዝድሮዎች (${withdrawals.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLogView(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  logView === key
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Sub-filter for ledger */}
        {logView === 'ledger' && (
          <div className="flex items-center gap-2">
            {(
              [
                ['all', 'ሁሉም'],
                ['income', 'ገቢ (Income)'],
                ['expense', 'ወጪ (Expense)'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLedgerFilter(key)}
                className={`px-3 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                  ledgerFilter === key
                    ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Ledger View */}
        {logView === 'ledger' && (
          filteredLedger.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">
              እስካሁን የተመዘገበ የወጪ ወይም የገቢ ዝርዝር የለም።
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-xs font-bold text-slate-400 border-b border-slate-800">
                    <th className="py-3 px-3">አይነት</th>
                    <th className="py-3 px-3">ተጫዋች</th>
                    <th className="py-3 px-3">ቴሌብር ስልክ</th>
                    <th className="py-3 px-3">ዝርዝር</th>
                    <th className="py-3 px-3 text-right">መጠን</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-xs sm:text-sm">
                  {filteredLedger.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 whitespace-nowrap">
                        {entry.type === 'income' ? (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-400">
                            <ArrowDownLeft className="w-4 h-4" />
                            <span>ገቢ</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-bold text-rose-400">
                            <ArrowUpRight className="w-4 h-4" />
                            <span>ወጪ</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-200 whitespace-nowrap">
                        {entry.playerName}
                      </td>
                      <td className="py-3 px-3 font-mono-num text-slate-300 whitespace-nowrap">
                        {entry.playerPhone}
                      </td>
                      <td className="py-3 px-3 text-slate-400">{entry.description}</td>
                      <td
                        className={`py-3 px-3 text-right font-mono-num font-extrabold whitespace-nowrap ${
                          entry.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {entry.type === 'income' ? '+' : '-'}
                        {formatETB(entry.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Incoming Deposits Log */}
        {logView === 'deposits' && (
          deposits.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">
              እስካሁን ምንም የገቢ ዲፖሲት አልተመዘገበም።
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-xs font-bold text-slate-400 border-b border-slate-800">
                    <th className="py-3 px-3">ተጫዋች</th>
                    <th className="py-3 px-3">የላከው ስልክ</th>
                    <th className="py-3 px-3">የሲስተም ቁጥር</th>
                    <th className="py-3 px-3">Transaction ID</th>
                    <th className="py-3 px-3">ሁኔታ</th>
                    <th className="py-3 px-3 text-right">መጠን</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-xs sm:text-sm">
                  {deposits.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-semibold text-slate-200 whitespace-nowrap">
                        {d.playerName}
                      </td>
                      <td className="py-3 px-3 font-mono-num text-slate-300 whitespace-nowrap">
                        {d.playerPhone}
                      </td>
                      <td className="py-3 px-3 font-mono-num text-slate-400 whitespace-nowrap">
                        {d.systemPhone}
                      </td>
                      <td className="py-3 px-3 font-mono-num text-amber-300 whitespace-nowrap">
                        {d.txId}
                      </td>
                      <td className="py-3 px-3 text-emerald-400 font-bold whitespace-nowrap">
                        ትክክል ነው
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num font-extrabold text-emerald-400 whitespace-nowrap">
                        +{formatETB(d.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Outgoing Withdrawals Log */}
        {logView === 'withdrawals' && (
          withdrawals.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">
              እስካሁን ምንም የዊዝድሮው ጥያቄ አልተመዘገበም።
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-xs font-bold text-slate-400 border-b border-slate-800">
                    <th className="py-3 px-3">ተጫዋች</th>
                    <th className="py-3 px-3">ወደ ስልክ</th>
                    <th className="py-3 px-3">ከሲስተም ቁጥር</th>
                    <th className="py-3 px-3">ማረጋገጫ</th>
                    <th className="py-3 px-3">ሁኔታ</th>
                    <th className="py-3 px-3 text-right">መጠን</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-xs sm:text-sm">
                  {withdrawals.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-semibold text-slate-200 whitespace-nowrap">
                        {w.playerName}
                      </td>
                      <td className="py-3 px-3 font-mono-num text-slate-300 whitespace-nowrap">
                        {w.playerPhone}
                      </td>
                      <td className="py-3 px-3 font-mono-num text-slate-400 whitespace-nowrap">
                        {w.sourceSystemPhone}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={w.systemVerified ? 'text-emerald-400 font-bold' : 'text-amber-300'}>
                          {w.systemVerified ? 'ትክክል ነው' : 'በመፈተሽ ላይ'}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-bold">
                        {w.status === 'pending' && (
                          <span className="text-amber-400">ፔንዲንግ</span>
                        )}
                        {w.status === 'completed' && (
                          <span className="text-emerald-400">ተከፍሏል</span>
                        )}
                        {w.status === 'rejected' && (
                          <span className="text-rose-400">ተመልሷል</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num font-extrabold text-rose-400 whitespace-nowrap">
                        -{formatETB(w.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    </div>
  );
};
