import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FastForward,
  Flame,
  LayoutGrid,
  Lock,
  Play,
  Radio,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Trophy,
  Volume2,
  VolumeX,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  buildFootballSchedule,
  fetchBeSoccerSchedule,
  LEAGUE_OPTIONS,
  LeagueId,
  LeagueTier,
  ScheduledMatch,
  TIER_OPTIONS,
  TIMEFRAME_OPTIONS,
  TimeframeBucket,
} from '../lib/footballSchedule';
import { getMarketLabel } from '../lib/footballMarkets';
import {
  advanceLiveMatchTick,
  CASHOUT_FEE_RATE,
  CASHOUT_MAX_MINUTE,
  CASHOUT_MAX_PAYOUT_RATIO,
  CASHOUT_MIN_AMOUNT,
  CASHOUT_MIN_MINUTE,
  CASHOUT_MIN_STAKE_RATIO,
  checkFootballMarketHit,
  computeFootballCashout,
  DEFAULT_GAME_CONFIG,
  formatETB,
} from '../lib/gameEngine';
import {
  placeLiveFootballTicket,
  settleOrCashoutFootballTicket,
  syncLiveFootballTicketProgress,
} from '../lib/firestoreService';
import { playGameSound } from '../lib/sound';
import { FootballMostBet } from './FootballMostBet';
import { MatchMarketsModal } from './MatchMarketsModal';
import {
  FootballMarketKey,
  FootballPopularityRecord,
  FootballTicket,
  FootballTicketPick,
  GameConfig,
  TelebirrSettings,
  UserWallet,
} from '../types';

type FootballSubTab = 'fixtures' | 'live' | 'rules';

interface SlipPick {
  match: ScheduledMatch;
  market: FootballMarketKey;
  odd: number;
}

interface FootballBettingProps {
  uid: string;
  wallet: UserWallet;
  settings: TelebirrSettings | null;
  gameConfig: GameConfig | null;
  tickets: FootballTicket[];
  popularity: FootballPopularityRecord[];
  soundEnabled: boolean;
  onToggleSound: () => void;
  onGoToDeposit: () => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const QUICK_CARD_MARKETS = new Set<FootballMarketKey>([
  '1',
  'X',
  '2',
  '1X',
  '12',
  'X2',
  'O25',
  'U25',
  'GG',
  'NG',
]);

const TIMEFRAME_ORDER: Exclude<TimeframeBucket, 'all'>[] = [
  'live',
  'hourly',
  'daily',
  'weekly',
  'monthly',
];

const TIMEFRAME_HEADINGS: Record<Exclude<TimeframeBucket, 'all'>, string> = {
  live: 'ላይቭ አሁን · Live In-Play Matches',
  hourly: 'በሰዓት · Next Hours Schedule',
  daily: 'በቀን · Today Full Program',
  weekly: 'በሳምንት · This Week Fixtures',
  monthly: 'በወር · Monthly Marquee Program',
};

interface LiveSimSnapshot {
  minute: number;
  picks: FootballTicketPick[];
}

const TeamBadge: React.FC<{
  code: string;
  logo?: string;
  name: string;
  colorClass: string;
}> = ({ code, logo, name, colorClass }) => {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={`w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-mono-num text-[11px] font-black ${colorClass} shrink-0 overflow-hidden`}
    >
      {logo && !failed ? (
        <img
          src={logo}
          alt={name}
          referrerPolicy="no-referrer"
          className="w-6 h-6 object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        code
      )}
    </span>
  );
};

