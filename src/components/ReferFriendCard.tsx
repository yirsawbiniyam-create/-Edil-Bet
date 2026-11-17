import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Gift,
  Link2,
  Share2,
  Users,
} from 'lucide-react';
import { buildReferralLink } from '../lib/firestoreService';
import { useLanguage } from '../lib/i18n';
import { ReferralRecord } from '../types';

interface ReferFriendCardProps {
  referralCode: string | null;
  referrals: ReferralRecord[];
  variant?: 'light' | 'dark';
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const ReferFriendCard: React.FC<ReferFriendCardProps> = ({
  referralCode,
  referrals,
  variant = 'light',
  onNotify,
}) => {
  const { bi } = useLanguage();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const referralLink = useMemo(
    () => (referralCode ? buildReferralLink(referralCode) : ''),
    [referralCode],
  );

  const completedCount = useMemo(
    () => referrals.filter((r) => r.status === 'completed').length,
    [referrals],
  );

  const rewardedCount = useMemo(
    () => referrals.filter((r) => r.rewardStatus === 'paid').length,
    [referrals],
  );

  const copyTextWithFallback = async (value: string): Promise<boolean> => {
    if (!value) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // Fallback below
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopyLink = async () => {
    if (!referralLink) return;
    const ok = await copyTextWithFallback(referralLink);
    if (ok) {
      setCopiedLink(true);
      onNotify(
        bi(
          'የግብዣ ሊንክዎ ወደ ክሊፕቦርድ ኮፒ ተደርጓል! ለጓደኞችዎ ይላኩት።',
          'Your unique referral link has been copied to clipboard!',
        ),
        'success',
      );
      window.setTimeout(() => setCopiedLink(false), 2400);
    } else {
      onNotify(
        bi(`ሊንኩን በእጅዎ ይቅዱት: ${referralLink}`, `Copy link manually: ${referralLink}`),
        'info',
      );
    }
  };

  const handleCopyCode = async () => {
    if (!referralCode) return;
    const ok = await copyTextWithFallback(referralCode);
    if (ok) {
      setCopiedCode(true);
      onNotify(
        bi(`የግብዣ ኮድ (${referralCode}) ኮፒ ተደርጓል!`, `Referral code (${referralCode}) copied!`),
        'success',
      );
      window.setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    if (!referralLink || typeof navigator.share !== 'function') return;
    try {
      await navigator.share({
        title: bi('እድል ቤት · Edil Bet', 'Edil Bet'),
        text: bi(
          `በእድል ቤት ይመዝገቡና ዶሮ ዝላይ፣ እግር ኳስ እና ዳይስ ይጫወቱ! የግብዣ ኮድ: ${referralCode}`,
          `Join me on Edil Bet! Use my referral code ${referralCode}:`,
        ),
        url: referralLink,
      });
    } catch {
      // User dismissed native share sheet
    }
  };

  const isDark = variant === 'dark';

  const cardClass = isDark
    ? 'bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 text-white'
    : 'bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4 text-slate-900';

  const subSurfaceClass = isDark
    ? 'bg-slate-950 border border-slate-800 rounded-2xl p-3.5 sm:p-4'
    : 'bg-slate-50 border border-slate-200 rounded-xl p-3.5';

  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';
  const strongText = isDark ? 'text-white' : 'text-slate-900';

  return (
    <section
      aria-label={bi('ጓደኛ ይጋብዙ', 'Refer a Friend')}
      className={cardClass}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 border-slate-200/80 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isDark
                ? 'bg-emerald-500/15 border border-emerald-500/35 text-emerald-400'
                : 'bg-[#EAF3ED] border border-[#0E8A38]/25 text-[#0E8A38]'
            }`}
          >
            <Users className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h2 className={`text-base sm:text-lg font-black tracking-tight ${strongText}`}>
              {bi('ጓደኛ ይጋብዙ · Refer a Friend', 'Refer a Friend')}
            </h2>
            <p className={`text-xs ${mutedText}`}>
              {bi(
                'የራስዎን ልዩ ሊንክ ኮፒ አድርገው ለጓደኞችዎ ይላኩ፤ የተመዘገቡ ጓደኞች ለቀጣይ የሽልማት ፕሮግራም በራስ-ሰር ይመዘገባሉ።',
                'Copy your unique referral link and share it with friends — successful signups are tracked automatically for rewards.',
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`px-3 py-2 rounded-xl border text-right ${
              isDark
                ? 'bg-slate-950 border-slate-800'
                : 'bg-[#EAF3ED] border-[#0E8A38]/25'
            }`}
          >
            <span className={`text-[10px] font-bold block ${mutedText}`}>
              {bi('የተጋበዙ ጓደኞች', 'Referrals')}
            </span>
            <span
              className={`font-mono-num tabular-nums text-base font-black ${
                isDark ? 'text-emerald-400' : 'text-[#0E8A38]'
              }`}
            >
              {completedCount}
            </span>
          </div>
          <div
            className={`px-3 py-2 rounded-xl border text-right ${
              isDark
                ? 'bg-slate-950 border-slate-800'
                : 'bg-amber-50 border-amber-200'
            }`}
          >
            <span className={`text-[10px] font-bold block ${mutedText}`}>
              {bi('ሽልማት የተከፈለ', 'Rewarded')}
            </span>
            <span
              className={`font-mono-num tabular-nums text-base font-black ${
                isDark ? 'text-amber-400' : 'text-amber-700'
              }`}
            >
              {rewardedCount}
            </span>
          </div>
        </div>
      </div>

      {/* Unique Referral Link & Copy Controls */}
      <div className={`${subSurfaceClass} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`text-xs font-extrabold flex items-center gap-1.5 ${strongText}`}>
            <Link2 className={`w-4 h-4 ${isDark ? 'text-emerald-400' : 'text-[#0E8A38]'}`} />
            <span>{bi('የእርስዎ ልዩ የግብዣ ሊንክ', 'Your Unique Referral Link')}</span>
          </span>

          {referralCode && (
            <button
              type="button"
              onClick={handleCopyCode}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono-num font-black flex items-center gap-1.5 transition cursor-pointer ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-amber-300 hover:border-emerald-500'
                  : 'bg-white border-slate-300 text-slate-900 hover:border-[#0E8A38]'
              }`}
            >
              <span>{bi('ኮድ:', 'Code:')} {referralCode}</span>
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5 opacity-70" />
              )}
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            readOnly
            aria-label={bi('የግብዣ ሊንክ', 'Referral link')}
            value={
              referralLink ||
              bi('የግብዣ ሊንክ በማዘጋጀት ላይ...', 'Preparing your referral link...')
            }
            onFocus={(e) => e.currentTarget.select()}
            className={`flex-1 min-w-0 font-mono-num text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border outline-none ${
              isDark
                ? 'bg-slate-900 border-slate-700 text-slate-100 focus:border-emerald-500'
                : 'bg-white border-slate-300 text-slate-800 focus:border-[#0E8A38]'
            }`}
          />

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!referralLink}
              onClick={handleCopyLink}
              className={`min-h-[44px] flex-1 sm:flex-initial px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                copiedLink
                  ? 'bg-emerald-500 text-slate-950'
                  : isDark
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                    : 'bg-[#0E8A38] hover:bg-[#0B732E] text-white'
              }`}
            >
              {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>
                {copiedLink
                  ? bi('ተቀድቷል!', 'Copied!')
                  : bi('ሊንክ ኮፒ አድርግ', 'Copy Link')}
              </span>
            </button>

            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
              <button
                type="button"
                disabled={!referralLink}
                onClick={handleNativeShare}
                aria-label={bi('ለጓደኛ አጋራ', 'Share link')}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                  isDark
                    ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                    : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
                }`}
              >
                <Share2 className="w-4 h-4" />
                <span className="hidden sm:inline">{bi('አጋራ', 'Share')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tracked Successful Referrals List */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className={`text-xs font-black uppercase tracking-wide ${mutedText}`}>
            {bi('የተመዘገቡ ግብዣዎች (Tracked Referrals)', 'Tracked Referrals')}
          </h3>
          <span className={`text-[11px] font-semibold flex items-center gap-1 ${mutedText}`}>
            <Gift className="w-3.5 h-3.5 text-amber-500" />
            <span>{bi('የሽልማት ሁኔታ በፋየርስቶር ይከታተላል', 'Reward tracking synced in Firestore')}</span>
          </span>
        </div>

        {referrals.length === 0 ? (
          <div className={`${subSurfaceClass} text-center py-4`}>
            <p className={`text-xs font-semibold ${mutedText}`}>
              {bi(
                'ገና በግብዣ ሊንክዎ የተመዘገበ ጓደኛ የለም። ሊንክዎን ኮፒ አድርገው ይጋብዙ!',
                'No friends have signed up with your link yet. Copy and share your link above!',
              )}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200/70 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
            {referrals.slice(0, 10).map((refItem) => {
              const joinedDate = refItem.createdAt?.toDate?.()
                ? refItem.createdAt.toDate().toLocaleDateString()
                : '—';
              return (
                <div
                  key={refItem.id}
                  className={`px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs ${
                    isDark ? 'bg-slate-950/60' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 ${
                        isDark ? 'text-emerald-400' : 'text-[#0E8A38]'
                      }`}
                    />
                    <div className="min-w-0">
                      <span className={`font-bold block truncate ${strongText}`}>
                        {refItem.referredMask}
                      </span>
                      <span className={`text-[11px] font-mono-num ${mutedText}`}>
                        {refItem.referralCode} · {joinedDate}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`text-[11px] font-extrabold inline-flex items-center gap-1 ${
                        refItem.rewardStatus === 'paid'
                          ? 'text-emerald-500'
                          : refItem.rewardStatus === 'eligible'
                            ? 'text-amber-500'
                            : mutedText
                      }`}
                    >
                      {refItem.rewardStatus === 'paid' ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            +{refItem.rewardAmount} {bi('ብር ተከፍሏል', 'ETB Paid')}
                          </span>
                        </>
                      ) : refItem.rewardStatus === 'eligible' ? (
                        <>
                          <Gift className="w-3.5 h-3.5" />
                          <span>{bi('ለሽልማት ዝግጁ', 'Reward Ready')}</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5" />
                          <span>{bi('ተመዝግቧል · Pending Reward', 'Joined · Pending Reward')}</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