export const FootballBetting: React.FC<FootballBettingProps> = ({
  uid,
  wallet,
  settings,
  gameConfig,
  tickets,
  popularity,
  soundEnabled,
  onToggleSound,
  onGoToDeposit,
  onNotify,
}) => {
  const [subTab, setSubTab] = useState<FootballSubTab>('fixtures');
  const [timeframeFilter, setTimeframeFilter] = useState<TimeframeBucket>('all');
  const [tierFilter, setTierFilter] = useState<'all' | LeagueTier>('all');
  const [leagueFilter, setLeagueFilter] = useState<LeagueId>('all');

  const [scheduleMatches, setScheduleMatches] = useState<ScheduledMatch[]>(() =>
    buildFootballSchedule(new Date()),
  );
  const [syncingSchedule, setSyncingSchedule] = useState<boolean>(false);
  const [syncedMatchesCount, setSyncedMatchesCount] = useState<number>(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [picks, setPicks] = useState<SlipPick[]>([]);
  const [stakeInput, setStakeInput] = useState<string>('50');
  const [placingTicket, setPlacingTicket] = useState<boolean>(false);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  const [marketsMatchId, setMarketsMatchId] = useState<string | null>(null);

  const [liveSimMap, setLiveSimMap] = useState<Record<string, LiveSimSnapshot>>({});
  const settlingRef = useRef<Set<string>>(new Set());
  const liveSimRef = useRef<Record<string, LiveSimSnapshot>>({});
  liveSimRef.current = liveSimMap;

  const activeConfig = gameConfig ?? DEFAULT_GAME_CONFIG;
  const houseWinRate =
    gameConfig?.houseWinRate ?? settings?.houseWinRate ?? DEFAULT_GAME_CONFIG.houseWinRate;
  const minBet = activeConfig.minBet;
  const maxBet = activeConfig.maxBet;
  const footballOddsScale = activeConfig.footballOddsScale;
  const footballMaxOdds = activeConfig.footballMaxOdds;

  const liveTickets = useMemo(() => tickets.filter((t) => t.status === 'live'), [tickets]);
  const settledTickets = useMemo(() => tickets.filter((t) => t.status !== 'live'), [tickets]);
  const activeModalMatch = useMemo(
    () => (marketsMatchId ? scheduleMatches.find((m) => m.id === marketsMatchId) || null : null),
    [marketsMatchId, scheduleMatches],
  );

  const loadLiveSchedule = async (forceRefresh = false, showToast = false) => {
    setSyncingSchedule(true);
    try {
      const result = await fetchBeSoccerSchedule(forceRefresh);
      setScheduleMatches(result.matches);
      setSyncedMatchesCount(result.syncedCount);
      setLastSyncedAt(result.fetchedAt);
      if (showToast) {
        onNotify(
          `የእግር ኳስ ፕሮግራም ከBeSoccer Sync ታድሷል (${result.syncedCount} አሁናዊ ጨዋታዎች)`,
          'success',
        );
      }
    } catch {
      if (showToast) {
        onNotify('የአሁናዊ ፕሮግራም ማደስ አልተቻለም፤ መደበኛ ፕሮግራም እየታየ ነው።', 'info');
      }
    } finally {
      setSyncingSchedule(false);
    }
  };

  useEffect(() => {
    void loadLiveSchedule(false, false);
    const refreshTimer = window.setInterval(() => {
      void loadLiveSchedule(false, false);
    }, 90_000);
    return () => window.clearInterval(refreshTimer);
  }, []);

  // Real-time board clock for LIVE matches on the fixture board (locks in-play betting at 86'+)
  useEffect(() => {
    const boardTimer = window.setInterval(() => {
      setScheduleMatches((prev) =>
        prev.map((m) => {
          if (!m.isLive) return m;
          const curMin = m.liveMinute ?? 1;
          const nextMin = curMin >= 90 ? 12 : curMin + 1;
          let hg = m.liveHomeGoals ?? 0;
          let ag = m.liveAwayGoals ?? 0;
          let hth = m.liveHtHomeGoals ?? Math.min(hg, Math.floor(hg * 0.6));
          let hta = m.liveHtAwayGoals ?? Math.min(ag, Math.floor(ag * 0.6));
          let hc = m.liveHomeCards ?? Math.min(4, Math.floor(curMin / 28));
          let ac = m.liveAwayCards ?? Math.min(4, Math.floor(curMin / 30));
          let hcr = m.liveHomeCorners ?? Math.max(1, Math.floor(curMin / 14));
          let acr = m.liveAwayCorners ?? Math.max(1, Math.floor(curMin / 16));

          if (curMin >= 90) {
            hg = 0;
            ag = 0;
            hth = 0;
            hta = 0;
            hc = 0;
            ac = 0;
            hcr = 1;
            acr = 1;
          } else {
            if (hg + ag < 5) {
              if (Math.random() < 0.025) {
                hg += 1;
                if (nextMin <= 45) hth += 1;
              }
              if (Math.random() < 0.022 && hg + ag < 5) {
                ag += 1;
                if (nextMin <= 45) hta += 1;
              }
            }
            if (hc + ac < 8 && Math.random() < 0.045) {
              if (Math.random() < 0.5) hc += 1;
              else ac += 1;
            }
            if (hcr + acr < 16 && Math.random() < 0.11) {
              if (Math.random() < 0.52) hcr += 1;
              else acr += 1;
            }
          }
          return {
            ...m,
            liveMinute: nextMin,
            liveHomeGoals: hg,
            liveAwayGoals: ag,
            liveHtHomeGoals: hth,
            liveHtAwayGoals: hta,
            liveHomeCards: hc,
            liveAwayCards: ac,
            liveHomeCorners: hcr,
            liveAwayCorners: acr,
            kickoffLabel: `LIVE · ${nextMin}'`,
          };
        }),
      );
    }, 3500);

    return () => window.clearInterval(boardTimer);
  }, []);

  // Seed local live state whenever new live tickets appear from Firestore
  useEffect(() => {
    setLiveSimMap((prev) => {
      const next = { ...prev };
      let changed = false;
      const activeIds = new Set(liveTickets.map((t) => t.id));

      for (const t of liveTickets) {
        if (!next[t.id]) {
          next[t.id] = {
            minute: Math.max(1, t.currentMinute || 1),
            picks: t.picks.map((p) => ({
              ...p,
              hit: checkFootballMarketHit(p.market, p.homeGoals, p.awayGoals, p),
            })),
          };
          changed = true;
        }
      }

      for (const id of Object.keys(next)) {
        if (!activeIds.has(id)) {
          delete next[id];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [liveTickets]);

  // Live Match Ticker for all active 'live' tickets
  useEffect(() => {
    if (liveTickets.length === 0) return;

    const timer = window.setInterval(() => {
      const updates: Record<string, LiveSimSnapshot> = {};

      for (const ticket of liveTickets) {
        if (settlingRef.current.has(ticket.id)) continue;

        const current = liveSimRef.current[ticket.id] || {
          minute: Math.max(1, ticket.currentMinute || 1),
          picks: ticket.picks,
        };

        if (current.minute >= 90) continue;

        const nextMinute = Math.min(90, current.minute + 2);
        const nextPicks = advanceLiveMatchTick(current.picks, houseWinRate, current.minute);
        const goalScored = nextPicks.some(
          (p, idx) =>
            p.homeGoals !== current.picks[idx]?.homeGoals ||
            p.awayGoals !== current.picks[idx]?.awayGoals,
        );

        updates[ticket.id] = {
          minute: nextMinute,
          picks: nextPicks,
        };

        if (nextMinute >= 90) {
          settlingRef.current.add(ticket.id);
          void settleOrCashoutFootballTicket({
            uid,
            ticket,
            mode: 'full_time',
            picks: nextPicks,
            minute: 90,
          })
            .then((res) => {
              playGameSound(res.status === 'won' ? 'win' : 'lose', soundEnabled);
              onNotify(
                res.status === 'won'
                  ? `የእግር ኳስ ትኬት አሸነፈ! +${formatETB(res.payout)}`
                  : `ትኬቱ በ90' ተጠናቋል (-${formatETB(ticket.betAmount)})`,
                res.status === 'won' ? 'success' : 'info',
              );
            })
            .catch((err) => {
              settlingRef.current.delete(ticket.id);
              console.error(err);
            });
        } else if (goalScored || nextMinute % 6 === 1 || nextMinute === 5 || nextMinute === 81) {
          const quote = computeFootballCashout(
            nextPicks,
            ticket.betAmount,
            ticket.potentialPayout,
            nextMinute,
          );
          const scoreSummary = nextPicks
            .map((p) => `${p.homeCode} ${p.homeGoals}-${p.awayGoals} ${p.awayCode}`)
            .join(' | ');
          void syncLiveFootballTicketProgress({
            ticketId: ticket.id,
            picks: nextPicks,
            currentMinute: nextMinute,
            cashoutOffer: quote.offer,
            cashoutEligible: quote.eligible,
            resultText: `${nextMinute}' · ${scoreSummary}`,
          });
        }
      }

      if (Object.keys(updates).length > 0) {
        setLiveSimMap((prev) => ({ ...prev, ...updates }));
      }
    }, 750);

    return () => window.clearInterval(timer);
  }, [liveTickets, houseWinRate, uid, soundEnabled, onNotify]);

  const getScaledOdd = (baseOdd: number) =>
    Math.max(1.02, Number((baseOdd * footballOddsScale).toFixed(2)));

  const timeframeCounts = useMemo(() => {
    const counts: Record<TimeframeBucket, number> = {
      all: scheduleMatches.length,
      live: 0,
      hourly: 0,
      daily: 0,
      weekly: 0,
      monthly: 0,
    };
    for (const m of scheduleMatches) {
      counts[m.timeframe] += 1;
    }
    return counts;
  }, [scheduleMatches]);

  const filteredMatches = useMemo(() => {
    return scheduleMatches.filter((m) => {
      if (timeframeFilter !== 'all' && m.timeframe !== timeframeFilter) return false;
      if (tierFilter !== 'all' && m.tier !== tierFilter) return false;
      if (leagueFilter !== 'all' && m.league !== leagueFilter) return false;
      return true;
    });
  }, [scheduleMatches, timeframeFilter, tierFilter, leagueFilter]);

  const groupedMatches = useMemo(() => {
    const buckets: Record<Exclude<TimeframeBucket, 'all'>, ScheduledMatch[]> = {
      live: [],
      hourly: [],
      daily: [],
      weekly: [],
      monthly: [],
    };
    for (const m of filteredMatches) {
      buckets[m.timeframe].push(m);
    }
    return TIMEFRAME_ORDER.map((tf) => ({
      timeframe: tf,
      heading: TIMEFRAME_HEADINGS[tf],
      matches: buckets[tf],
    })).filter((g) => g.matches.length > 0);
  }, [filteredMatches]);

  const syncedPicks = useMemo(
    () =>
      picks.map((p) => {
        const latestMatch = scheduleMatches.find((m) => m.id === p.match.id) || p.match;
        return {
          ...p,
          match: latestMatch,
          odd: getScaledOdd(latestMatch.odds[p.market]),
        };
      }),
    [picks, scheduleMatches, footballOddsScale],
  );

  const totalOdds = useMemo(() => {
    if (syncedPicks.length === 0) return 0;
    const raw = syncedPicks.reduce((acc, p) => acc * p.odd, 1);
    return Math.min(footballMaxOdds, Number(raw.toFixed(2)));
  }, [syncedPicks, footballMaxOdds]);

  const selectedPicksByMatch = useMemo(() => {
    const map: Record<string, FootballMarketKey> = {};
    for (const p of picks) {
      map[p.match.id] = p.market;
    }
    return map;
  }, [picks]);

  const numericStake = Math.max(0, parseFloat(stakeInput) || 0);
  const potentialPayout = Number((numericStake * totalOdds).toFixed(2));

  const togglePick = (match: ScheduledMatch, market: FootballMarketKey) => {
    if (placingTicket) return;
    if (match.isLive && (match.liveMinute ?? 0) >= 86) {
      onNotify("በቤቲንግ ህግ መሰረት ከ 85' በኋላ ላይቭ ውርርድ ይዘጋል።", 'error');
      return;
    }

    playGameSound('click', soundEnabled);

    setPicks((prev) => {
      const existing = prev.find((p) => p.match.id === match.id);
      if (existing && existing.market === market) {
        return prev.filter((p) => p.match.id !== match.id);
      }
      const nextPick: SlipPick = {
        match,
        market,
        odd: getScaledOdd(match.odds[market]),
      };
      if (existing) {
        return prev.map((p) => (p.match.id === match.id ? nextPick : p));
      }
      if (prev.length >= 8) {
        onNotify('በአንድ ትኬት እስከ 8 ጨዋታዎች ብቻ መምረጥ ይችላሉ።', 'info');
        return prev;
      }
      return [...prev, nextPick];
    });
  };

  const handlePlaceTicket = async () => {
    if (placingTicket) return;
    if (syncedPicks.length === 0) {
      onNotify('እባክዎ ቢያንስ 1 የእግር ኳስ ጨዋታ ከዝርዝሩ ይምረጡ።', 'error');
      return;
    }
    const lockedPick = syncedPicks.find(
      (p) => p.match.isLive && (p.match.liveMinute ?? 0) >= 86,
    );
    if (lockedPick) {
      onNotify(
        `${lockedPick.match.home} vs ${lockedPick.match.away} ከ 85' ስላለፈ ላይቭ ውርርዱ ተዘግቷል። እባክዎ ከትኬቱ ያውጡት።`,
        'error',
      );
      return;
    }
    if (!Number.isFinite(numericStake) || numericStake < minBet) {
      onNotify(`ዝቅተኛው የጠረጴዛ መወራረጃ መጠን ${minBet} ብር ነው።`, 'error');
      return;
    }
    if (numericStake > maxBet) {
      onNotify(`ከፍተኛው የጠረጴዛ መወራረጃ ገደብ ${maxBet.toLocaleString()} ብር ነው።`, 'error');
      return;
    }
    if (wallet.balance < numericStake) {
      onNotify('በቂ ቀሪ ሂሳብ የለዎትም! እባክዎ በቴሌብር ዲፖሲት ያድርጉ።', 'error');
      return;
    }

    const livePicksMinutes = syncedPicks
      .filter((p) => p.match.isLive && typeof p.match.liveMinute === 'number')
      .map((p) => p.match.liveMinute as number);
    const startMinute =
      livePicksMinutes.length > 0 ? Math.min(85, Math.min(...livePicksMinutes)) : 1;

    const ticketPicks: FootballTicketPick[] = syncedPicks.map((p) => {
      const hg = p.match.isLive ? (p.match.liveHomeGoals ?? 0) : 0;
      const ag = p.match.isLive ? (p.match.liveAwayGoals ?? 0) : 0;
      const hth = p.match.isLive
        ? (p.match.liveHtHomeGoals ?? Math.min(hg, Math.floor(hg * 0.6)))
        : 0;
      const hta = p.match.isLive
        ? (p.match.liveHtAwayGoals ?? Math.min(ag, Math.floor(ag * 0.6)))
        : 0;
      const hCards = p.match.isLive ? (p.match.liveHomeCards ?? 0) : 0;
      const aCards = p.match.isLive ? (p.match.liveAwayCards ?? 0) : 0;
      const hCorners = p.match.isLive ? (p.match.liveHomeCorners ?? 0) : 0;
      const aCorners = p.match.isLive ? (p.match.liveAwayCorners ?? 0) : 0;

      return {
        matchId: p.match.id,
        home: p.match.home,
        away: p.match.away,
        homeCode: p.match.homeCode,
        awayCode: p.match.awayCode,
        market: p.market,
        marketLabel: getMarketLabel(p.market),
        odd: p.odd,
        homeGoals: hg,
        awayGoals: ag,
        htHomeGoals: hth,
        htAwayGoals: hta,
        homeCards: hCards,
        awayCards: aCards,
        homeCorners: hCorners,
        awayCorners: aCorners,
        homeRedCards: 0,
        awayRedCards: 0,
        hit: checkFootballMarketHit(p.market, hg, ag, {
          htHomeGoals: hth,
          htAwayGoals: hta,
          homeCards: hCards,
          awayCards: aCards,
          homeCorners: hCorners,
          awayCorners: aCorners,
          homeRedCards: 0,
          awayRedCards: 0,
        }),
      };
    });

    const choiceText = syncedPicks
      .map((p) => `${p.match.homeCode}-${p.match.awayCode}:${getMarketLabel(p.market)}(${p.odd})`)
      .join(', ')
      .slice(0, 200);

    setPlacingTicket(true);
    playGameSound('roll', soundEnabled);

    const leagueLabelsByMatch = Object.fromEntries(
      syncedPicks.map((p) => [p.match.id, p.match.leagueLabel]),
    );

    try {
      await placeLiveFootballTicket({
        uid,
        wallet,
        betAmount: numericStake,
        totalOdds,
        picks: ticketPicks,
        choiceText,
        initialMinute: startMinute,
        leagueLabelsByMatch,
        gameConfig,
      });

      setPicks([]);
      setSubTab('live');
      onNotify('ትኬቱ ተቆርጧል! ወደ ላይቭ ጨዋታ እና ካሽአውት ገብተዋል።', 'success');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'የእግር ኳስ ትኬቱን መቁረጥ አልተቻለም።',
        'error',
      );
    } finally {
      setPlacingTicket(false);
    }
  };

  const handleCashout = async (ticket: FootballTicket) => {
    if (busyTicketId === ticket.id || settlingRef.current.has(ticket.id)) return;
    const snap = liveSimMap[ticket.id] || {
      minute: ticket.currentMinute,
      picks: ticket.picks,
    };

    const quote = computeFootballCashout(
      snap.picks,
      ticket.betAmount,
      ticket.potentialPayout,
      snap.minute,
    );

    if (!quote.eligible) {
      onNotify(quote.reason, 'error');
      return;
    }

    setBusyTicketId(ticket.id);
    settlingRef.current.add(ticket.id);

    try {
      const res = await settleOrCashoutFootballTicket({
        uid,
        ticket,
        mode: 'cashout',
        picks: snap.picks,
        minute: snap.minute,
      });
      playGameSound('win', soundEnabled);
      onNotify(
        `ካሽአውት ተሳክቷል! ${formatETB(res.payout)} ወደ ቦርሳዎ ገብቷል።`,
        'success',
      );
    } catch (err) {
      settlingRef.current.delete(ticket.id);
      onNotify(
        err instanceof Error ? err.message : 'ካሽአውት ማድረግ አልተቻለም።',
        'error',
      );
    } finally {
      setBusyTicketId(null);
    }
  };

  const handleFastForwardToFullTime = async (ticket: FootballTicket) => {
    if (busyTicketId === ticket.id || settlingRef.current.has(ticket.id)) return;
    const snap = liveSimMap[ticket.id] || {
      minute: ticket.currentMinute,
      picks: ticket.picks,
    };

    let simPicks = snap.picks;
    const remainingTicks = Math.max(1, Math.ceil((90 - snap.minute) / 3));
    for (let i = 0; i < remainingTicks; i++) {
      const simMinute = Math.min(90, snap.minute + i * 3);
      simPicks = advanceLiveMatchTick(simPicks, houseWinRate, simMinute);
    }

    setBusyTicketId(ticket.id);
    settlingRef.current.add(ticket.id);
    setLiveSimMap((prev) => ({
      ...prev,
      [ticket.id]: { minute: 90, picks: simPicks },
    }));

    try {
      const res = await settleOrCashoutFootballTicket({
        uid,
        ticket,
        mode: 'full_time',
        picks: simPicks,
        minute: 90,
      });
      playGameSound(res.status === 'won' ? 'win' : 'lose', soundEnabled);
      onNotify(
        res.status === 'won'
          ? `ጨዋታው 90' ተጠናቆ ${formatETB(res.payout)} አሸንፈዋል!`
          : `ጨዋታው በ90' ተጠናቋል (-${formatETB(ticket.betAmount)})`,
        res.status === 'won' ? 'success' : 'info',
      );
    } catch (err) {
      settlingRef.current.delete(ticket.id);
      onNotify(
        err instanceof Error ? err.message : 'ጨዋታውን ማጠናቀቅ አልተቻለም።',
        'error',
      );
    } finally {
      setBusyTicketId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Zero-balance banner */}
      {wallet.balance < 1 && (
        <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-amber-400">
              ለእግር ኳስ ቤቲንግ መጀመሪያ በቴሌብር ዲፖሲት ያድርጉ
            </h3>
            <p className="text-sm text-slate-300">
              ቀሪ ሂሳብዎ 0.00 ብር ነው። ዝቅተኛው 100 ብር በቴሌብር ዲፖሲት አድርገው መወራረድ ይችላሉ።
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToDeposit}
            className="shrink-0 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
          >
            <Wallet className="w-4 h-4" />
            <span>አሁን ዲፖሲት አድርግ</span>
          </button>
        </div>
      )}

      {/* Header & Sub-View Navigation */}
      <section className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                የእግር ኳስ ቤቲንግ · Football Schedule &amp; Live
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                ከBeSoccer ጋር የተገናኘ አሁናዊ ላይቭ፣ በሰዓት፣ በቀን፣ በሳምንት እና በወር ፕሮግራም
                {syncedMatchesCount > 0 && (
                  <span className="font-mono-num text-emerald-400">
                    {' '}
                    · {syncedMatchesCount} አሁናዊ ጨዋታ
                    {lastSyncedAt
                      ? ` (${new Date(lastSyncedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})`
                      : ''}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={syncingSchedule}
              onClick={() => {
                playGameSound('click', soundEnabled);
                void loadLiveSchedule(true, true);
              }}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-emerald-400 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingSchedule ? 'animate-spin' : ''}`} />
              <span>{syncingSchedule ? 'በማደስ ላይ...' : 'ፕሮግራም አድስ'}</span>
            </button>

            <a
              href="https://www.besoccer.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1.5 transition whitespace-nowrap"
            >
              <span>BeSoccer</span>
              <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
            </a>

            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'ድምጽ አጥፋ' : 'ድምጽ አብራ'}
              className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-200 transition cursor-pointer"
            >
              {soundEnabled ? (
                <Volume2 className="w-5 h-5 text-amber-400" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-500" />
              )}
            </button>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div
          role="tablist"
          aria-label="የእግር ኳስ ቤቲንግ ክፍሎች"
          className="grid grid-cols-3 gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'fixtures'}
            onClick={() => {
              playGameSound('click', soundEnabled);
              setSubTab('fixtures');
            }}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              subTab === 'fixtures'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <CalendarClock className="w-4 h-4 shrink-0" />
            <span>ፕሮግራም ({scheduleMatches.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'live'}
            onClick={() => {
              playGameSound('click', soundEnabled);
              setSubTab('live');
            }}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              subTab === 'live'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Radio className="w-4 h-4 shrink-0" />
            <span>ላይቭ &amp; ካሽአውት ({liveTickets.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'rules'}
            onClick={() => {
              playGameSound('click', soundEnabled);
              setSubTab('rules');
            }}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              subTab === 'rules'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>የጨዋታ እና ካሽአውት ህግ</span>
          </button>
        </div>

        {/* Timeframe + Tier + League Filters (Fixtures Tab) */}
        {subTab === 'fixtures' && (
          <div className="space-y-3 pt-1">
            {/* Timeframe Program Strip (Live, Hourly, Daily, Weekly, Monthly) */}
            <div className="flex flex-wrap items-center gap-1.5">
              {TIMEFRAME_OPTIONS.map((tf) => (
                <button
                  key={tf.id}
                  type="button"
                  onClick={() => {
                    playGameSound('click', soundEnabled);
                    setTimeframeFilter(tf.id);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    timeframeFilter === tf.id
                      ? tf.id === 'live'
                        ? 'bg-rose-500 text-white'
                        : 'bg-amber-500 text-slate-950'
                      : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span>{tf.label}</span>
                  <span className="font-mono-num opacity-80">({timeframeCounts[tf.id]})</span>
                </button>
              ))}
            </div>

            {/* Tier Filter (በደረጃ) */}
            <div className="flex flex-wrap items-center gap-1.5">
              {TIER_OPTIONS.map((tier) => (
                <button
                  key={String(tier.id)}
                  type="button"
                  onClick={() => {
                    playGameSound('click', soundEnabled);
                    setTierFilter(tier.id);
                    if (
                      tier.id !== 'all' &&
                      leagueFilter !== 'all' &&
                      LEAGUE_OPTIONS.find((l) => l.id === leagueFilter)?.tier !== tier.id
                    ) {
                      setLeagueFilter('all');
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                    tierFilter === tier.id
                      ? 'bg-emerald-500/20 border border-emerald-500 text-emerald-300'
                      : 'bg-slate-950/70 border border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tier.label}
                </button>
              ))}
            </div>

            {/* League Filter */}
            <div className="flex flex-wrap items-center gap-1.5">
              {LEAGUE_OPTIONS.filter(
                (l) => l.id === 'all' || tierFilter === 'all' || l.tier === tierFilter,
              ).map((league) => (
                <button
                  key={league.id}
                  type="button"
                  onClick={() => {
                    playGameSound('click', soundEnabled);
                    setLeagueFilter(league.id);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                    leagueFilter === league.id
                      ? 'bg-emerald-500 text-slate-950 font-extrabold'
                      : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {league.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* TAB 1: FIXTURES & BET SLIP */}
      {subTab === 'fixtures' && (
        <div className="space-y-6">
          <FootballMostBet
            matches={scheduleMatches}
            popularity={popularity}
            selectedPicksByMatch={selectedPicksByMatch}
            disabled={placingTicket}
            onQuickPick={togglePick}
          />

          <div className="grid lg:grid-cols-12 gap-5 items-start">
            {/* Left: Hierarchical Match Program */}
            <div className="lg:col-span-7 space-y-6">
            {groupedMatches.length === 0 ? (
              <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
                <p className="text-sm font-bold text-white">በዚህ ማጣሪያ ውስጥ ጨዋታ አልተገኘም</p>
                <button
                  type="button"
                  onClick={() => {
                    setTimeframeFilter('all');
                    setTierFilter('all');
                    setLeagueFilter('all');
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black cursor-pointer"
                >
                  ሁሉንም ጨዋታዎች አሳይ
                </button>
              </div>
            ) : (
              groupedMatches.map((group) => (
                <div key={group.timeframe} className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                      {group.timeframe === 'live' && (
                        <Radio className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span>{group.heading}</span>
                    </h3>
                    <span className="font-mono-num text-xs font-bold text-slate-400">
                      {group.matches.length} ጨዋታ
                    </span>
                  </div>

                  <div className="space-y-3">
                    {group.matches.map((match) => {
                      const selectedPick = picks.find((p) => p.match.id === match.id);
                      const isLiveLocked = match.isLive && (match.liveMinute ?? 0) >= 86;

                      return (
                        <div
                          key={match.id}
                          className={`bg-slate-900/95 border rounded-2xl p-4 space-y-3 transition ${
                            selectedPick
                              ? 'border-emerald-500/70'
                              : match.isLive
                                ? 'border-rose-500/35 hover:border-rose-500/60'
                                : 'border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {/* Match Top Meta (Zero-pill inline typography) */}
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                              {match.featured && <Flame className="w-3.5 h-3.5 text-amber-400" />}
                              <span>{match.tierLabel}</span>
                              <span aria-hidden="true" className="text-slate-600">
                                ·
                              </span>
                              <span>{match.leagueLabel}</span>
                              {match.besoccerUrl && (
                                <>
                                  <span aria-hidden="true" className="text-slate-600">
                                    ·
                                  </span>
                                  <a
                                    href={match.besoccerUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-slate-400 hover:text-amber-400 inline-flex items-center gap-0.5 transition"
                                  >
                                    <span>BeSoccer</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </>
                              )}
                            </span>
                            <span
                              className={`font-mono-num font-bold ${
                                match.isLive ? 'text-rose-400' : 'text-slate-400'
                              }`}
                            >
                              {isLiveLocked ? `LIVE · ${match.liveMinute}' (ተዘግቷል)` : match.kickoffLabel}
                            </span>
                          </div>

                          {/* Teams Row with Live Score if LIVE */}
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <TeamBadge
                                code={match.homeCode}
                                logo={match.homeLogo}
                                name={match.home}
                                colorClass="text-amber-400"
                              />
                              <span className="font-extrabold text-sm sm:text-base text-white truncate">
                                {match.home}
                              </span>
                            </div>

                            {match.isLive ? (
                              <span className="font-mono-num text-base font-black text-white bg-slate-950 border border-rose-500/40 px-3 py-1 rounded-xl shrink-0">
                                {match.liveHomeGoals ?? 0} - {match.liveAwayGoals ?? 0}
                              </span>
                            ) : (
                              <span className="text-xs font-black text-slate-500 shrink-0">VS</span>
                            )}

                            <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end">
                              <span className="font-extrabold text-sm sm:text-base text-white truncate text-right">
                                {match.away}
                              </span>
                              <TeamBadge
                                code={match.awayCode}
                                logo={match.awayLogo}
                                name={match.away}
                                colorClass="text-emerald-400"
                              />
                            </div>
                          </div>

                          {/* 1 X 2 Row */}
                          <div className="grid grid-cols-3 gap-2">
                            {(['1', 'X', '2'] as const).map((mkt) => {
                              const active = selectedPick?.market === mkt;
                              return (
                                <button
                                  key={mkt}
                                  type="button"
                                  disabled={placingTicket || isLiveLocked}
                                  onClick={() => togglePick(match, mkt)}
                                  className={`py-2 px-2.5 rounded-xl border text-xs flex items-center justify-between transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                                    active
                                      ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-black'
                                      : 'bg-slate-950 border-slate-800 hover:border-slate-600 text-slate-200 font-bold'
                                  }`}
                                >
                                  <span>{mkt}</span>
                                  <span
                                    className={`font-mono-num ${active ? 'text-slate-950' : 'text-amber-400'}`}
                                  >
                                    {getScaledOdd(match.odds[mkt]).toFixed(2)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Double Chance (1X, 12, X2) Row */}
                          <div className="grid grid-cols-3 gap-2">
                            {(['1X', '12', 'X2'] as const).map((mkt) => {
                              const active = selectedPick?.market === mkt;
                              return (
                                <button
                                  key={mkt}
                                  type="button"
                                  disabled={placingTicket || isLiveLocked}
                                  onClick={() => togglePick(match, mkt)}
                                  className={`py-1.5 px-2.5 rounded-lg border text-[11px] flex items-center justify-between transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                                    active
                                      ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-black'
                                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-600 text-slate-300 font-semibold'
                                  }`}
                                >
                                  <span>{mkt}</span>
                                  <span
                                    className={`font-mono-num ${active ? 'text-slate-950' : 'text-amber-400'}`}
                                  >
                                    {getScaledOdd(match.odds[mkt]).toFixed(2)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Goals / BTTS Row */}
                          <div className="grid grid-cols-4 gap-1.5">
                            {(
                              [
                                ['O25', 'O 2.5'],
                                ['U25', 'U 2.5'],
                                ['GG', 'GG'],
                                ['NG', 'NG'],
                              ] as const
                            ).map(([mkt, shortLabel]) => {
                              const active = selectedPick?.market === mkt;
                              return (
                                <button
                                  key={mkt}
                                  type="button"
                                  disabled={placingTicket || isLiveLocked}
                                  onClick={() => togglePick(match, mkt)}
                                  className={`py-1.5 px-2 rounded-lg border text-[11px] flex items-center justify-between transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                                    active
                                      ? 'bg-amber-500 border-amber-400 text-slate-950 font-black'
                                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-600 text-slate-300 font-semibold'
                                  }`}
                                >
                                  <span>{shortLabel}</span>
                                  <span
                                    className={`font-mono-num ${active ? 'text-slate-950' : 'text-emerald-400'}`}
                                  >
                                    {getScaledOdd(match.odds[mkt]).toFixed(2)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Extended Market Selection Indicator (if chosen from All Markets Modal) */}
                          {selectedPick && !QUICK_CARD_MARKETS.has(selectedPick.market) && (
                            <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs">
                              <span className="font-bold text-emerald-300 truncate">
                                የተመረጠ ገበያ: {getMarketLabel(selectedPick.market)}
                              </span>
                              <span className="font-mono-num font-black text-amber-400 shrink-0">
                                {getScaledOdd(match.odds[selectedPick.market]).toFixed(2)}x
                              </span>
                            </div>
                          )}

                          {/* Open All 130+ Markets Modal Button */}
                          <button
                            type="button"
                            disabled={placingTicket || isLiveLocked}
                            onClick={() => {
                              playGameSound('click', soundEnabled);
                              setMarketsMatchId(match.id);
                            }}
                            className="w-full py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 text-xs font-bold text-slate-200 flex items-center justify-between gap-2 transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                          >
                            <span className="flex items-center gap-2 text-amber-400">
                              <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                              <span>ሁሉም የአቆማመር ገበያዎች (130+ Markets)</span>
                            </span>
                            <span className="flex items-center gap-1 text-[11px] text-slate-400">
                              <span>1st Half · Multigoals · Cards · Score</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Right: Bet Slip */}
          <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-24">
            <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-extrabold text-white">
                    የእግር ኳስ ትኬት ({picks.length}/8)
                  </h3>
                </div>
                {picks.length > 0 && !placingTicket && (
                  <button
                    type="button"
                    onClick={() => setPicks([])}
                    className="text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>አጽዳ</span>
                  </button>
                )}
              </div>

              {syncedPicks.length === 0 ? (
                <div className="py-8 text-center text-xs sm:text-sm text-slate-400 space-y-1">
                  <p className="font-bold text-slate-300">ትኬትዎ ባዶ ነው</p>
                  <p>ከግራ በኩል ካሉት ጨዋታዎች 1, X, 2, 1X, 12, X2, Over/Under ወይም GG ይምረጡ</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {syncedPicks.map((pick) => (
                    <div
                      key={pick.match.id}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {pick.match.home} vs {pick.match.away}
                        </p>
                        <p className="text-[11px] text-emerald-400 font-semibold mt-0.5">
                          {pick.match.isLive
                            ? `LIVE ${pick.match.liveMinute}' (${pick.match.liveHomeGoals}-${pick.match.liveAwayGoals}) · `
                            : ''}
                          ምርጫ: {getMarketLabel(pick.market)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono-num text-sm font-black text-amber-400">
                          {pick.odd.toFixed(2)}x
                        </span>
                        {!placingTicket && (
                          <button
                            type="button"
                            onClick={() => togglePick(pick.match, pick.market)}
                            className="text-slate-500 hover:text-rose-400 cursor-pointer"
                            title="አስወግድ"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Odds & Stake Summary */}
              <div className="pt-3 border-t border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-bold">ጠቅላላ ኦድ (ከፍተኛ {footballMaxOdds}x)</span>
                  <span className="font-mono-num text-base font-black text-amber-400">
                    {totalOdds > 0 ? `${totalOdds.toFixed(2)}x` : '0.00x'}
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="footballStake" className="text-xs font-bold text-slate-400">
                      የመወራረጃ መጠን (በብር)
                    </label>
                    <span className="text-[11px] font-mono-num text-slate-500">
                      ገደብ: {minBet.toLocaleString()} – {maxBet.toLocaleString()} ብር
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      id="footballStake"
                      type="number"
                      min={minBet}
                      max={maxBet}
                      step={1}
                      value={stakeInput}
                      disabled={placingTicket}
                      onChange={(e) => setStakeInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-lg font-mono-num font-black text-white outline-none pr-12"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      ብር
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {[25, 50, 100, 250].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={placingTicket}
                      onClick={() => {
                        playGameSound('click', soundEnabled);
                        setStakeInput(String(preset));
                      }}
                      className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono-num font-bold text-slate-200 cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={placingTicket}
                    onClick={() => {
                      playGameSound('click', soundEnabled);
                      setStakeInput(String(Math.floor(wallet.balance)));
                    }}
                    className="py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold text-amber-400 cursor-pointer"
                  >
                    ሁሉም
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5">
                  <span className="text-slate-400 font-bold">ሊያሸንፉ የሚችሉት (90&apos; FT)</span>
                  <span className="font-mono-num text-sm font-black text-emerald-400">
                    {formatETB(potentialPayout)}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={placingTicket || picks.length === 0}
                  onClick={handlePlaceTicket}
                  className="w-full py-3.5 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black text-sm sm:text-base flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {placingTicket
                      ? 'ትኬት በመቁረጥ ላይ...'
                      : `ትኬት ቁረጥ እና ላይቭ ግባ (${numericStake} ብር)`}
                  </span>
                </button>

                {liveTickets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSubTab('live')}
                    className="w-full py-2.5 px-4 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Radio className="w-4 h-4" />
                    <span>{liveTickets.length} ላይቭ ትኬት አለዎት — ወደ ካሽአውት ይግቡ</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* TAB 2: LIVE MATCH & CASHOUT CENTER */}
      {subTab === 'live' && (
        <div className="space-y-5">
          {/* Compact Cashout Rule Notice Bar */}
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-300">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                የካሽአውት ህግ: ከ <strong className="font-mono-num text-white">{CASHOUT_MIN_MINUTE}&apos;</strong> እስከ{' '}
                <strong className="font-mono-num text-white">{CASHOUT_MAX_MINUTE}&apos;</strong> ደቂቃ ክፍት ·{' '}
                <strong className="font-mono-num text-amber-400">{Math.round(CASHOUT_FEE_RATE * 100)}%</strong> የካሽአውት ክፍያ · ከፍተኛ{' '}
                <strong className="font-mono-num text-emerald-400">{Math.round(CASHOUT_MAX_PAYOUT_RATIO * 100)}%</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSubTab('rules')}
              className="text-xs font-bold text-amber-400 hover:text-amber-300 underline cursor-pointer whitespace-nowrap"
            >
              ሙሉ የጨዋታ እና ካሽአውት ህግ አንብብ
            </button>
          </div>

          {liveTickets.length === 0 ? (
            <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-8 text-center space-y-3">
              <p className="text-base font-extrabold text-white">አሁን ላይቭ እየተጫወተ ያለ ትኬት የለም</p>
              <p className="text-xs sm:text-sm text-slate-400">
                ከጨዋታዎች ዝርዝር ትኬት ሲቆርጡ ወዲያውኑ እዚህ ላይቭ ገብተው የቀጥታ ውጤትና ካሽአውት ማድረግ ይችላሉ።
              </p>
              <button
                type="button"
                onClick={() => setSubTab('fixtures')}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm transition cursor-pointer"
              >
                ወደ ጨዋታዎች ፕሮግራም ተመለስ
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {liveTickets.map((ticket) => {
                const snap = liveSimMap[ticket.id] || {
                  minute: Math.max(1, ticket.currentMinute || 1),
                  picks: ticket.picks,
                };
                const quote = computeFootballCashout(
                  snap.picks,
                  ticket.betAmount,
                  ticket.potentialPayout,
                  snap.minute,
                );
                const isBusy = busyTicketId === ticket.id;
                const hitsCount = snap.picks.filter((p) => p.hit).length;

                return (
                  <article
                    key={ticket.id}
                    className="bg-slate-900/95 border border-amber-500/40 rounded-3xl p-5 sm:p-6 space-y-4"
                  >
                    {/* Ticket Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className="font-black text-emerald-400">LIVE</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-num font-bold text-white">
                            {snap.minute}&apos; / 90&apos;
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {hitsCount}/{snap.picks.length} በማሸነፍ ላይ
                          </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-black text-white">
                          ትኬት #{ticket.id.slice(-6).toUpperCase()} · {ticket.picksCount} ጨዋታ
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs">
                        <div>
                          <span className="text-slate-400 block">የተወራረዱት</span>
                          <span className="font-mono-num font-black text-white">
                            {formatETB(ticket.betAmount)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">ጠቅላላ ኦድ</span>
                          <span className="font-mono-num font-black text-amber-400">
                            {ticket.totalOdds.toFixed(2)}x
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">ሙሉ 90&apos; ሽልማት</span>
                          <span className="font-mono-num font-black text-emerald-400">
                            {formatETB(ticket.potentialPayout)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Minute Progress Bar with 5'-80' Cashout Zone Marker */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono-num text-slate-400">
                        <span>0&apos; Kickoff</span>
                        <span className="text-amber-400 font-bold">
                          ካሽአውት መስኮት ({CASHOUT_MIN_MINUTE}&apos; – {CASHOUT_MAX_MINUTE}&apos;)
                        </span>
                        <span>90&apos; FT</span>
                      </div>
                      <div className="relative w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.round((snap.minute / 90) * 100))}%` }}
                        />
                      </div>
                    </div>

                    {/* Live Legs List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {snap.picks.map((leg) => (
                        <div
                          key={leg.matchId}
                          className={`bg-slate-950 border rounded-2xl p-3 flex items-center justify-between gap-3 ${
                            leg.hit ? 'border-emerald-500/40' : 'border-slate-800'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-bold text-white truncate">
                              {leg.home} vs {leg.away}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              ምርጫ:{' '}
                              <strong className="text-amber-300">
                                {leg.marketLabel || getMarketLabel(leg.market)}
                              </strong>{' '}
                              <span className="font-mono-num">({leg.odd.toFixed(2)}x)</span>
                            </p>
                            <p className="text-[11px] font-mono-num text-slate-500 mt-0.5">
                              HT {leg.htHomeGoals ?? 0}-{leg.htAwayGoals ?? 0} · ካርድ{' '}
                              {(leg.homeCards ?? 0) + (leg.awayCards ?? 0)} · ኮርነር{' '}
                              {(leg.homeCorners ?? 0) + (leg.awayCorners ?? 0)}
                            </p>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="font-mono-num text-base font-black text-white bg-slate-800 px-2.5 py-1 rounded-lg">
                              {leg.homeGoals} - {leg.awayGoals}
                            </span>
                            {leg.hit ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                            ) : (
                              <Clock className="w-5 h-5 text-slate-500 shrink-0" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Cashout Action Bar */}
                    <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                          {quote.eligible ? (
                            <Banknote className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                          )}
                          <span>{quote.reason}</span>
                        </p>
                        {quote.eligible && (
                          <p className="text-[11px] text-slate-400 font-mono-num">
                            12% የካሽአውት ክፍያ ተቀንሶ ወዲያውኑ ወደ ቦርሳዎ የሚገባ: {formatETB(quote.offer)}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          disabled={!quote.eligible || isBusy}
                          onClick={() => handleCashout(ticket)}
                          className={`px-4 py-2.5 min-h-[42px] rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
                            quote.eligible
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <Banknote className="w-4 h-4 shrink-0" />
                          <span>
                            {isBusy
                              ? 'በመፈጸም ላይ...'
                              : quote.eligible
                                ? `ካሽአውት ውሰድ (${formatETB(quote.offer)})`
                                : 'ካሽአውት ተዘግቷል'}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleFastForwardToFullTime(ticket)}
                          className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                        >
                          <FastForward className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>90&apos; ጨርስ</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Recent Settled / Cashed-Out Tickets */}
          {settledTickets.length > 0 && (
            <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 space-y-3.5">
              <h3 className="text-sm sm:text-base font-extrabold text-white">
                የቅርብ ጊዜ የተዘጉ እና ካሽአውት የተደረጉ ትኬቶች ({settledTickets.length})
              </h3>
              <div className="space-y-2.5">
                {settledTickets.slice(0, 8).map((t) => {
                  const isCashedOut = t.status === 'cashed_out';
                  const isWon = t.status === 'won';
                  return (
                    <div
                      key={t.id}
                      className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {isCashedOut ? (
                            <span className="font-black text-amber-400">ካሽአውት ({t.currentMinute}&apos;)</span>
                          ) : isWon ? (
                            <span className="font-black text-emerald-400">አሸናፊ (90&apos; FT)</span>
                          ) : (
                            <span className="font-black text-rose-400">ተሸናፊ (90&apos; FT)</span>
                          )}
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-num text-slate-400">
                            {t.picksCount} ጨዋታ ({t.totalOdds.toFixed(2)}x)
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 truncate">{t.resultText || t.choiceText}</p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 text-xs font-mono-num">
                        <span className="text-slate-400">መወራረጃ: {formatETB(t.betAmount)}</span>
                        <span
                          className={`font-black ${
                            isWon
                              ? 'text-emerald-400'
                              : isCashedOut
                                ? 'text-amber-400'
                                : 'text-rose-400'
                          }`}
                        >
                          {t.payout > 0 ? `+${formatETB(t.payout)}` : `-${formatETB(t.betAmount)}`}
                        </span>
                        {t.payout > 0 ? (
                          <CheckCircle2
                            className={`w-4 h-4 ${isCashedOut ? 'text-amber-400' : 'text-emerald-400'}`}
                          />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-400" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: COMPLETE FOOTBALL BETTING GAMEPLAY RULES & CASHOUT RULES */}
      {subTab === 'rules' && (
        <section className="space-y-6">
          {/* Standard Football Betting Rules */}
          <div className="space-y-4">
            <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-1.5">
              <h3 className="text-lg sm:text-xl font-black text-white">
                አጠቃላይ የእግር ኳስ ቤቲንግ አጨዋወት ህጎች · Standard Betting Rules
              </h3>
              <p className="text-xs sm:text-sm text-slate-300">
                ሁሉም ዓለም አቀፍ እና የኢትዮጵያ ፕሪሚየር ሊግ ውርርዶች በሚከተሉት መደበኛ የቤቲንግ ህጎች መሰረት ይወሰናሉ።
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <article className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-mono-num font-bold text-emerald-400">
                  መደበኛ 90&apos; ደቂቃ + ጭማሪ ሰዓት
                </div>
                <h4 className="text-base font-extrabold text-white">
                  1. የጨዋታ ውጤት መወሰኛ ጊዜ (90-Minute Rule)
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  ሁሉም 1/X/2፣ Double Chance (1X, 12, X2)፣ Over/Under 2.5 እና GG/NG ውርርዶች የሚወሰኑት በመደበኛው{' '}
                  <strong className="text-white">90 ደቂቃ እና የዳኛ ጭማሪ ሰዓት (Stoppage Time)</strong> ውጤት ብቻ ነው። የጥሎ ማለፍ Extra Time ወይም የፍጹም ቅጣት ምት (Penalties) አይካተቱም።
                </p>
              </article>

              <article className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-mono-num font-bold text-amber-400">
                  ላይቭ ውርርድ እስከ 85&apos; ደቂቃ
                </div>
                <h4 className="text-base font-extrabold text-white">
                  2. የላይቭ ውርርድ ህግ (Live In-Play Rules)
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  እየተካሄዱ ባሉ ላይቭ ጨዋታዎች ላይ እስከ <strong className="text-white">85ኛው ደቂቃ</strong> ድረስ መወራረድ ይቻላል። ከ86ኛው ደቂቃ በኋላ ላይቭ ውርርድ በራስ-ሰር ይዘጋል፤ ኦዶችም እንደ የቀጥታ ውጤቱ ይለዋወጣሉ።
                </p>
              </article>

              <article className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-mono-num font-bold text-emerald-400">
                  ከ1 እስከ 8 ጨዋታዎች · ከፍተኛ {footballMaxOdds}x ኦድ
                </div>
                <h4 className="text-base font-extrabold text-white">
                  3. የMulti-Bet እና የተጋጭ ምርጫ እገዳ
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  በአንድ ትኬት ከ1 እስከ 8 ጨዋታዎች ማጣመር ይቻላል። በአንድ ጨዋታ ላይ እርስ በርስ የሚጋጩ ምርጫዎችን (ለምሳሌ 1 እና 2 በአንድ ትኬት) መምረጥ አይፈቀድም። ከፍተኛው ድምር ኦድ በ{' '}
                  <strong className="text-white">{footballMaxOdds}x</strong> የተገደበ ነው።
                </p>
              </article>

              <article className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-mono-num font-bold text-amber-400">
                  24 ሰዓት መራዘም / Void (1.00x)
                </div>
                <h4 className="text-base font-extrabold text-white">
                  4. የተራዘሙ እና የተሰረዙ ጨዋታዎች ህግ
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  አንድ ጨዋታ ከተያዘለት ሰዓት ከ24 ሰዓት በላይ ከተራዘመ ወይም ከተሰረዘ፣ በMulti-Bet ትኬት ውስጥ ያለው የጨዋታው ኦድ{' '}
                  <strong className="text-white">1.00x (Void)</strong> ይሆናል፤ በSingle ትኬት ደግሞ የመወራረጃው ብር ሙሉ በሙሉ ይመለሳል።
                </p>
              </article>
            </div>
          </div>

          {/* Complete How-To-Bet Amharic Guide */}
          <div className="space-y-4">
            <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-extrabold">
                <BookOpen className="w-4 h-4 shrink-0" />
                <span>የአቆማመር መመሪያ · HOW A BETTOR BETS</span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white">
                አንድ ቆማሪ እንዴት ይቆምራል? · የእግር ኳስ ቤቲንግ ገበያዎች ማብራሪያ
              </h3>
              <p className="text-xs sm:text-sm text-slate-300">
                በእድል ቤት ውስጥ ከ130 በላይ የአቆማመር ምርጫዎች ይገኛሉ። እያንዳንዱ የቤቲንግ ሲስተም እንዴት እንደሚሰራ እና መቼ እንደሚያሸንፍ ከዚህ በታች ይመልከቱ፦
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <article className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-mono-num font-bold text-emerald-400">
                  1X2 · Double Chance · Draw No Bet
                </div>
                <h4 className="text-base font-extrabold text-white">
                  1. ያሸንፋል / አቻ / ይመለሳል (Match Result)
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  • <strong className="text-white">1 / X / 2:</strong> 1 = ባለሜዳ ያሸንፋል፣ X = አቻ ይወጣሉ፣ 2 = እንግዳ ያሸንፋል።
                  <br />• <strong className="text-white">Double Chance (1/X, X/2, 1/2):</strong> 2 ውጤቶችን በአንድ ላይ መያዝ (ለምሳሌ 1/X ካሸነፈ ወይም አቻ ካለቀ ትበላለህ)።
                  <br />• <strong className="text-white">If Draw Money Back (DNB):</strong> የመረጥከው ቡድን ካሸነፈ ትበላለህ፤ አቻ ካለቀ ግን ብርህ (1.00x) ይመለስልሃል።
                </p>
              </article>

              <article className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-mono-num font-bold text-amber-400">
                  Over/Under 0.5–4.5 · GG/NG · Multigoals
                </div>
                <h4 className="text-base font-extrabold text-white">
                  2. ጎል ብዛት (ኦቨር / አንደር / ቦዝ ቲም ስኮር)
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  • <strong className="text-white">Over / Under:</strong> Over 2.5 ማለት በጨዋታው ቢያንስ 3+ ጎል ይገባል (2:1, 3:0)፤ Under 2.5 ማለት 0, 1 ወይም 2 ጎል ብቻ። Over 0.5 (ቢያንስ 1 ጎል) እስከ Under 4.5 ይገኛል።
                  <br />• <strong className="text-white">GG / NG (Both Teams To Score):</strong> GG (Yes) = ሁለቱም ቡድኖች 1-1+ ጎል ሲያገቡ (1:1, 2:1)፤ NG (No) = አንዱ 0 ከሆነ።
                  <br />• <strong className="text-white">Multigoals (1-3, 2-4, 7+, No Goal):</strong> ጠቅላላ ጎል በክልሉ ውስጥ ሲሆን (ለምሳሌ 1-3 = 1, 2 ወይም 3 ጎል)።
                </p>
              </article>

              <article className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-mono-num font-bold text-emerald-400">
                  1st Half (1X2, Total, GG, Correct Score)
                </div>
                <h4 className="text-base font-extrabold text-white">
                  3. የ1ኛ አጋማሽ (45&apos; First Half Markets)
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  እነዚህ ውርርዶች የሚወሰኑት በ <strong className="text-white">መጀመሪያዎቹ 45 ደቂቃዎች (Halftime)</strong> ውጤት ብቻ ነው — 2ኛው አጋማሽ ላይ የሚገቡ ጎሎች አይቆጠሩም። 1st Half 1X2፣ 1st Half Over 0.5 / 1.5፣ 1st Half GG እና የ1ኛ አጋማሽ ትክክለኛ ውጤት (0:0, 1:0, 1:1...) ይገኛሉ።
                </p>
              </article>

              <article className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-mono-num font-bold text-amber-400">
                  Handicap (1X2) · Winning Margin · Exact Goals
                </div>
                <h4 className="text-base font-extrabold text-white">
                  4. ሃንዲካፕ እና የጎል ልዩነት (Handicap &amp; Margin)
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  • <strong className="text-white">Handicap (-1):</strong> ባለሜዳ (-1) ከመረጥክ በ2+ ጎል ልዩነት (2:0, 3:1) ማሸነፍ አለበት። (+1) ከመረጥክ ጨዋታው አቻ ቢያልቅም ባለሜዳ ያሸንፋል!
                  <br />• <strong className="text-white">Winning Margin:</strong> አሸናፊው በስንት ጎል ልዩነት (በ1 ጎል ወይም በ2+ ጎል) እንደሚያሸንፍ መገመት።
                  <br />• <strong className="text-white">Exact Goals:</strong> የጨዋታው ወይም የአንድ ቡድን ትክክለኛ ጎል (0, 1, 2, 3, 4, 5+)።
                </p>
              </article>

              <article className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-mono-num font-bold text-emerald-400">
                  HT/FT · 1X2 &amp; GG · 1X2 &amp; Total · Clean Sheet
                </div>
                <h4 className="text-base font-extrabold text-white">
                  5. ኮምቦ እና ልዩ የቡድን ምርጫዎች (Combo &amp; Specials)
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  • <strong className="text-white">Combo (ለምሳሌ 1 &amp; GG, 1 &amp; Over 2.5):</strong> ሁለቱም ሁኔታዎች በአንድ ላይ መሟላት አለባቸው (ከፍተኛ ኦድ ይሰጣል)።
                  <br />• <strong className="text-white">Halftime / Fulltime (X/1, 1/1):</strong> እረፍት ላይ ያለውንና 90&apos; ላይ ያለውን ውጤት በቅደም ተከተል መገመት።
                  <br />• <strong className="text-white">Clean Sheet / Win To Nil:</strong> ጎል ሳያስተናግድ መውጣት ወይም ጎል ሳይገባበት ማሸነፍ (1:0, 2:0)።
                </p>
              </article>

              <article className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-mono-num font-bold text-amber-400">
                  Cards · Corners · Correct Score
                </div>
                <h4 className="text-base font-extrabold text-white">
                  6. ካርዶች፣ ኮርነሮች እና ትክክለኛ ውጤት
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  • <strong className="text-white">Total Cards &amp; Red Card:</strong> በ90&apos; የሚሰጡ ጠቅላላ ቢጫ/ቀይ ካርዶች (Over/Under 3.5, 4.5) ወይም ቀይ ካርድ ይወጣል/አይወጣም።
                  <br />• <strong className="text-white">Total Corners &amp; Most Corners:</strong> የጨዋታው ጠቅላላ የማዕዘን ምቶች (Over/Under 8.5, 9.5) ወይም ማን ብዙ ኮርነር ያገኛል።
                  <br />• <strong className="text-white">Correct Score:</strong> ትክክለኛውን የ90&apos; ውጤት (1:0, 2:1, 1:1...) መገመት — እስከ 35x+ ድረስ ኦድ ያስገኛል!
                </p>
              </article>
            </div>
          </div>

          {/* Official Cashout Rules */}
          <div className="space-y-4">
            <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-1.5">
              <h3 className="text-lg sm:text-xl font-black text-white">
                የእግር ኳስ ካሽአውት ህጎች · Official Cashout Rules
              </h3>
              <p className="text-xs sm:text-sm text-slate-300">
                ሁሉም የካሽአውት ጥያቄዎች ከታች ባሉት 4 ህጎች እና በፋየርስቶር የደህንነት መመሪያ መሰረት በራስ-ሰር ይረጋገጣሉ።
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <article className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-mono-num font-bold text-amber-400">
                  ሕግ 01 · {CASHOUT_MIN_MINUTE}&apos; – {CASHOUT_MAX_MINUTE}&apos; የጊዜ መስኮት
                </div>
                <h4 className="text-base font-extrabold text-white">
                  የካሽአውት መስኮት (Active Minute Window)
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  ካሽአውት ማድረግ የሚቻለው ጨዋታው ከ <strong className="text-white">{CASHOUT_MIN_MINUTE}ኛው ደቂቃ</strong> እስከ{' '}
                  <strong className="text-white">{CASHOUT_MAX_MINUTE}ኛው ደቂቃ</strong> ድረስ ብቻ ነው። ከመጀመሪያዎቹ 5 ደቂቃዎች በፊት እና ከ80ኛው ደቂቃ በኋላ ካሽአውት በራስ-ሰር ይዘጋል።
                </p>
              </article>

              <article className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-mono-num font-bold text-emerald-400">
                  ሕግ 02 · {Math.round(CASHOUT_FEE_RATE * 100)}% የካሽአውት አገልግሎት ክፍያ
                </div>
                <h4 className="text-base font-extrabold text-white">
                  ቀጥታ የዋጋ ስሌት (Live Dynamic Valuation)
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  የካሽአውት ዋጋው በየደቂቃው እንደ የጨዋታው የቀጥታ ውጤት፣ የቀረው ጊዜ እና የመረጡት ገበያ ዕድል ይለዋወጣል። ከተገመተው ቀጥታ ዋጋ ላይ{' '}
                  <strong className="text-white">{Math.round(CASHOUT_FEE_RATE * 100)}%</strong> ተቀንሶ{' '}
                  <strong className="text-emerald-400">{Math.round((1 - CASHOUT_FEE_RATE) * 100)}%</strong> ለተጫዋቹ ይቀርባል።
                </p>
              </article>

              <article className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-mono-num font-bold text-amber-400">
                  ሕግ 03 · ዝቅተኛ {Math.round(CASHOUT_MIN_STAKE_RATIO * 100)}% / ከፍተኛ {Math.round(CASHOUT_MAX_PAYOUT_RATIO * 100)}%
                </div>
                <h4 className="text-base font-extrabold text-white">
                  የካሽአውት እገዳና የገደብ ህግ (Suspension &amp; Caps)
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  1) ከመወራረጃው <strong className="text-white">{Math.round(CASHOUT_MIN_STAKE_RATIO * 100)}%</strong> ወይም ከ{' '}
                  <strong className="text-white">{CASHOUT_MIN_AMOUNT} ብር</strong> በታች ሲወርድ ይዘጋል።{' '}
                  2) ከሙሉ 90&apos; ሽልማት <strong className="text-white">{Math.round(CASHOUT_MAX_PAYOUT_RATIO * 100)}%</strong> አይበልጥም።{' '}
                  3) ምርጫ ቀድሞ ሲበላሽ ወይም በMulti-Bet ከ60&apos; በኋላ ከግማሽ በላይ ሲሸነፍ ይታገዳል።
                </p>
              </article>

              <article className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-mono-num font-bold text-emerald-400">
                  ሕግ 04 · የመጨረሻ እና የማይመለስ ውሳኔ
                </div>
                <h4 className="text-base font-extrabold text-white">
                  ወዲያውኑ ወደ ቦርሳ መመዝገብ (Instant Final Settlement)
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  «ካሽአውት ውሰድ» ቁልፍን እንደተጫኑ ብሩ ወዲያውኑ ወደ ፋየርስቶር ቦርሳዎ ይገባል፤ ትኬቱም በቋሚነት ይዘጋል። ከካሽአውት በኋላ በ90&apos; የሚመጡ የጨዋታ ውጤቶች ትኬቱን አይቀይሩትም።
                </p>
              </article>
            </div>
          </div>
        </section>
      )}

      {/* Full All-Markets Modal */}
      {activeModalMatch && (
        <MatchMarketsModal
          match={activeModalMatch}
          selectedMarket={selectedPicksByMatch[activeModalMatch.id]}
          getScaledOdd={getScaledOdd}
          disabled={placingTicket}
          onSelectMarket={togglePick}
          onClose={() => setMarketsMatchId(null)}
        />
      )}
    </div>
  );
};
