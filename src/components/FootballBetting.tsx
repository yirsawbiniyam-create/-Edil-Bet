import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Banknote,
  BarChart3,
  Bell,
  BellOff,
  BellRing,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  FastForward,
  Lock,
  Play,
  Radio,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
  Timer,
  Trash2,
  Trophy,
  Volume2,
  VolumeX,
  Wallet,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  buildFootballSchedule,
  fetchAutomatedMatchResults,
  fetchBeSoccerSchedule,
  getNext7DaysEAT,
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
import {
  dispatchBrowserMatchNotification,
  getBrowserNotificationPermission,
  getMinutesUntilKickoff,
  loadNotifiedMatchMap,
  loadPushEnabledFlag,
  loadRemindMatchIds,
  PreMatchAlertItem,
  requestBrowserNotificationPermission,
  saveNotifiedMatchMap,
  savePushEnabledFlag,
  saveRemindMatchIds,
} from '../lib/matchNotifications';
import { useLanguage } from '../lib/i18n';
import { playGameSound } from '../lib/sound';
import { FootballMostBet } from './FootballMostBet';
import { MatchMarketsModal } from './MatchMarketsModal';
import { MatchStatsModal } from './MatchStatsModal';
import {
  FootballMarketKey,
  FootballPopularityRecord,
  FootballTicket,
  FootballTicketPick,
  GameConfig,
  TelebirrSettings,
  UserWallet,
} from '../types';

export type SportsSection = 'sport' | 'upcoming' | 'live' | 'cashout';
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
  sportsSection?: SportsSection;
  onChangeSportsSection?: (section: SportsSection) => void;
  onToggleSound: () => void;
  onGoToDeposit: () => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
  onWinCelebrate?: () => void;
}

const QUICK_CARD_MARKETS = new Set<FootballMarketKey>(['1', 'X', '2']);

interface LiveSimSnapshot {
  minute: number;
  picks: FootballTicketPick[];
}

const TeamBadge: React.FC<{
  code: string;
  logo?: string;
  name: string;
  size?: 'sm' | 'md';
}> = ({ code, logo, name, size = 'md' }) => {
  const [failed, setFailed] = useState(false);
  const boxClass = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-10 h-10 text-xs';
  const imgClass = size === 'sm' ? 'w-5 h-5' : 'w-7 h-7';
  return (
    <span
      className={`${boxClass} rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-mono-num font-black text-slate-800 shrink-0 overflow-hidden`}
    >
      {logo && !failed ? (
        <img
          src={logo}
          alt={name}
          referrerPolicy="no-referrer"
          className={`${imgClass} object-contain`}
          onError={() => setFailed(true)}
        />
      ) : (
        code
      )}
    </span>
  );
};

function formatSportsDateHeader(dateKey: string | undefined, lang: 'am' | 'en'): string {
  if (!dateKey) return lang === 'en' ? 'Today' : 'ዛሬ';
  const parsed = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  const formatted = parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return formatted;
}

function extractCompactTime(kickoffLabel: string): string {
  const m = kickoffLabel.match(/\b(\d{1,2}:\d{2})\b/);
  if (m) return m[1];
  const min = kickoffLabel.match(/(\d{1,2}')/);
  if (min) return min[1];
  return kickoffLabel.slice(0, 8);
}

export const FootballBetting: React.FC<FootballBettingProps> = ({
  uid,
  wallet,
  settings,
  gameConfig,
  tickets,
  popularity,
  soundEnabled,
  sportsSection = 'sport',
  onChangeSportsSection,
  onToggleSound,
  onGoToDeposit,
  onNotify,
  onWinCelebrate,
}) => {
  const { lang, bi } = useLanguage();

  const [subTab, setSubTab] = useState<FootballSubTab>('fixtures');
  const [timeframeFilter, setTimeframeFilter] = useState<TimeframeBucket>('all');
  const [dayFilter, setDayFilter] = useState<'all' | string>('all');
  const [tierFilter, setTierFilter] = useState<'all' | LeagueTier>('all');
  const [leagueFilter, setLeagueFilter] = useState<LeagueId>('all');
  const [onlyMyBets, setOnlyMyBets] = useState<boolean>(false);

  // Search Event + Check Bet states
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [checkBetOpen, setCheckBetOpen] = useState<boolean>(false);
  const [checkBetCode, setCheckBetCode] = useState<string>('');
  const [mobileSlipOpen, setMobileSlipOpen] = useState<boolean>(false);

  // Expandable table controls ("Show more v")
  const [leagueLimit, setLeagueLimit] = useState<number>(6);
  const [liveLimit, setLiveLimit] = useState<number>(7);
  const [popularLimit, setPopularLimit] = useState<number>(10);

  const [scheduleMatches, setScheduleMatches] = useState<ScheduledMatch[]>([]);
  const [scheduleLoaded, setScheduleLoaded] = useState<boolean>(false);
  const [syncingSchedule, setSyncingSchedule] = useState<boolean>(true);
  const [syncedMatchesCount, setSyncedMatchesCount] = useState<number>(0);
  const [providerLabel, setProviderLabel] = useState<string>('BeSoccer Live + ESPN Global Feed');
  const [liveMatchesCount, setLiveMatchesCount] = useState<number>(0);
  const [resultsSyncing, setResultsSyncing] = useState<boolean>(false);
  const [lastResultsSyncAt, setLastResultsSyncAt] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [picks, setPicks] = useState<SlipPick[]>([]);
  const [stakeInput, setStakeInput] = useState<string>('50');
  const [placingTicket, setPlacingTicket] = useState<boolean>(false);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  const [marketsMatchId, setMarketsMatchId] = useState<string | null>(null);
  const [statsMatchId, setStatsMatchId] = useState<string | null>(null);

  // 15-Minute Pre-Match Push Notifications & "Remind me" local state flags
  const [pushEnabled, setPushEnabled] = useState<boolean>(() => loadPushEnabledFlag());
  const [remindMatchIds, setRemindMatchIds] = useState<string[]>(() => loadRemindMatchIds());
  const [notifiedMap, setNotifiedMap] = useState<Record<string, number>>(() =>
    loadNotifiedMatchMap(),
  );
  const [browserPerm, setBrowserPerm] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission(),
  );
  const [activePreMatchAlerts, setActivePreMatchAlerts] = useState<PreMatchAlertItem[]>([]);
  const notifiedMapRef = useRef(notifiedMap);
  notifiedMapRef.current = notifiedMap;

  const [liveSimMap, setLiveSimMap] = useState<Record<string, LiveSimSnapshot>>({});
  const settlingRef = useRef<Set<string>>(new Set());
  const liveSimRef = useRef<Record<string, LiveSimSnapshot>>({});
  liveSimRef.current = liveSimMap;
  const realResultMatchIdsRef = useRef<Set<string>>(new Set());
  const scheduleMatchesRef = useRef<ScheduledMatch[]>(scheduleMatches);
  scheduleMatchesRef.current = scheduleMatches;
  const topMatchesRef = useRef<HTMLElement | null>(null);
  const liveEventsRef = useRef<HTMLElement | null>(null);

  // Sync top green bar section ('sport' | 'upcoming' | 'live' | 'cashout')
  useEffect(() => {
    if (sportsSection === 'cashout') {
      setSubTab('live');
    } else if (sportsSection === 'live') {
      setSubTab('fixtures');
      setTimeframeFilter('live');
      setOnlyMyBets(false);
    } else if (sportsSection === 'upcoming') {
      setSubTab('fixtures');
      setTimeframeFilter('all');
    } else {
      setSubTab('fixtures');
      if (timeframeFilter === 'live') setTimeframeFilter('all');
    }
  }, [sportsSection]);

  const activeConfig = gameConfig ?? DEFAULT_GAME_CONFIG;
  const houseWinRate =
    gameConfig?.houseWinRate ?? settings?.houseWinRate ?? DEFAULT_GAME_CONFIG.houseWinRate;
  const minBet = activeConfig.minBet;
  const footballOddsScale = activeConfig.footballOddsScale;
  const footballMaxOdds = Math.max(1000000, activeConfig.footballMaxOdds || 1000000);

  const liveTickets = useMemo(() => tickets.filter((t) => t.status === 'live'), [tickets]);
  const settledTickets = useMemo(() => tickets.filter((t) => t.status !== 'live'), [tickets]);
  const activeModalMatch = useMemo(
    () => (marketsMatchId ? scheduleMatches.find((m) => m.id === marketsMatchId) || null : null),
    [marketsMatchId, scheduleMatches],
  );
  const activeStatsMatch = useMemo(
    () => (statsMatchId ? scheduleMatches.find((m) => m.id === statsMatchId) || null : null),
    [statsMatchId, scheduleMatches],
  );

  // Hardware / Browser Back button closes open Sportsbook sheets or secondary views first
  const hasOverlayOpen =
    Boolean(statsMatchId) ||
    Boolean(marketsMatchId) ||
    mobileSlipOpen ||
    checkBetOpen ||
    subTab !== 'fixtures';
  const pushedHistoryRef = useRef(false);

  useEffect(() => {
    if (hasOverlayOpen && !pushedHistoryRef.current) {
      try {
        window.history.pushState({ edilModal: true }, '');
        pushedHistoryRef.current = true;
      } catch {
        // ignore history errors
      }
    } else if (!hasOverlayOpen) {
      pushedHistoryRef.current = false;
    }
  }, [hasOverlayOpen]);

  useEffect(() => {
    const onPopState = () => {
      if (statsMatchId) {
        setStatsMatchId(null);
      } else if (marketsMatchId) {
        setMarketsMatchId(null);
      } else if (mobileSlipOpen) {
        setMobileSlipOpen(false);
      } else if (checkBetOpen) {
        setCheckBetOpen(false);
      } else if (subTab !== 'fixtures') {
        setSubTab('fixtures');
        onChangeSportsSection?.('sport');
      }
      pushedHistoryRef.current = false;
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [statsMatchId, marketsMatchId, mobileSlipOpen, checkBetOpen, subTab, onChangeSportsSection]);

  const loadLiveSchedule = async (forceRefresh = false, showToast = false) => {
    setSyncingSchedule(true);
    try {
      const result = await fetchBeSoccerSchedule(forceRefresh);
      setScheduleMatches(result.matches);
      setSyncedMatchesCount(result.syncedCount);
      if (result.providerLabel) {
        setProviderLabel(result.providerLabel);
      }
      setLiveMatchesCount(result.liveCount ?? result.matches.filter((m) => m.isLive).length);
      setLastSyncedAt(result.fetchedAt);
      setScheduleLoaded(true);
      if (showToast) {
        if (result.fromCache) {
          onNotify(
            bi(
              `የተቀመጠ የኦንላይን ፕሮግራም እየታየ ነው (${result.syncedCount} ጨዋታዎች)`,
              `Showing cached online fixtures (${result.syncedCount} matches)`,
            ),
            'info',
          );
        } else {
          onNotify(
            bi(
              `ትክክለኛ የኦንላይን ፕሮግራም ታድሷል (${result.syncedCount} ጨዋታዎች · ${result.providerLabel || 'Live API'})`,
              `Live schedule refreshed (${result.syncedCount} fixtures · ${result.providerLabel || 'Live API'})`,
            ),
            'success',
          );
        }
      }
    } catch {
      const hadExisting = scheduleMatchesRef.current.length > 0;
      setScheduleMatches((prev) => (prev.length > 0 ? prev : buildFootballSchedule(new Date())));
      setScheduleLoaded(true);
      if (showToast && !hadExisting) {
        onNotify(
          bi(
            'የኦንላይን ፕሮግራም ማግኘት አልተቻለም፤ መደበኛ ፕሮግራም ተከፍቷል።',
            'Unable to reach live feed right now; fallback schedule loaded.',
          ),
          'info',
        );
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

  const liveTicketsRef = useRef<FootballTicket[]>(liveTickets);
  liveTicketsRef.current = liveTickets;

  const syncLiveResultsFromProvider = async (showToast = false) => {
    const queryMap = new Map<string, { matchId: string; home: string; away: string }>();
    for (const t of liveTicketsRef.current) {
      for (const p of t.picks) {
        if (!queryMap.has(p.matchId)) {
          queryMap.set(p.matchId, { matchId: p.matchId, home: p.home, away: p.away });
        }
      }
    }
    for (const m of scheduleMatchesRef.current) {
      if (m.isLive && queryMap.size < 55 && !queryMap.has(m.id)) {
        queryMap.set(m.id, { matchId: m.id, home: m.home, away: m.away });
      }
    }

    const queryList = Array.from(queryMap.values());
    if (queryList.length === 0) {
      if (showToast) {
        onNotify(
          bi('አሁን የሚታደስ ቀጥታ ውጤት የለም', 'No active live matches or tickets to sync right now'),
          'info',
        );
      }
      return;
    }

    setResultsSyncing(true);
    try {
      const results = await fetchAutomatedMatchResults(queryList);
      const matchedCount = Object.keys(results).length;
      setLastResultsSyncAt(new Date().toISOString());

      if (matchedCount > 0) {
        for (const [mid, res] of Object.entries(results)) {
          if (res.status === 'in' || res.status === 'post') {
            realResultMatchIdsRef.current.add(mid);
          }
        }

        // Update live board scores/minutes from real API results
        setScheduleMatches((prev) =>
          prev.map((m) => {
            const res = results[m.id];
            if (!res) return m;
            if (res.status === 'in') {
              return {
                ...m,
                isLive: true,
                timeframe: 'live',
                liveMinute: res.minute,
                liveHomeGoals: res.homeGoals,
                liveAwayGoals: res.awayGoals,
                liveHtHomeGoals: res.htHomeGoals ?? m.liveHtHomeGoals,
                liveHtAwayGoals: res.htAwayGoals ?? m.liveHtAwayGoals,
                kickoffLabel: `LIVE · ${res.minute}'`,
              };
            }
            if (res.status === 'post') {
              return {
                ...m,
                isLive: false,
                liveMinute: 90,
                liveHomeGoals: res.homeGoals,
                liveAwayGoals: res.awayGoals,
                liveHtHomeGoals: res.htHomeGoals ?? m.liveHtHomeGoals,
                liveHtAwayGoals: res.htAwayGoals ?? m.liveHtAwayGoals,
                kickoffLabel: `FT · ${res.homeGoals}-${res.awayGoals}`,
              };
            }
            return m;
          }),
        );

        // Sync active live tickets with authentic live/post match results
        const ticketUpdates: Record<string, LiveSimSnapshot> = {};
        for (const ticket of liveTicketsRef.current) {
          if (settlingRef.current.has(ticket.id)) continue;
          const snap = liveSimRef.current[ticket.id] || {
            minute: Math.max(1, ticket.currentMinute || 1),
            picks: ticket.picks,
          };

          let anyRealActive = false;
          let maxRealMinute = snap.minute;
          let allLegsFinishedReal = snap.picks.length > 0;

          const updatedPicks = snap.picks.map((p) => {
            const res = results[p.matchId];
            if (!res || res.status === 'pre') {
              allLegsFinishedReal = false;
              return p;
            }
            anyRealActive = true;
            if (res.status === 'in') {
              allLegsFinishedReal = false;
              maxRealMinute = Math.max(maxRealMinute, res.minute);
            } else if (res.status === 'post') {
              maxRealMinute = 90;
            }
            const hg = res.homeGoals;
            const ag = res.awayGoals;
            const hth = res.htHomeGoals ?? p.htHomeGoals ?? Math.min(hg, Math.floor(hg * 0.5));
            const hta = res.htAwayGoals ?? p.htAwayGoals ?? Math.min(ag, Math.floor(ag * 0.5));
            const nextPick: FootballTicketPick = {
              ...p,
              homeGoals: hg,
              awayGoals: ag,
              htHomeGoals: hth,
              htAwayGoals: hta,
            };
            return {
              ...nextPick,
              hit: checkFootballMarketHit(nextPick.market, hg, ag, nextPick),
            };
          });

          if (!anyRealActive) continue;

          const nextMinute = allLegsFinishedReal ? 90 : Math.max(1, Math.min(90, maxRealMinute));
          ticketUpdates[ticket.id] = {
            minute: nextMinute,
            picks: updatedPicks,
          };

          if (allLegsFinishedReal) {
            settlingRef.current.add(ticket.id);
            void settleOrCashoutFootballTicket({
              uid,
              ticket,
              mode: 'full_time',
              picks: updatedPicks,
              minute: 90,
            })
              .then((res) => {
                playGameSound(res.status === 'won' ? 'win' : 'lose', soundEnabled);
                if (res.status === 'won') onWinCelebrate?.();
                onNotify(
                  res.status === 'won'
                    ? bi(
                        `ትኬት በትክክለኛ የጨዋታ ውጤት አሸነፈ! +${formatETB(res.payout)}`,
                        `Ticket WON via official FT results! +${formatETB(res.payout)}`,
                      )
                    : bi(
                        `ትኬቱ በ90' ውጤት ተጠናቋል (-${formatETB(ticket.betAmount)})`,
                        `Ticket settled via official FT results (-${formatETB(ticket.betAmount)})`,
                      ),
                  res.status === 'won' ? 'success' : 'info',
                );
              })
              .catch((err) => {
                settlingRef.current.delete(ticket.id);
                console.error(err);
              });
          } else {
            const quote = computeFootballCashout(
              updatedPicks,
              ticket.betAmount,
              ticket.potentialPayout,
              nextMinute,
            );
            const scoreSummary = updatedPicks
              .map((p) => `${p.homeCode} ${p.homeGoals}-${p.awayGoals} ${p.awayCode}`)
              .join(' | ');
            void syncLiveFootballTicketProgress({
              ticketId: ticket.id,
              picks: updatedPicks,
              currentMinute: nextMinute,
              cashoutOffer: quote.offer,
              cashoutEligible: quote.eligible,
              resultText: `${nextMinute}' · ${scoreSummary}`,
            });
          }
        }

        if (Object.keys(ticketUpdates).length > 0) {
          setLiveSimMap((prev) => ({ ...prev, ...ticketUpdates }));
        }
      }

      if (showToast) {
        onNotify(
          bi(
            `ቀጥታ ውጤቶች ታድሰዋል (${matchedCount} ጨዋታ ተገናኝቷል)`,
            `Live match results synced (${matchedCount} fixtures updated)`,
          ),
          matchedCount > 0 ? 'success' : 'info',
        );
      }
    } finally {
      setResultsSyncing(false);
    }
  };

  useEffect(() => {
    void syncLiveResultsFromProvider(false);
    const liveResultsTimer = window.setInterval(() => {
      void syncLiveResultsFromProvider(false);
    }, 30_000);
    return () => window.clearInterval(liveResultsTimer);
  }, []);

  // Real-time board clock ONLY for local demo LIVE matches (real RapidAPI/BeSoccer/ESPN matches keep authentic synced scores)
  useEffect(() => {
    const boardTimer = window.setInterval(() => {
      setScheduleMatches((prev) =>
        prev.map((m) => {
          if (!m.isLive) return m;
          if (
            m.id.startsWith('rapid_') ||
            m.id.startsWith('bslive_') ||
            m.id.startsWith('bsweb_') ||
            m.id.startsWith('bs_')
          ) {
            return m;
          }
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

  // Live Match Ticker for active tickets (real-time API-driven legs preserve authentic live scores)
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

        const allLegsRealLive =
          current.picks.length > 0 &&
          current.picks.every((p) => realResultMatchIdsRef.current.has(p.matchId));
        if (allLegsRealLive) {
          // Governed by live API polling (syncLiveResultsFromProvider)
          continue;
        }

        const nextMinute = Math.min(90, current.minute + 2);
        const simulatedAll = advanceLiveMatchTick(current.picks, houseWinRate, current.minute);
        const nextPicks = simulatedAll.map((simPick, idx) => {
          const orig = current.picks[idx];
          if (orig && realResultMatchIdsRef.current.has(orig.matchId)) {
            return orig;
          }
          return simPick;
        });
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
              if (res.status === 'won') {
                onWinCelebrate?.();
              }
              onNotify(
                res.status === 'won'
                  ? bi(
                      `የእግር ኳስ ትኬት አሸነፈ! +${formatETB(res.payout)}`,
                      `Football ticket WON! +${formatETB(res.payout)}`,
                    )
                  : bi(
                      `ትኬቱ በ90' ተጠናቋል (-${formatETB(ticket.betAmount)})`,
                      `Ticket settled at 90' (-${formatETB(ticket.betAmount)})`,
                    ),
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
  }, [liveTickets, houseWinRate, uid, soundEnabled, onNotify, onWinCelebrate, bi]);

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

  const next7Days = useMemo(() => getNext7DaysEAT(new Date()), [lastSyncedAt]);

  const dayCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of scheduleMatches) {
      if (m.dateKey) {
        map[m.dateKey] = (map[m.dateKey] || 0) + 1;
      }
    }
    return map;
  }, [scheduleMatches]);

  const userBetsByMatch = useMemo(() => {
    const byId = new Map<
      string,
      { ticketsCount: number; latestMarketLabel: string; latestOdd: number; isActive: boolean }
    >();
    const byPair = new Map<
      string,
      { ticketsCount: number; latestMarketLabel: string; latestOdd: number; isActive: boolean }
    >();

    for (const t of tickets) {
      const activeTicket = t.status === 'live';
      for (const p of t.picks) {
        const label = p.marketLabel || getMarketLabel(p.market);
        const existingId = byId.get(p.matchId);
        byId.set(p.matchId, {
          ticketsCount: (existingId?.ticketsCount || 0) + 1,
          latestMarketLabel: existingId?.isActive && !activeTicket ? existingId.latestMarketLabel : label,
          latestOdd: existingId?.isActive && !activeTicket ? existingId.latestOdd : p.odd,
          isActive: Boolean(existingId?.isActive || activeTicket),
        });

        const pairKey = `${p.home.trim().toLowerCase()}__${p.away.trim().toLowerCase()}`;
        const existingPair = byPair.get(pairKey);
        byPair.set(pairKey, {
          ticketsCount: (existingPair?.ticketsCount || 0) + 1,
          latestMarketLabel:
            existingPair?.isActive && !activeTicket ? existingPair.latestMarketLabel : label,
          latestOdd: existingPair?.isActive && !activeTicket ? existingPair.latestOdd : p.odd,
          isActive: Boolean(existingPair?.isActive || activeTicket),
        });
      }
    }

    return { byId, byPair };
  }, [tickets]);

  const getUserBetInfo = (m: ScheduledMatch) => {
    const direct = userBetsByMatch.byId.get(m.id);
    if (direct) return direct;
    const pairKey = `${m.home.trim().toLowerCase()}__${m.away.trim().toLowerCase()}`;
    return userBetsByMatch.byPair.get(pairKey) || null;
  };

  const upcomingBettedCount = useMemo(
    () =>
      scheduleMatches.filter((m) => {
        if (m.isLive) return false;
        const pairKey = `${m.home.trim().toLowerCase()}__${m.away.trim().toLowerCase()}`;
        return userBetsByMatch.byId.has(m.id) || userBetsByMatch.byPair.has(pairKey);
      }).length,
    [scheduleMatches, userBetsByMatch],
  );

  const remindMatchSet = useMemo(() => new Set(remindMatchIds), [remindMatchIds]);

  const firePreMatchAlert = (
    match: ScheduledMatch,
    minsLeft: number,
    reason: PreMatchAlertItem['reason'],
  ) => {
    const alertId = `${match.id}_${reason}_${Date.now()}`;
    const item: PreMatchAlertItem = {
      id: alertId,
      matchId: match.id,
      home: match.home,
      away: match.away,
      leagueLabel: match.leagueLabel,
      minutesRemaining: minsLeft,
      reason,
      triggeredAt: Date.now(),
    };

    setActivePreMatchAlerts((prev) => [item, ...prev.filter((a) => a.matchId !== match.id)].slice(0, 4));
    playGameSound('win', soundEnabled);

    const title = bi(
      `⏰ ጨዋታ ሊጀምር ${minsLeft} ደቂቃ ቀረው!`,
      `⏰ Kickoff in ${minsLeft} min!`,
    );
    const body = `${match.home} vs ${match.away} (${match.leagueLabel})`;

    dispatchBrowserMatchNotification({
      title,
      body,
      tag: `edilbet_prematch_${match.id}`,
    });

    onNotify(`${title} — ${body}`, 'info');
  };

  const handleTogglePushEnabled = async () => {
    const next = !pushEnabled;
    setPushEnabled(next);
    savePushEnabledFlag(next);
    if (next && browserPerm === 'default') {
      const perm = await requestBrowserNotificationPermission();
      setBrowserPerm(perm);
    }
    onNotify(
      next
        ? bi('የ15 ደቂቃ ቀደምት ማሳወቂያ በርቷል።', '15-minute pre-match alerts enabled.')
        : bi('የ15 ደቂቃ ቀደምት ማሳወቂያ ጠፍቷል።', '15-minute pre-match alerts paused.'),
      'info',
    );
  };

  const handleEnableBrowserPush = async () => {
    const perm = await requestBrowserNotificationPermission();
    setBrowserPerm(perm);
    if (perm === 'granted') {
      onNotify(
        bi('የብራውዘር ፑሽ ማሳወቂያ ተፈቅዷል!', 'Browser Push Notifications enabled!'),
        'success',
      );
    } else {
      onNotify(
        bi(
          'የብራውዘር ማሳወቂያ አልተፈቀደም — የውስጥ ማንቂያ (Toast Banner) በራስ-ሰር ይሰራል።',
          'Browser push blocked — in-app alert banner & toast will notify you automatically.',
        ),
        'info',
      );
    }
  };

  const toggleRemindMatch = async (match: ScheduledMatch) => {
    playGameSound('click', soundEnabled);
    const alreadySet = remindMatchSet.has(match.id);
    const nextIds = alreadySet
      ? remindMatchIds.filter((id) => id !== match.id)
      : [...remindMatchIds, match.id];

    setRemindMatchIds(nextIds);
    saveRemindMatchIds(nextIds);

    if (!alreadySet) {
      if (!pushEnabled) {
        setPushEnabled(true);
        savePushEnabledFlag(true);
      }
      if (browserPerm === 'default') {
        const perm = await requestBrowserNotificationPermission();
        setBrowserPerm(perm);
      }
      const minsLeft = getMinutesUntilKickoff(match);
      if (minsLeft !== null && minsLeft <= 15) {
        const dedupeKey = `${match.id}_${match.kickoffIso || match.dateKey || 'soon'}`;
        const updated = { ...notifiedMapRef.current, [dedupeKey]: Date.now() };
        setNotifiedMap(updated);
        saveNotifiedMatchMap(updated);
        firePreMatchAlert(match, minsLeft, 'remind_me');
        return;
      }
      onNotify(
        bi(
          `${match.home} vs ${match.away} ከመጀመሩ 15 ደቂቃ በፊት እናሳውቅዎታለን!`,
          `Remind me set: We'll notify you 15m before ${match.home} vs ${match.away}.`,
        ),
        'success',
      );
    } else {
      onNotify(
        bi(
          `ለ ${match.home} vs ${match.away} ማስታወሻ ተነስቷል።`,
          `Reminder removed for ${match.home} vs ${match.away}.`,
        ),
        'info',
      );
    }
  };

  // Monitor every 15s for upcoming matches starting in <= 15 minutes (betted OR Remind me toggled)
  useEffect(() => {
    if (!pushEnabled) return;

    const scanPreMatchWindows = () => {
      const nowMs = Date.now();
      let mapChanged = false;
      const nextMap = { ...notifiedMapRef.current };

      for (const m of scheduleMatches) {
        if (m.isLive) continue;
        const minsLeft = getMinutesUntilKickoff(m, nowMs);
        if (minsLeft === null || minsLeft > 15 || minsLeft < 1) continue;

        const hasBet = Boolean(getUserBetInfo(m));
        const hasRemind = remindMatchSet.has(m.id);
        if (!hasBet && !hasRemind) continue;

        const dedupeKey = `${m.id}_${m.kickoffIso || m.dateKey || 'soon'}`;
        if (nextMap[dedupeKey]) continue;

        nextMap[dedupeKey] = nowMs;
        mapChanged = true;
        firePreMatchAlert(m, minsLeft, hasBet ? 'bet_placed' : 'remind_me');
      }

      if (mapChanged) {
        setNotifiedMap(nextMap);
        saveNotifiedMatchMap(nextMap);
      }
    };

    scanPreMatchWindows();
    const id = window.setInterval(scanPreMatchWindows, 15_000);
    return () => window.clearInterval(id);
  }, [pushEnabled, scheduleMatches, remindMatchSet, userBetsByMatch]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const matchesSearch = (m: ScheduledMatch) => {
    if (!normalizedSearch) return true;
    return (
      m.home.toLowerCase().includes(normalizedSearch) ||
      m.away.toLowerCase().includes(normalizedSearch) ||
      m.leagueLabel.toLowerCase().includes(normalizedSearch) ||
      m.homeCode.toLowerCase().includes(normalizedSearch) ||
      m.awayCode.toLowerCase().includes(normalizedSearch)
    );
  };

  const topMatchesCarousel = useMemo(() => {
    const base = scheduleMatches.filter(
      (m) => (sportsSection !== 'upcoming' || !m.isLive) && matchesSearch(m),
    );
    const featured = base.filter((m) => m.featured);
    if (featured.length >= 4) return featured.slice(0, 10);
    return base.slice(0, 10);
  }, [scheduleMatches, sportsSection, normalizedSearch]);

  const liveMatchesList = useMemo(
    () => scheduleMatches.filter((m) => m.isLive && matchesSearch(m)),
    [scheduleMatches, normalizedSearch],
  );

  const topLeagueSectionMatches = useMemo(() => {
    const targetLeague: Exclude<LeagueId, 'all'> | 'all' = leagueFilter;
    return scheduleMatches.filter((m) => {
      if (!matchesSearch(m)) return false;
      if (onlyMyBets) {
        if (m.isLive) return false;
        const pairKey = `${m.home.trim().toLowerCase()}__${m.away.trim().toLowerCase()}`;
        if (!userBetsByMatch.byId.has(m.id) && !userBetsByMatch.byPair.has(pairKey)) {
          return false;
        }
      }
      if (tierFilter !== 'all' && m.tier !== tierFilter) return false;
      if (targetLeague !== 'all' && m.league !== targetLeague) return false;
      if (sportsSection === 'upcoming' && m.isLive) return false;
      return true;
    });
  }, [
    scheduleMatches,
    onlyMyBets,
    userBetsByMatch,
    tierFilter,
    leagueFilter,
    sportsSection,
    normalizedSearch,
  ]);

  const filteredMatches = useMemo(() => {
    return scheduleMatches.filter((m) => {
      if (!matchesSearch(m)) return false;
      if (onlyMyBets) {
        if (m.isLive) return false;
        const pairKey = `${m.home.trim().toLowerCase()}__${m.away.trim().toLowerCase()}`;
        if (!userBetsByMatch.byId.has(m.id) && !userBetsByMatch.byPair.has(pairKey)) {
          return false;
        }
      }
      if (sportsSection === 'upcoming' && m.isLive) return false;
      if (timeframeFilter !== 'all' && m.timeframe !== timeframeFilter) return false;
      if (dayFilter !== 'all' && m.dateKey !== dayFilter) return false;
      if (tierFilter !== 'all' && m.tier !== tierFilter) return false;
      if (leagueFilter !== 'all' && m.league !== leagueFilter) return false;
      return true;
    });
  }, [
    scheduleMatches,
    onlyMyBets,
    userBetsByMatch,
    sportsSection,
    timeframeFilter,
    dayFilter,
    tierFilter,
    leagueFilter,
    normalizedSearch,
  ]);

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
      onNotify(
        bi(
          "በቤቲንግ ህግ መሰረት ከ 85' በኋላ ላይቭ ውርርድ ይዘጋል።",
          "Live betting locks after 85' under sportsbook rules.",
        ),
        'error',
      );
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
      if (prev.length >= 250) {
        onNotify(
          bi(
            'በአንድ ትኬት እስከ 250 ጨዋታዎች ድረስ መምረጥ ይችላሉ።',
            'Up to 250 selections fit on one ticket.',
          ),
          'info',
        );
        return prev;
      }
      return [...prev, nextPick];
    });
  };

  const handlePlaceTicket = async () => {
    if (placingTicket) return;
    if (syncedPicks.length === 0) {
      onNotify(
        bi('እባክዎ ቢያንስ 1 የእግር ኳስ ጨዋታ ከዝርዝሩ ይምረጡ።', 'Select at least 1 match from the board.'),
        'error',
      );
      return;
    }
    const lockedPick = syncedPicks.find(
      (p) => p.match.isLive && (p.match.liveMinute ?? 0) >= 86,
    );
    if (lockedPick) {
      onNotify(
        bi(
          `${lockedPick.match.home} vs ${lockedPick.match.away} ከ 85' ስላለፈ ላይቭ ውርርዱ ተዘግቷል።`,
          `${lockedPick.match.home} vs ${lockedPick.match.away} passed 85' and is locked.`,
        ),
        'error',
      );
      return;
    }
    if (!Number.isFinite(numericStake) || numericStake < minBet) {
      onNotify(
        bi(
          `ዝቅተኛው የመወራረጃ መጠን ${minBet} ብር ነው።`,
          `Minimum stake is ${minBet} ETB.`,
        ),
        'error',
      );
      return;
    }
    if (wallet.balance < numericStake) {
      onNotify(
        bi(
          'በቂ ቀሪ ሂሳብ የለዎትም! እባክዎ በቴሌብር ዲፖሲት ያድርጉ።',
          'Insufficient balance. Please deposit via Telebirr.',
        ),
        'error',
      );
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
      setMobileSlipOpen(false);
      setSubTab('live');
      onChangeSportsSection?.('cashout');
      onNotify(
        bi(
          'ትኬቱ ተቆርጧል! ወደ ላይቭ ጨዋታ እና ካሽአውት ገብተዋል።',
          'Ticket placed! Moved to Live Cashout center.',
        ),
        'success',
      );
    } catch (err) {
      onNotify(
        err instanceof Error
          ? err.message
          : bi('የእግር ኳስ ትኬቱን መቁረጥ አልተቻለም።', 'Failed to place ticket.'),
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
      if (res.payout >= ticket.betAmount) {
        onWinCelebrate?.();
      }
      onNotify(
        bi(
          `ካሽአውት ተሳክቷል! ${formatETB(res.payout)} ወደ ቦርሳዎ ገብቷል።`,
          `Cashout completed! +${formatETB(res.payout)} credited.`,
        ),
        'success',
      );
    } catch (err) {
      settlingRef.current.delete(ticket.id);
      onNotify(
        err instanceof Error ? err.message : bi('ካሽአውት ማድረግ አልተቻለም።', 'Cashout failed.'),
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
      if (res.status === 'won') {
        onWinCelebrate?.();
      }
      onNotify(
        res.status === 'won'
          ? bi(
              `ጨዋታው 90' ተጠናቆ ${formatETB(res.payout)} አሸንፈዋል!`,
              `Full time 90'! You won ${formatETB(res.payout)}!`,
            )
          : bi(
              `ጨዋታው በ90' ተጠናቋል (-${formatETB(ticket.betAmount)})`,
              `Settled at 90' (-${formatETB(ticket.betAmount)})`,
            ),
        res.status === 'won' ? 'success' : 'info',
      );
    } catch (err) {
      settlingRef.current.delete(ticket.id);
      onNotify(
        err instanceof Error ? err.message : bi('ጨዋታውን ማጠናቀቅ አልተቻለም።', 'Failed to settle match.'),
        'error',
      );
    } finally {
      setBusyTicketId(null);
    }
  };

  // Group a slice of matches by dateKey for clean green date headers (matching screenshots)
  const groupMatchesByDate = (list: ScheduledMatch[]) => {
    const groups: { dateKey: string; label: string; matches: ScheduledMatch[] }[] = [];
    const byKey = new Map<string, ScheduledMatch[]>();
    for (const m of list) {
      const key = m.dateKey || next7Days[0]?.dateKey || 'today';
      const arr = byKey.get(key) || [];
      arr.push(m);
      byKey.set(key, arr);
    }
    for (const [dateKey, items] of byKey.entries()) {
      groups.push({
        dateKey,
        label: formatSportsDateHeader(dateKey, lang),
        matches: items,
      });
    }
    return groups;
  };

  const renderSportsbookTableRow = (match: ScheduledMatch, isLiveMode = false) => {
    const selectedPick = picks.find((p) => p.match.id === match.id);
    const isLiveLocked = match.isLive && (match.liveMinute ?? 0) >= 86;
    const userBetInfo = getUserBetInfo(match);
    const hasCustomMarket = Boolean(selectedPick && !QUICK_CARD_MARKETS.has(selectedPick.market));

    return (
      <div
        key={match.id}
        className={`border-b border-slate-200 transition-colors ${
          selectedPick ? 'bg-emerald-50/70' : 'bg-white hover:bg-slate-50'
        }`}
      >
        {/* PHONE-FIRST COMPACT STACKED LAYOUT (<640px, safe on all narrow/tall phone ratios) */}
        <div className="sm:hidden p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 min-w-0">
              {isLiveMode || match.isLive ? (
                <span className="font-mono-num font-black text-[#0E8A38] shrink-0">
                  {match.liveMinute && match.liveMinute <= 45
                    ? `1H ${match.liveMinute}'`
                    : `2H ${match.liveMinute || 60}'`}{' '}
                  ({match.liveHomeGoals ?? 0}-{match.liveAwayGoals ?? 0})
                </span>
              ) : (
                <span className="font-mono-num font-bold text-slate-700 shrink-0">
                  {extractCompactTime(match.kickoffLabel)}
                </span>
              )}
              <span className="text-slate-300">·</span>
              <span className="font-semibold text-slate-500 truncate">{match.leagueLabel}</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!match.isLive && !isLiveMode && (
                <button
                  type="button"
                  onClick={() => void toggleRemindMatch(match)}
                  title={bi('ከ15 ደቂቃ በፊት አስታውሰኝ', 'Remind me 15m before kickoff')}
                  aria-pressed={remindMatchSet.has(match.id)}
                  className={`min-h-[36px] px-2 rounded border text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition ${
                    remindMatchSet.has(match.id)
                      ? 'bg-amber-50 border-amber-400 text-amber-800'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-600'
                  }`}
                >
                  {remindMatchSet.has(match.id) ? (
                    <BellRing className="w-3.5 h-3.5 text-amber-600" />
                  ) : (
                    <Bell className="w-3.5 h-3.5" />
                  )}
                  <span>{remindMatchSet.has(match.id) ? bi('ነቅቷል', 'Set') : bi('አስታውሰኝ', 'Remind')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  playGameSound('click', soundEnabled);
                  setStatsMatchId(match.id);
                }}
                title={bi('ስታትስ (H2H · Form · Table)', 'Match Statistics')}
                className="min-h-[36px] px-2 rounded bg-slate-100 hover:bg-[#EAF3ED] border border-slate-200 text-[#0E8A38] text-[10px] font-black flex items-center gap-1 cursor-pointer"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Stats</span>
              </button>
              <button
                type="button"
                disabled={placingTicket || isLiveLocked}
                onClick={() => {
                  playGameSound('click', soundEnabled);
                  setMarketsMatchId(match.id);
                }}
                title={bi('135+ ገበያዎችን ክፈት', 'Open 135+ Markets')}
                className="min-h-[36px] px-2 rounded bg-slate-100 hover:bg-[#9AD84B]/40 border border-slate-200 text-[10px] font-mono-num font-black text-[#0E8A38] flex items-center justify-center cursor-pointer disabled:opacity-45"
              >
                +135
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={placingTicket || isLiveLocked}
            onClick={() => {
              playGameSound('click', soundEnabled);
              setMarketsMatchId(match.id);
            }}
            className="w-full text-left group cursor-pointer disabled:cursor-not-allowed space-y-0.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-extrabold text-slate-900 group-hover:text-[#0E8A38] truncate">
                {match.home}
              </span>
              {match.featured && <Zap className="w-3 h-3 text-[#0E8A38] shrink-0" />}
            </div>
            <div className="text-[13px] font-semibold text-slate-700 truncate">{match.away}</div>
            {(userBetInfo || hasCustomMarket) && (
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] pt-0.5">
                {userBetInfo && (
                  <span className="font-bold text-[#0E8A38]">
                    {bi('የተወራረዱበት', 'My Bet')}: {userBetInfo.latestMarketLabel}
                  </span>
                )}
                {hasCustomMarket && selectedPick && (
                  <span className="font-bold text-amber-700">
                    {getMarketLabel(selectedPick.market)} ({selectedPick.odd.toFixed(2)})
                  </span>
                )}
              </div>
            )}
          </button>

          <div className="grid grid-cols-3 gap-1.5">
            {(['1', 'X', '2'] as const).map((mkt) => {
              const active = selectedPick?.market === mkt;
              return (
                <button
                  key={`mob_${mkt}`}
                  type="button"
                  disabled={placingTicket || isLiveLocked}
                  onClick={() => togglePick(match, mkt)}
                  aria-label={`${match.home} vs ${match.away} ${mkt}`}
                  className={`min-h-[44px] px-2 rounded-lg text-xs font-mono-num flex items-center justify-between gap-1 transition cursor-pointer disabled:cursor-not-allowed ${
                    isLiveLocked
                      ? 'bg-[#E5E7EB] text-slate-400'
                      : active
                        ? 'bg-[#0E8A38] text-white font-black shadow-xs'
                        : 'bg-[#E5E7EB] hover:bg-slate-300 text-slate-900 font-bold'
                  }`}
                >
                  <span className="text-[10px] opacity-75">{mkt}</span>
                  {isLiveLocked ? (
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <span className="font-black">{getScaledOdd(match.odds[mkt]).toFixed(2)}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* DESKTOP / TABLET HORIZONTAL ROW (>=640px) */}
        <div className="hidden sm:grid sm:grid-cols-[64px_1fr_repeat(3,64px)_118px] items-center gap-1 px-3 py-2">
          <div className="font-mono-num text-[11px] leading-tight pr-1">
            {isLiveMode || match.isLive ? (
              <div className="text-[#0E8A38] font-extrabold">
                <div className="truncate">
                  {match.liveMinute && match.liveMinute <= 45
                    ? `1H ${match.liveMinute}'`
                    : `2H ${match.liveMinute || 60}'`}
                </div>
                <div className="text-slate-900 font-black">
                  {match.liveHomeGoals ?? 0}-{match.liveAwayGoals ?? 0}
                </div>
              </div>
            ) : (
              <span className="text-slate-700 font-bold">
                {extractCompactTime(match.kickoffLabel)}
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={placingTicket || isLiveLocked}
            onClick={() => {
              playGameSound('click', soundEnabled);
              setMarketsMatchId(match.id);
            }}
            title={bi('በዚህ ጨዋታ ላይ ከ135+ የመቆመር ዘዴዎች መርጠው ይወራረዱ', 'Click to bet with 135+ betting styles')}
            className="min-w-0 pr-1.5 text-left group cursor-pointer disabled:cursor-not-allowed rounded py-0.5 transition hover:bg-[#EAF3ED]/60"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold text-slate-900 group-hover:text-[#0E8A38] transition truncate">
                {match.home}
              </span>
              {match.featured && <Zap className="w-3 h-3 text-[#0E8A38] shrink-0" />}
            </div>
            <div className="text-[13px] font-semibold text-slate-600 group-hover:text-slate-900 transition truncate">
              {match.away}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
              <span className="truncate">{match.leagueLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-bold text-[#0E8A38] group-hover:underline">
                {bi('135+ ዘዴዎች', 'All Styles')}
              </span>
              {userBetInfo && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-bold text-[#0E8A38] truncate">
                    {bi('የተወራረዱበት', 'My Bet')}: {userBetInfo.latestMarketLabel}
                  </span>
                </>
              )}
              {hasCustomMarket && selectedPick && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-bold text-amber-700 truncate">
                    {getMarketLabel(selectedPick.market)}
                  </span>
                </>
              )}
            </div>
          </button>

          {(['1', 'X', '2'] as const).map((mkt) => {
            const active = selectedPick?.market === mkt;
            return (
              <button
                key={mkt}
                type="button"
                disabled={placingTicket || isLiveLocked}
                onClick={() => togglePick(match, mkt)}
                aria-label={`${match.home} vs ${match.away} ${mkt}`}
                className={`h-10 rounded text-xs font-mono-num font-extrabold flex items-center justify-center transition cursor-pointer disabled:cursor-not-allowed ${
                  isLiveLocked
                    ? 'bg-[#E5E7EB] text-slate-400'
                    : active
                      ? 'bg-[#0E8A38] text-white shadow-xs'
                      : 'bg-[#E5E7EB] hover:bg-slate-300 text-slate-900'
                }`}
              >
                {isLiveLocked ? (
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  getScaledOdd(match.odds[mkt]).toFixed(2)
                )}
              </button>
            );
          })}

          <div className="flex items-center gap-1">
            {!match.isLive && !isLiveMode && (
              <button
                type="button"
                onClick={() => void toggleRemindMatch(match)}
                title={
                  remindMatchSet.has(match.id)
                    ? bi('ማስታወሻ አንሳ', 'Remove reminder')
                    : bi('ከ15 ደቂቃ በፊት አስታውሰኝ', 'Remind me 15m before kickoff')
                }
                aria-pressed={remindMatchSet.has(match.id)}
                className={`h-10 w-8 rounded border flex items-center justify-center cursor-pointer transition shrink-0 ${
                  remindMatchSet.has(match.id)
                    ? 'bg-amber-50 border-amber-400 text-amber-700'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-600'
                }`}
              >
                {remindMatchSet.has(match.id) ? (
                  <BellRing className="w-4 h-4 text-amber-600" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                playGameSound('click', soundEnabled);
                setStatsMatchId(match.id);
              }}
              title={bi('ስታትስ (H2H · Form · Standings)', 'Match Statistics')}
              className="h-10 w-8 rounded bg-slate-100 hover:bg-[#EAF3ED] border border-slate-200 text-[#0E8A38] flex items-center justify-center cursor-pointer transition shrink-0"
            >
              <BarChart3 className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={placingTicket || isLiveLocked}
              onClick={() => {
                playGameSound('click', soundEnabled);
                setMarketsMatchId(match.id);
              }}
              title={bi('135+ ገበያዎችን ክፈት', 'Open 135+ Markets')}
              className="h-10 flex-1 rounded bg-slate-100 hover:bg-[#9AD84B]/40 border border-slate-200 text-[10px] font-mono-num font-black text-[#0E8A38] flex items-center justify-center cursor-pointer disabled:opacity-45"
            >
              +135
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Reusable Betslip Content (rendered inside Desktop right column & Mobile sheet)
  const renderBetslipBody = () => (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm text-slate-900">
      <div className="bg-[#0E8A38] text-white px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Receipt className="w-4 h-4 text-[#9AD84B] shrink-0" />
          <h3 className="text-sm font-black truncate">
            {bi(`ትኬት (${picks.length})`, `Betslip (${picks.length})`)}
          </h3>
          <span className="text-[10px] font-bold text-[#9AD84B] shrink-0">
            {bi('ያለ ገደብ', 'Unlimited')}
          </span>
        </div>
        {picks.length > 0 && !placingTicket && (
          <button
            type="button"
            onClick={() => setPicks([])}
            className="text-xs font-bold text-[#9AD84B] hover:text-white flex items-center gap-1 cursor-pointer shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{bi('አጽዳ', 'Clear')}</span>
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {syncedPicks.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 space-y-1">
            <p className="font-bold text-slate-800">{bi('ትኬትዎ ባዶ ነው', 'Your betslip is empty')}</p>
            <p>
              {bi(
                'የፈለጉትን ያህል ጨዋታዎች (ያለ ገደብ) 1, X, 2 ወይም +135 ገበያዎችን ይምረጡ',
                'Tap any odd (1, X, 2) or +135 markets — add unlimited matches',
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
            {syncedPicks.map((pick) => (
              <div
                key={pick.match.id}
                className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-slate-900 truncate">
                    {pick.match.home} vs {pick.match.away}
                  </p>
                  <p className="text-[11px] font-semibold text-[#0E8A38] mt-0.5">
                    {pick.match.isLive
                      ? `LIVE ${pick.match.liveMinute}' (${pick.match.liveHomeGoals}-${pick.match.liveAwayGoals}) · `
                      : ''}
                    {getMarketLabel(pick.market)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono-num text-xs font-black text-slate-900 bg-[#E5E7EB] px-2 py-1 rounded">
                    {pick.odd.toFixed(2)}
                  </span>
                  {!placingTicket && (
                    <button
                      type="button"
                      onClick={() => togglePick(pick.match, pick.market)}
                      className="text-slate-400 hover:text-rose-600 cursor-pointer p-1.5"
                      aria-label={bi('አስወግድ', 'Remove')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-3 border-t border-slate-200 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 font-bold">
              {bi('ጠቅላላ ኦድ (ያለ ገደብ)', 'Total Odds (Unlimited)')}
            </span>
            <span className="font-mono-num text-base font-black text-[#0E8A38]">
              {totalOdds > 0 ? `${totalOdds.toFixed(2)}x` : '0.00x'}
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="footballStake" className="text-xs font-bold text-slate-700">
                {bi('የመወራረጃ መጠን (ETB)', 'Stake Amount (ETB)')}
              </label>
              <span className="text-[11px] font-mono-num text-slate-500">
                {minBet.toLocaleString()} ETB – {bi('ያለ ገደብ', 'Unlimited')}
              </span>
            </div>
            <div className="relative">
              <input
                id="footballStake"
                type="number"
                min={minBet}
                step={1}
                value={stakeInput}
                disabled={placingTicket}
                onChange={(e) => setStakeInput(e.target.value)}
                className="w-full bg-white border border-slate-300 focus:border-[#0E8A38] rounded-lg px-3.5 py-2.5 text-base font-mono-num font-black text-slate-900 outline-none pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                ETB
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
                className="py-1.5 rounded bg-[#E5E7EB] hover:bg-slate-300 text-xs font-mono-num font-bold text-slate-900 cursor-pointer"
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
              className="py-1.5 rounded bg-[#9AD84B]/50 hover:bg-[#9AD84B] text-xs font-extrabold text-slate-900 cursor-pointer"
            >
              {bi('ሁሉም', 'Max')}
            </button>
          </div>

          <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <span className="text-slate-600 font-bold">
              {bi('ሊያሸንፉ የሚችሉት (FT)', 'Potential Win (FT)')}
            </span>
            <span className="font-mono-num text-sm font-black text-[#0E8A38]">
              {formatETB(potentialPayout)}
            </span>
          </div>

          <button
            type="button"
            disabled={placingTicket || picks.length === 0}
            onClick={handlePlaceTicket}
            className="w-full py-3 px-4 rounded-lg bg-[#0E8A38] hover:bg-[#0B732E] disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>
              {placingTicket
                ? bi('ትኬት በመቁረጥ ላይ...', 'Placing Bet...')
                : bi(
                    `ትኬት ቁረጥ (${numericStake} ብር)`,
                    `Place Bet (${numericStake} ETB)`,
                  )}
            </span>
          </button>

          {liveTickets.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMobileSlipOpen(false);
                setSubTab('live');
                onChangeSportsSection?.('cashout');
              }}
              className="w-full py-2 px-3 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Radio className="w-4 h-4 text-[#0E8A38]" />
              <span>
                {bi(
                  `${liveTickets.length} ላይቭ ትኬት አለዎት — ካሽአውት`,
                  `${liveTickets.length} Live Ticket(s) — Cashout`,
                )}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const checkBetMatches = useMemo(() => {
    const q = checkBetCode.trim().toLowerCase();
    if (!q) return tickets.slice(0, 10);
    return tickets.filter(
      (t) =>
        t.id.toLowerCase().includes(q) ||
        t.choiceText.toLowerCase().includes(q) ||
        t.picks.some(
          (p) =>
            p.home.toLowerCase().includes(q) || p.away.toLowerCase().includes(q),
        ),
    );
  }, [tickets, checkBetCode]);

  const visibleLeagueRows = topLeagueSectionMatches.slice(0, leagueLimit);
  const visibleLiveRows = liveMatchesList.slice(0, liveLimit);
  const visiblePopularRows = filteredMatches.slice(0, popularLimit);

  return (
    <div className="space-y-4 pb-14 lg:pb-0">
      {/* DARK CHARCOAL SPORTSBOOK UTILITY BAR (Matching Screenshot #1) */}
      <div className="-mx-3 sm:-mx-4 bg-[#26292B] text-white border-b border-black/30">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 grid grid-cols-5 items-stretch text-center">
          <button
            type="button"
            onClick={() => {
              playGameSound('click', soundEnabled);
              setCheckBetOpen(true);
            }}
            className="py-2.5 px-1 flex flex-col items-center justify-center gap-1 hover:bg-white/5 transition cursor-pointer text-[11px] font-semibold text-slate-200"
          >
            <Receipt className="w-4 h-4 text-slate-300" />
            <span className="truncate max-w-full">{bi('ትኬት አረጋግጥ', 'Check Bet')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playGameSound('click', soundEnabled);
              setSearchOpen((prev) => !prev);
            }}
            className={`py-2.5 px-1 flex flex-col items-center justify-center gap-1 transition cursor-pointer text-[11px] font-semibold ${
              searchOpen || searchQuery ? 'bg-white/10 text-[#9AD84B]' : 'hover:bg-white/5 text-slate-200'
            }`}
          >
            <Search className="w-4 h-4" />
            <span className="truncate max-w-full">{bi('ጨዋታ ፈልግ', 'Search Event')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playGameSound('click', soundEnabled);
              setSubTab('fixtures');
              setTimeframeFilter('live');
              setDayFilter('all');
              setOnlyMyBets(false);
              onChangeSportsSection?.('live');
              window.setTimeout(() => {
                liveEventsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 80);
            }}
            className={`py-2.5 px-1 flex flex-col items-center justify-center gap-1 transition cursor-pointer text-[11px] font-semibold relative ${
              timeframeFilter === 'live' && subTab === 'fixtures'
                ? 'bg-white/10 text-[#9AD84B]'
                : 'hover:bg-white/5 text-slate-200'
            }`}
          >
            <Timer className="w-4 h-4" />
            <span className="truncate max-w-full">{bi('ቀጥታ', 'IN-PLAY')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playGameSound('click', soundEnabled);
              setSubTab('fixtures');
              setTimeframeFilter('all');
              setDayFilter('all');
              setLeagueFilter('all');
              setOnlyMyBets(false);
              onChangeSportsSection?.('sport');
            }}
            className={`py-2.5 px-1 flex flex-col items-center justify-center gap-1 transition cursor-pointer text-[11px] font-semibold relative ${
              subTab === 'fixtures' && timeframeFilter === 'all' && !onlyMyBets
                ? 'bg-white/10 text-[#9AD84B]'
                : 'hover:bg-white/5 text-slate-200'
            }`}
          >
            <span className="relative inline-flex">
              <Trophy className="w-4 h-4" />
              <span className="ml-1 font-mono-num text-[10px] font-black text-[#9AD84B]">
                {scheduleMatches.length}
              </span>
            </span>
            <span className="truncate max-w-full">{bi('እግር ኳስ', 'Football')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playGameSound('click', soundEnabled);
              setSubTab('fixtures');
              const next = !onlyMyBets;
              setOnlyMyBets(next);
              if (next && timeframeFilter === 'live') {
                setTimeframeFilter('all');
              }
            }}
            className={`py-2.5 px-1 flex flex-col items-center justify-center gap-1 transition cursor-pointer text-[11px] font-semibold ${
              onlyMyBets ? 'bg-[#0E8A38] text-white' : 'hover:bg-white/5 text-slate-200'
            }`}
          >
            <span className="inline-flex items-center">
              <CheckCircle2 className="w-4 h-4" />
              <span className="ml-1 font-mono-num text-[10px] font-black text-[#9AD84B]">
                {upcomingBettedCount}
              </span>
            </span>
            <span className="truncate max-w-full">{bi('ውርርዶቼ', 'My Bets')}</span>
          </button>
        </div>

        {/* Inline Event Search Input */}
        {searchOpen && (
          <div className="max-w-7xl mx-auto px-3 pb-3">
            <div className="relative flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={bi(
                  'ቡድን ወይም ሊግ ይፈልጉ (ለምሳሌ Arsenal, Ethiopia, Barcelona, Premier League...)',
                  'Search team or league (e.g. Arsenal, Ethiopia, Barcelona, Premier League...)',
                )}
                className="w-full bg-[#181A1B] border border-slate-600 focus:border-[#9AD84B] rounded-lg pl-9 pr-9 py-2 text-xs sm:text-sm text-white outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 text-slate-400 hover:text-white cursor-pointer"
                  aria-label={bi('አጽዳ', 'Clear')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Zero-Balance Telebirr Notice */}
      {wallet.balance < 1 && (
        <div className="bg-white border border-amber-400 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="space-y-0.5">
            <h3 className="text-sm font-black text-slate-900">
              {bi(
                'ለእግር ኳስ ቤቲንግ መጀመሪያ በቴሌብር ዲፖሲት ያድርጉ',
                'Deposit via Telebirr to start betting',
              )}
            </h3>
            <p className="text-xs text-slate-600">
              {bi(
                'ቀሪ ሂሳብዎ 0.00 ብር ነው። ዝቅተኛው 100 ብር በቴሌብር ዲፖሲት አድርገው መወራረድ ይችላሉ።',
                'Your balance is 0.00 ETB. Deposit minimum 100 ETB with Telebirr.',
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToDeposit}
            className="shrink-0 px-4 py-2 rounded-lg bg-[#0E8A38] hover:bg-[#0B732E] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
          >
            <Wallet className="w-4 h-4" />
            <span>{bi('አሁን ዲፖሲት አድርግ', 'Deposit Now')}</span>
          </button>
        </div>
      )}

      {/* Compact Sub-View Toolbar (Fixtures / Live Cashout / Rules / BeSoccer Sync) */}
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 sm:px-4 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              playGameSound('click', soundEnabled);
              setSubTab('fixtures');
              onChangeSportsSection?.('sport');
            }}
            className={`px-3 py-2 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              subTab === 'fixtures'
                ? 'bg-[#0E8A38] text-white'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            <span>
              {bi('ፕሮግራም', 'Fixtures')} ({scheduleMatches.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              playGameSound('click', soundEnabled);
              setSubTab('live');
              onChangeSportsSection?.('cashout');
            }}
            className={`px-3 py-2 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              subTab === 'live'
                ? 'bg-[#0E8A38] text-white'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>
              {bi('ላይቭ & ካሽአውት', 'Live & Cashout')} ({liveTickets.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              playGameSound('click', soundEnabled);
              setSubTab('rules');
            }}
            className={`px-3 py-2 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              subTab === 'rules'
                ? 'bg-[#0E8A38] text-white'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{bi('የጨዋታ እና አቆማመር ህግ', 'Rules & How To Bet')}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {syncedMatchesCount > 0 && (
            <span
              title={providerLabel}
              className="hidden md:inline font-mono-num text-[11px] font-bold text-[#0E8A38] max-w-[240px] truncate"
            >
              {syncedMatchesCount} {bi('አሁናዊ', 'Synced')} · {providerLabel}
            </span>
          )}
          <button
            type="button"
            disabled={syncingSchedule}
            onClick={() => {
              playGameSound('click', soundEnabled);
              void loadLiveSchedule(true, true);
              void syncLiveResultsFromProvider(false);
            }}
            className="px-2.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[11px] font-extrabold text-[#0E8A38] flex items-center gap-1 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingSchedule ? 'animate-spin' : ''}`} />
            <span>{syncingSchedule ? bi('በማደስ ላይ...', 'Syncing...') : bi('ፕሮግራም አድስ', 'Sync')}</span>
          </button>

          <a
            href="https://www.besoccer.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[11px] font-bold text-slate-700 flex items-center gap-1 transition whitespace-nowrap"
          >
            <span>BeSoccer</span>
            <ExternalLink className="w-3 h-3 text-[#0E8A38]" />
          </a>

          <button
            type="button"
            onClick={onToggleSound}
            title={soundEnabled ? bi('ድምጽ አጥፋ', 'Mute') : bi('ድምጽ አብራ', 'Unmute')}
            className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center text-slate-700 cursor-pointer"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-[#0E8A38]" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* 15-Minute Pre-Match Push Notifications & Remind Me Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 sm:px-4 flex flex-wrap items-center justify-between gap-2 shadow-2xs text-xs">
        <div className="flex items-center gap-2 min-w-0">
          {pushEnabled ? (
            <BellRing className="w-4 h-4 text-[#0E8A38] shrink-0" />
          ) : (
            <BellOff className="w-4 h-4 text-slate-400 shrink-0" />
          )}
          <span className="font-bold text-slate-800 truncate">
            {bi(
              `ከጨዋታ መጀመር 15 ደቂቃ በፊት ማንቂያ (${remindMatchIds.length} Remind Me · ${upcomingBettedCount} ውርርድ)`,
              `15m Pre-Match Alerts (${remindMatchIds.length} Remind Me · ${upcomingBettedCount} Betted)`,
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => void handleTogglePushEnabled()}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-extrabold cursor-pointer transition ${
              pushEnabled
                ? 'bg-[#EAF3ED] border-[#0E8A38]/40 text-[#0E8A38]'
                : 'bg-slate-100 border-slate-200 text-slate-600'
            }`}
          >
            {pushEnabled ? bi('ማንቂያ: በርቷል', 'Alerts: ON') : bi('ማንቂያ: ጠፍቷል', 'Alerts: OFF')}
          </button>

          {browserPerm !== 'granted' && browserPerm !== 'unsupported' && (
            <button
              type="button"
              onClick={() => void handleEnableBrowserPush()}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold cursor-pointer transition"
            >
              {bi('የስልክ Push ፍቀድ', 'Enable Browser Push')}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const target =
                scheduleMatches.find((m) => !m.isLive && (remindMatchSet.has(m.id) || getUserBetInfo(m))) ||
                scheduleMatches.find((m) => !m.isLive);
              if (target) {
                firePreMatchAlert(target, 15, 'preview');
              }
            }}
            className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold cursor-pointer transition"
          >
            {bi('ማንቂያ ሞክር', 'Test 15m Alert')}
          </button>
        </div>
      </div>

      {/* Dismissible Live Pre-Match 15-Min Alert Banner */}
      {activePreMatchAlerts.length > 0 && (
        <div
          role="alert"
          className="bg-amber-50 border-2 border-amber-400 rounded-xl p-3 sm:p-3.5 space-y-2 shadow-sm"
        >
          {activePreMatchAlerts.map((al) => (
            <div key={al.id} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <BellRing className="w-5 h-5 text-amber-600 shrink-0 animate-bounce" />
                <div className="min-w-0 text-xs">
                  <p className="font-black text-slate-900 truncate">
                    {bi(
                      `ጨዋታው ሊጀምር ${al.minutesRemaining} ደቂቃ ቀረው — ${al.home} vs ${al.away}`,
                      `Kickoff in ${al.minutesRemaining} min — ${al.home} vs ${al.away}`,
                    )}
                  </p>
                  <p className="text-[11px] text-amber-900 font-semibold truncate">
                    {al.leagueLabel} ·{' '}
                    {al.reason === 'bet_placed'
                      ? bi('የተወራረዱበት ጨዋታ', 'Your placed bet match')
                      : bi('አስታውሰኝ (Remind me)', 'Remind me alert')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setActivePreMatchAlerts((prev) => prev.filter((item) => item.id !== al.id))
                }
                aria-label={bi('ዝጋ', 'Dismiss')}
                className="w-8 h-8 rounded-lg bg-white hover:bg-amber-100 border border-amber-200 flex items-center justify-center text-slate-700 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* TAB 1: SPORTSBOOK FIXTURES BOARD */}
      {subTab === 'fixtures' && (
        <div className="space-y-4">
          {/* DEDICATED SEARCH BAR FOR UPCOMING SECTION (Team or League Filter) */}
          {sportsSection === 'upcoming' && (
            <section
              aria-label={bi('ቀጣይ ጨዋታዎች መፈለጊያ', 'Upcoming Matches Search')}
              className="bg-white border-2 border-[#0E8A38]/30 rounded-xl p-3.5 sm:p-4 shadow-xs space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-[#0E8A38] shrink-0" />
                  <h2 className="text-sm sm:text-base font-black text-slate-900">
                    {bi(
                      'ቀጣይ 7 ቀን ጨዋታዎች · በቡድን ወይም በሊግ ይፈልጉ',
                      'Upcoming Matches · Search by Team or League',
                    )}
                  </h2>
                </div>
                <span className="font-mono-num text-xs font-extrabold text-[#0E8A38]">
                  {filteredMatches.length} {bi('ጨዋታ ተገኝቷል', 'upcoming matches')}
                </span>
              </div>

              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  id="upcomingMatchSearchInput"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={bi(
                    'የቡድን ስም ወይም ሊግ ይጻፉ (ለምሳሌ Arsenal, Premier League, Ethiopia, Real Madrid)...',
                    'Search upcoming football matches by team name or league (e.g. Arsenal, Premier League, Ethiopia)...',
                  )}
                  className="w-full bg-[#F8FAFC] border border-slate-300 focus:border-[#0E8A38] focus:bg-white rounded-lg pl-9 pr-16 py-2.5 text-xs sm:text-sm font-medium text-slate-900 outline-none transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    aria-label={bi('ፍለጋ አጽዳ', 'Clear search')}
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{bi('አጽዳ', 'Clear')}</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[11px]">
                <span className="text-slate-500 font-bold shrink-0">
                  {bi('ፈጣን ፍለጋ:', 'Quick:')}{' '}
                </span>
                {[
                  'Premier League',
                  'Champions League',
                  'La Liga',
                  'Ethiopia',
                  'Arsenal',
                  'Barcelona',
                ].map((term) => {
                  const active = searchQuery.trim().toLowerCase() === term.toLowerCase();
                  return (
                    <button
                      key={term}
                      type="button"
                      onClick={() => {
                        playGameSound('click', soundEnabled);
                        setSearchQuery(active ? '' : term);
                      }}
                      className={`px-2.5 py-1 rounded font-bold whitespace-nowrap shrink-0 cursor-pointer transition ${
                        active
                          ? 'bg-[#0E8A38] text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {term}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Hero Stadium Spotlight Banner */}
          <section className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm min-h-[155px] sm:min-h-[190px] flex items-end bg-slate-900">
            <img
              src="/src/assets/images/sportsbook_stadium_banner_1794733915064.jpg"
              alt={bi('እድል ቤት ስታዲየም', 'Edil Bet Football Stadium')}
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/25" />
            <div className="relative z-10 w-full p-4 sm:p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="space-y-1 max-w-xl">
                <p className="text-[11px] font-extrabold text-[#9AD84B]">
                  {bi(
                    '7-ቀን BeSoccer ፕሮግራም · 135+ ገበያዎች · ቀጥታ ካሽአውት',
                    '7-Day BeSoccer Schedule · 135+ Markets · Instant Live Cashout',
                  )}
                </p>
                <h2
                  className="text-xl sm:text-2xl font-black text-white leading-tight"
                  style={{ textWrap: 'balance' }}
                >
                  {bi(
                    'እድል ቤት · ፕሮፌሽናል የእግር ኳስ ቤቲንግ',
                    'Edil Bet · Professional Football Sportsbook',
                  )}
                </h2>
                <p className="text-xs text-slate-200">
                  {bi(
                    '1X2፣ Double Chance፣ Over/Under፣ GG/NG፣ 1st Half፣ Multigoals እና ካሽአውት በቀጥታ።',
                    'Bet on Ethiopia PL, Premier League, Champions League, La Liga & International fixtures.',
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  topMatchesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="self-start sm:self-end px-4 py-2.5 rounded-lg bg-white hover:bg-[#9AD84B] text-[#0E8A38] hover:text-slate-950 font-black text-xs sm:text-sm transition cursor-pointer whitespace-nowrap shadow-sm"
              >
                {bi('አሁን ተወራረድ', 'BET NOW')}
              </button>
            </div>
          </section>

          {/* TOP MATCHES HORIZONTAL CAROUSEL (Matching Screenshot #1) */}
          <section
            ref={topMatchesRef}
            className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs"
          >
            <div className="bg-[#0E8A38] text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <h3 className="text-sm font-extrabold flex items-center gap-2">
                  <span aria-hidden="true" className="text-[#9AD84B] tracking-widest text-xs">
                    •••
                  </span>
                  <span>{bi('ዋና ጨዋታዎች · Online Real Program', 'Top Matches · Online Program')}</span>
                </h3>
                <span className="text-[11px] font-semibold text-emerald-100 truncate">
                  ({providerLabel})
                </span>
              </div>
              <div className="flex items-center gap-2">
                {liveMatchesCount > 0 && (
                  <span className="text-[11px] font-mono-num font-black text-[#9AD84B] flex items-center gap-1">
                    <Radio className="w-3.5 h-3.5" />
                    {liveMatchesCount} LIVE
                  </span>
                )}
                <span className="text-[11px] font-mono-num text-emerald-100">
                  {syncedMatchesCount > 0
                    ? `${syncedMatchesCount} ${bi('ኦንላይን ጨዋታ', 'online')}`
                    : `${topMatchesCarousel.length} ${bi('ጨዋታ', 'matches')}`}
                </span>
                <button
                  type="button"
                  disabled={syncingSchedule}
                  onClick={() => {
                    void loadLiveSchedule(true, true);
                    void syncLiveResultsFromProvider(false);
                  }}
                  className="px-2 py-1 rounded bg-black/25 hover:bg-black/40 text-[11px] font-bold text-white cursor-pointer disabled:opacity-50 transition"
                >
                  {syncingSchedule ? bi('በማደስ ላይ...', 'Syncing...') : bi('አድስ', 'Refresh')}
                </button>
              </div>
            </div>

            {!scheduleLoaded && scheduleMatches.length === 0 ? (
              <div className="p-6 text-center text-xs font-bold text-slate-600 bg-[#F3F4F6]">
                {bi(
                  'ትክክለኛ የኦንላይን የእግር ኳስ ፕሮግራም ከቀጥታ API ሰርቨር በመጫን ላይ ነው...',
                  'Loading real-time online football schedule, odds & live matches...',
                )}
              </div>
            ) : (
            <div className="p-3 bg-[#F3F4F6] flex gap-3 overflow-x-auto snap-x no-scrollbar">
              {topMatchesCarousel.map((match) => {
                const selectedPick = picks.find((p) => p.match.id === match.id);
                const isLiveLocked = match.isLive && (match.liveMinute ?? 0) >= 86;
                return (
                  <article
                    key={`top_${match.id}`}
                    className="w-[84vw] max-w-[300px] sm:w-[300px] snap-start bg-white border border-slate-200 rounded-lg p-3 space-y-2.5 shrink-0"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-bold text-slate-700 truncate max-w-[58%]">
                        {match.leagueLabel}
                      </span>
                      <span
                        className={`font-mono-num font-bold shrink-0 ${
                          match.isLive ? 'text-[#0E8A38]' : 'text-slate-500'
                        }`}
                      >
                        {match.kickoffLabel}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={placingTicket || isLiveLocked}
                      onClick={() => {
                        playGameSound('click', soundEnabled);
                        setMarketsMatchId(match.id);
                      }}
                      title={bi('ሁሉንም የመቆመር ዘዴዎች ክፈት', 'Click match to choose from 135+ betting styles')}
                      className="w-full flex items-center justify-between gap-2 py-1.5 px-1 rounded-lg hover:bg-[#EAF3ED]/60 transition cursor-pointer disabled:cursor-not-allowed group"
                    >
                      <div className="flex flex-col items-center text-center gap-1 flex-1 min-w-0">
                        <TeamBadge
                          code={match.homeCode}
                          logo={match.homeLogo}
                          name={match.home}
                        />
                        <span className="text-xs font-extrabold text-slate-900 group-hover:text-[#0E8A38] transition truncate max-w-full">
                          {match.home}
                        </span>
                      </div>

                      <div className="shrink-0 text-center px-1">
                        {match.isLive ? (
                          <span className="font-mono-num text-sm font-black text-[#0E8A38]">
                            {match.liveHomeGoals ?? 0} - {match.liveAwayGoals ?? 0}
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">vs</span>
                        )}
                      </div>

                      <div className="flex flex-col items-center text-center gap-1 flex-1 min-w-0">
                        <TeamBadge
                          code={match.awayCode}
                          logo={match.awayLogo}
                          name={match.away}
                        />
                        <span className="text-xs font-extrabold text-slate-900 group-hover:text-[#0E8A38] transition truncate max-w-full">
                          {match.away}
                        </span>
                      </div>
                    </button>

                    <div className="border-t border-slate-100 pt-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span className="font-semibold truncate">
                          {bi('የጨዋታ ውጤት', 'Match Result')}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              playGameSound('click', soundEnabled);
                              setStatsMatchId(match.id);
                            }}
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-[#EAF3ED] border border-slate-200 text-[#0E8A38] font-black text-[10px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <BarChart3 className="w-3 h-3" />
                            <span>Stats</span>
                          </button>
                          <button
                            type="button"
                            disabled={placingTicket || isLiveLocked}
                            onClick={() => {
                              playGameSound('click', soundEnabled);
                              setMarketsMatchId(match.id);
                            }}
                            className="font-mono-num font-extrabold text-[#0E8A38] hover:underline cursor-pointer"
                          >
                            +135
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            ['1', bi('ባለሜዳ', 'Home')],
                            ['X', bi('አቻ', 'Draw')],
                            ['2', bi('እንግዳ', 'Away')],
                          ] as const
                        ).map(([mkt, label]) => {
                          const active = selectedPick?.market === mkt;
                          return (
                            <button
                              key={mkt}
                              type="button"
                              disabled={placingTicket || isLiveLocked}
                              onClick={() => togglePick(match, mkt)}
                              className={`min-h-[42px] px-2 rounded text-[11px] flex items-center justify-between gap-1 transition cursor-pointer disabled:opacity-45 ${
                                active
                                  ? 'bg-[#0E8A38] text-white font-black'
                                  : 'bg-[#E5E7EB] hover:bg-slate-300 text-slate-900 font-bold'
                              }`}
                            >
                              <span className="truncate">{label}</span>
                              <span className="font-mono-num font-black shrink-0">
                                {getScaledOdd(match.odds[mkt]).toFixed(2)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            )}
          </section>

          {/* MAIN 2-COLUMN SPORTSBOOK BOARD + BETSLIP */}
          <div className="grid lg:grid-cols-12 gap-4 items-start">
            {/* LEFT 8 COLS: SPORTSBOOK TABLES */}
            <div className="lg:col-span-8 space-y-4">
              {/* SECTION 1: TOP LEAGUES (Matching Screenshot #2) */}
              <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="bg-[#0E8A38] text-white px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-extrabold flex items-center gap-2">
                    <span aria-hidden="true" className="text-[#9AD84B] tracking-widest text-xs">
                      •••
                    </span>
                    <span>{bi('ዋና ሊጎች · Top Leagues', 'Top Leagues')}</span>
                  </h3>

                  <div className="flex items-center gap-1.5 flex-wrap">
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
                        className={`px-2.5 py-1 rounded text-[11px] font-extrabold transition cursor-pointer whitespace-nowrap ${
                          tierFilter === tier.id
                            ? 'bg-[#9AD84B] text-slate-950'
                            : 'bg-black/20 text-white hover:bg-black/30'
                        }`}
                      >
                        {tier.id === 'all' ? bi('ሁሉም', 'All') : `Tier ${tier.id}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Horizontal League Switcher Strip (Active = #9AD84B Lime) */}
                <div className="p-2.5 bg-[#F3F4F6] border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
                  {LEAGUE_OPTIONS.filter(
                    (l) => l.id === 'all' || tierFilter === 'all' || l.tier === tierFilter,
                  ).map((league) => {
                    const active = leagueFilter === league.id;
                    return (
                      <button
                        key={league.id}
                        type="button"
                        onClick={() => {
                          playGameSound('click', soundEnabled);
                          setLeagueFilter(league.id);
                        }}
                        className={`px-3.5 py-2.5 rounded-lg text-xs font-extrabold whitespace-nowrap shrink-0 transition cursor-pointer border ${
                          active
                            ? 'bg-[#9AD84B] border-[#7EC135] text-slate-950 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-800 hover:border-[#0E8A38]/50'
                        }`}
                      >
                        {league.id === 'all' ? bi('ሁሉም ሊጎች', 'All Leagues') : league.label}
                      </button>
                    );
                  })}
                </div>

                {/* Table Column Headers */}
                <div className="sm:hidden px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-600">
                  <span>{bi('ጨዋታዎች እና የ1 / X / 2 ኦዶች', 'Matches & 1 / X / 2 Odds')}</span>
                  <span>{bi('ስታትስ / +135', 'Stats / +135')}</span>
                </div>
                <div className="hidden sm:grid sm:grid-cols-[64px_1fr_repeat(3,64px)_118px] items-center gap-1 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                  <span>{bi('ሰዓት', 'Time')}</span>
                  <span>{bi('ጨዋታ', 'Event')}</span>
                  <span className="text-center">{bi('1', 'Home')}</span>
                  <span className="text-center">{bi('X', 'Draw')}</span>
                  <span className="text-center">{bi('2', 'Away')}</span>
                  <span className="text-center">{bi('አስታውስ/+', 'Alert/+')}</span>
                </div>

                {visibleLeagueRows.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-600 space-y-2">
                    <p>{bi('በዚህ ሊግ ውስጥ ጨዋታ አልተገኘም', 'No matches found for this filter.')}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setOnlyMyBets(false);
                        setTierFilter('all');
                        setLeagueFilter('all');
                        setSearchQuery('');
                      }}
                      className="px-3.5 py-1.5 rounded bg-[#0E8A38] text-white font-bold cursor-pointer"
                    >
                      {bi('ሁሉንም አሳይ', 'Reset Filters')}
                    </button>
                  </div>
                ) : (
                  <div>
                    {groupMatchesByDate(visibleLeagueRows).map((dateGroup) => (
                      <div key={`lg_${dateGroup.dateKey}`}>
                        <div className="px-3 py-1.5 bg-[#EAF3ED] border-b border-slate-200 text-xs font-extrabold text-[#0E8A38] font-mono-num">
                          {dateGroup.label}
                        </div>
                        {dateGroup.matches.map((m) => renderSportsbookTableRow(m, m.isLive))}
                      </div>
                    ))}
                  </div>
                )}

                {topLeagueSectionMatches.length > 6 && (
                  <div className="flex border-t border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      onClick={() =>
                        setLeagueLimit((prev) =>
                          prev >= topLeagueSectionMatches.length ? 6 : prev + 10,
                        )
                      }
                      className="flex-1 py-2.5 hover:bg-slate-100 text-xs font-extrabold text-slate-700 flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <span>
                        {leagueLimit >= topLeagueSectionMatches.length
                          ? bi('አሳንስ', 'Show less')
                          : `${bi('ተጨማሪ አሳይ', 'Show more')} (${topLeagueSectionMatches.length - visibleLeagueRows.length})`}
                      </span>
                      {leagueLimit >= topLeagueSectionMatches.length ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    {leagueLimit < topLeagueSectionMatches.length && (
                      <button
                        type="button"
                        onClick={() => setLeagueLimit(topLeagueSectionMatches.length)}
                        className="px-4 py-2.5 border-l border-slate-200 hover:bg-slate-100 text-xs font-black text-[#0E8A38] cursor-pointer transition whitespace-nowrap"
                      >
                        {bi(`ሁሉንም (${topLeagueSectionMatches.length})`, `All (${topLeagueSectionMatches.length})`)}
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* SECTION 2: LIVE EVENTS TABLE (Hidden when specifically browsing Upcoming) */}
              {sportsSection !== 'upcoming' && (
                <section
                  ref={liveEventsRef}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs"
                >
                  <div className="bg-[#0E8A38] text-white px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-extrabold flex items-center gap-2">
                      <span aria-hidden="true" className="text-[#9AD84B] tracking-widest text-xs">
                        •••
                      </span>
                      <span>{bi('ቀጥታ ጨዋታዎች · Live Events', 'Live Events')}</span>
                    </h3>
                    <span className="px-2.5 py-0.5 rounded bg-[#9AD84B] text-slate-950 font-mono-num text-[11px] font-black">
                      {liveMatchesList.length} LIVE
                    </span>
                  </div>

                  <div className="sm:hidden px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-600">
                    <span>{bi('ቀጥታ ውጤት እና ኦዶች', 'Live Score & 1 / X / 2')}</span>
                    <span>{bi('ስታትስ / +135', 'Stats / +135')}</span>
                  </div>
                  <div className="hidden sm:grid sm:grid-cols-[64px_1fr_repeat(3,64px)_118px] items-center gap-1 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                    <span>{bi('ውጤት', 'Score')}</span>
                    <span>{bi('ጨዋታ', 'Event')}</span>
                    <span className="text-center">{bi('1', 'Home')}</span>
                    <span className="text-center">{bi('X', 'Draw')}</span>
                    <span className="text-center">{bi('2', 'Away')}</span>
                    <span className="text-center">{bi('ስታትስ', 'Stats/+')}</span>
                  </div>

                  {visibleLiveRows.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-600 space-y-2">
                      <p className="font-semibold text-slate-700">
                        {bi(
                          'በዚህ ሰዓት በቀጥታ እየተካሄደ ያለ ኦንላይን ጨዋታ የለም — የዛሬ እና የ7 ቀናት ኦንላይን ፕሮግራሞች ላይ በቀጥታ መወራረድ ይችላሉ።',
                          'No live online matches in progress right at this minute — place your bets on today’s & 7-day real online fixtures above/below.',
                        )}
                      </p>
                    </div>
                  ) : (
                    <div>{visibleLiveRows.map((m) => renderSportsbookTableRow(m, true))}</div>
                  )}

                  {liveMatchesList.length > 7 && (
                    <div className="flex border-t border-slate-200 bg-slate-50">
                      <button
                        type="button"
                        onClick={() =>
                          setLiveLimit((prev) =>
                            prev >= liveMatchesList.length ? 7 : prev + 12,
                          )
                        }
                        className="flex-1 py-2.5 hover:bg-slate-100 text-xs font-extrabold text-slate-700 flex items-center justify-center gap-1 cursor-pointer transition"
                      >
                        <span>
                          {liveLimit >= liveMatchesList.length
                            ? bi('አሳንስ', 'Show less')
                            : `${bi('ተጨማሪ አሳይ', 'Show more')} (${liveMatchesList.length - visibleLiveRows.length})`}
                        </span>
                      </button>
                      {liveLimit < liveMatchesList.length && (
                        <button
                          type="button"
                          onClick={() => setLiveLimit(liveMatchesList.length)}
                          className="px-4 py-2.5 border-l border-slate-200 hover:bg-slate-100 text-xs font-black text-[#0E8A38] cursor-pointer transition whitespace-nowrap"
                        >
                          {bi(`ሁሉንም (${liveMatchesList.length})`, `All (${liveMatchesList.length})`)}
                        </button>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* SECTION 3: 7-DAY SCHEDULE & POPULAR MATCHES (Matching Screenshots #3 & #4) */}
              <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="bg-[#0E8A38] text-white px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-extrabold flex items-center gap-2">
                    <span aria-hidden="true" className="text-[#9AD84B] tracking-widest text-xs">
                      •••
                    </span>
                    <span>
                      {bi(
                        'ተወዳጅ እና የ7 ቀናት ፕሮግራም · 7-Day Program',
                        'Popular Matches & 7-Day Schedule',
                      )}
                    </span>
                  </h3>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={onlyMyBets}
                    onClick={() => {
                      playGameSound('click', soundEnabled);
                      const next = !onlyMyBets;
                      setOnlyMyBets(next);
                      if (next && timeframeFilter === 'live') setTimeframeFilter('all');
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-extrabold flex items-center gap-1.5 cursor-pointer transition ${
                      onlyMyBets
                        ? 'bg-[#9AD84B] text-slate-950'
                        : 'bg-black/25 text-white hover:bg-black/35'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {bi('የተወራረድኩባቸው ብቻ', 'My Betted Only')} ({upcomingBettedCount})
                    </span>
                  </button>
                </div>

                {/* 7-Day Calendar & Timeframe Filter Strip */}
                <div className="p-2.5 bg-[#F8FAFC] border-b border-slate-200 space-y-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                    <button
                      type="button"
                      onClick={() => {
                        playGameSound('click', soundEnabled);
                        setDayFilter('all');
                      }}
                      className={`px-3 py-1.5 rounded text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer ${
                        dayFilter === 'all'
                          ? 'bg-[#0E8A38] text-white'
                          : 'bg-white border border-slate-200 text-slate-700 hover:border-[#0E8A38]'
                      }`}
                    >
                      {bi('ቀጣይ 7 ቀናት', 'Next 7 Days')}
                    </button>
                    {next7Days.map((day) => (
                      <button
                        key={day.dateKey}
                        type="button"
                        onClick={() => {
                          playGameSound('click', soundEnabled);
                          setDayFilter(day.dateKey);
                          setTimeframeFilter('all');
                        }}
                        className={`px-2.5 py-1.5 rounded text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
                          dayFilter === day.dateKey
                            ? 'bg-[#9AD84B] text-slate-950 font-black'
                            : 'bg-white border border-slate-200 text-slate-700 hover:border-[#0E8A38]'
                        }`}
                      >
                        <span>{day.shortLabel}</span>
                        <span className="font-mono-num opacity-75">
                          ({dayCounts[day.dateKey] || 0})
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {TIMEFRAME_OPTIONS.map((tf) => (
                      <button
                        key={tf.id}
                        type="button"
                        onClick={() => {
                          playGameSound('click', soundEnabled);
                          setTimeframeFilter(tf.id);
                          if (tf.id !== 'all') setDayFilter('all');
                        }}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer ${
                          timeframeFilter === tf.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-200/70 text-slate-700 hover:bg-slate-300'
                        }`}
                      >
                        {tf.label} ({timeframeCounts[tf.id]})
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sm:hidden px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-600">
                  <span>{bi('ጨዋታዎች እና የ1 / X / 2 ኦዶች', 'Matches & 1 / X / 2 Odds')}</span>
                  <span>{bi('ስታትስ / +135', 'Stats / +135')}</span>
                </div>
                <div className="hidden sm:grid sm:grid-cols-[64px_1fr_repeat(3,64px)_118px] items-center gap-1 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                  <span>{bi('ሰዓት', 'Time')}</span>
                  <span>{bi('ጨዋታ', 'Event')}</span>
                  <span className="text-center">{bi('1', 'Home')}</span>
                  <span className="text-center">{bi('X', 'Draw')}</span>
                  <span className="text-center">{bi('2', 'Away')}</span>
                  <span className="text-center">{bi('አስታውስ/+', 'Alert/+')}</span>
                </div>

                {visiblePopularRows.length === 0 ? (
                  <div className="p-8 text-center space-y-2 text-xs text-slate-700">
                    <p className="font-bold">
                      {onlyMyBets
                        ? bi(
                            'ውርርድ የቆረጡበት ቀጣይ ጨዋታ አልተገኘም',
                            'No upcoming betted matches match these filters',
                          )
                        : bi('በዚህ ማጣሪያ ውስጥ ጨዋታ አልተገኘም', 'No matches found')}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setOnlyMyBets(false);
                        setTimeframeFilter('all');
                        setDayFilter('all');
                        setTierFilter('all');
                        setLeagueFilter('all');
                        setSearchQuery('');
                      }}
                      className="px-4 py-2 rounded bg-[#0E8A38] text-white font-bold cursor-pointer"
                    >
                      {bi('ሁሉንም ጨዋታዎች አሳይ', 'Show All Matches')}
                    </button>
                  </div>
                ) : (
                  <div>
                    {groupMatchesByDate(visiblePopularRows).map((dateGroup) => (
                      <div key={`pop_${dateGroup.dateKey}`}>
                        <div className="px-3 py-1.5 bg-[#EAF3ED] border-b border-slate-200 text-xs font-extrabold text-[#0E8A38] font-mono-num">
                          {dateGroup.label}
                        </div>
                        {dateGroup.matches.map((m) => renderSportsbookTableRow(m, m.isLive))}
                      </div>
                    ))}
                  </div>
                )}

                {filteredMatches.length > 10 && (
                  <div className="flex border-t border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      onClick={() =>
                        setPopularLimit((prev) =>
                          prev >= filteredMatches.length ? 10 : prev + 15,
                        )
                      }
                      className="flex-1 py-2.5 hover:bg-slate-100 text-xs font-extrabold text-slate-700 flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <span>
                        {popularLimit >= filteredMatches.length
                          ? bi('አሳንስ', 'Show less')
                          : `${bi('ተጨማሪ አሳይ', 'Show more')} (${filteredMatches.length - visiblePopularRows.length})`}
                      </span>
                      {popularLimit >= filteredMatches.length ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    {popularLimit < filteredMatches.length && (
                      <button
                        type="button"
                        onClick={() => setPopularLimit(filteredMatches.length)}
                        className="px-4 py-2.5 border-l border-slate-200 hover:bg-slate-100 text-xs font-black text-[#0E8A38] cursor-pointer transition whitespace-nowrap"
                      >
                        {bi(`ሁሉንም (${filteredMatches.length})`, `All (${filteredMatches.length})`)}
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* MOST-BET TEAMS & WIN PROBABILITY */}
              <FootballMostBet
                matches={scheduleMatches}
                popularity={popularity}
                selectedPicksByMatch={selectedPicksByMatch}
                disabled={placingTicket}
                onQuickPick={togglePick}
                onOpenMarkets={(m) => {
                  playGameSound('click', soundEnabled);
                  setMarketsMatchId(m.id);
                }}
                onOpenStats={(m) => {
                  playGameSound('click', soundEnabled);
                  setStatsMatchId(m.id);
                }}
              />
            </div>

            {/* RIGHT 4 COLS: STICKY DESKTOP BETSLIP */}
            <aside className="hidden lg:block lg:col-span-4 lg:sticky lg:top-28">
              {renderBetslipBody()}
            </aside>
          </div>
        </div>
      )}

      {/* TAB 2: LIVE MATCH & CASHOUT CENTER */}
      {subTab === 'live' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setSubTab('fixtures');
                onChangeSportsSection?.('sport');
              }}
              className="min-h-[42px] px-3.5 py-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-black flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
            >
              <ArrowLeft className="w-4 h-4 text-[#0E8A38]" />
              <span>{bi('ወደ ጨዋታዎች ተመለስ', 'Back to Matches')}</span>
            </button>

            <div className="flex items-center gap-2">
              {lastResultsSyncAt && (
                <span className="hidden sm:inline text-[11px] font-mono-num text-slate-500">
                  {bi('ውጤት ታድሷል', 'Synced')} · {new Date(lastResultsSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button
                type="button"
                disabled={resultsSyncing}
                onClick={() => {
                  playGameSound('click', soundEnabled);
                  void syncLiveResultsFromProvider(true);
                }}
                className="min-h-[42px] px-3.5 py-2 rounded-lg bg-white hover:bg-emerald-50 border border-slate-200 text-[#0E8A38] text-xs font-black flex items-center gap-1.5 cursor-pointer transition shadow-2xs disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resultsSyncing ? 'animate-spin' : ''}`} />
                <span>{resultsSyncing ? bi('ውጤት በማምጣት ላይ...', 'Syncing Results...') : bi('ቀጥታ ውጤት አድስ', 'Sync Live Results')}</span>
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-700">
              <ShieldCheck className="w-4 h-4 text-[#0E8A38] shrink-0" />
              <span>
                {bi('የካሽአውት ህግ:', 'Cashout Rule:')} <strong className="font-mono-num">{CASHOUT_MIN_MINUTE}&apos;–{CASHOUT_MAX_MINUTE}&apos;</strong> ·{' '}
                <strong className="font-mono-num text-[#0E8A38]">{Math.round(CASHOUT_FEE_RATE * 100)}%</strong>{' '}
                {bi('ክፍያ · ከፍተኛ', 'fee · Max')}{' '}
                <strong className="font-mono-num">{Math.round(CASHOUT_MAX_PAYOUT_RATIO * 100)}%</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSubTab('rules')}
              className="text-xs font-extrabold text-[#0E8A38] hover:underline cursor-pointer whitespace-nowrap"
            >
              {bi('ሙሉ ህግ አንብብ', 'Read Full Rules')}
            </button>
          </div>

          {liveTickets.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3 shadow-xs">
              <p className="text-base font-extrabold text-slate-900">
                {bi('አሁን ላይቭ እየተጫወተ ያለ ትኬት የለም', 'No active live tickets right now')}
              </p>
              <p className="text-xs sm:text-sm text-slate-600">
                {bi(
                  'ከጨዋታዎች ዝርዝር ትኬት ሲቆርጡ ወዲያውኑ እዚህ ላይቭ ገብተው የቀጥታ ውጤትና ካሽአውት ማድረግ ይችላሉ።',
                  'Place a ticket from the schedule board to track live scores and cash out early.',
                )}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubTab('fixtures');
                  onChangeSportsSection?.('sport');
                }}
                className="px-5 py-2.5 rounded-lg bg-[#0E8A38] hover:bg-[#0B732E] text-white font-black text-xs sm:text-sm transition cursor-pointer"
              >
                {bi('ወደ ጨዋታዎች ፕሮግራም ተመለስ', 'Back to Matches')}
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
                    className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs"
                  >
                    <div className="bg-[#0E8A38] text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-bold text-[#9AD84B] font-mono-num">
                          LIVE · {snap.minute}&apos; / 90&apos; · {hitsCount}/{snap.picks.length}{' '}
                          {bi('በማሸነፍ ላይ', 'winning')}
                        </p>
                        <h3 className="text-sm sm:text-base font-black">
                          {bi('ትኬት', 'Ticket')} #{ticket.id.slice(-6).toUpperCase()} · {ticket.picksCount}{' '}
                          {bi('ጨዋታ', 'legs')}
                        </h3>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono-num">
                        <div>
                          <span className="text-emerald-100 block text-[10px]">{bi('መወራረጃ', 'Stake')}</span>
                          <span className="font-black">{formatETB(ticket.betAmount)}</span>
                        </div>
                        <div>
                          <span className="text-emerald-100 block text-[10px]">{bi('ኦድ', 'Odds')}</span>
                          <span className="font-black text-[#9AD84B]">{ticket.totalOdds.toFixed(2)}x</span>
                        </div>
                        <div>
                          <span className="text-emerald-100 block text-[10px]">{bi('90\' ሽልማት', '90\' Payout')}</span>
                          <span className="font-black">{formatETB(ticket.potentialPayout)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 space-y-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono-num text-slate-500">
                          <span>0&apos;</span>
                          <span className="text-[#0E8A38] font-bold">
                            {bi('ካሽአውት መስኮት', 'Cashout Window')} ({CASHOUT_MIN_MINUTE}&apos;–{CASHOUT_MAX_MINUTE}&apos;)
                          </span>
                          <span>90&apos; FT</span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#0E8A38] transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.round((snap.minute / 90) * 100))}%` }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {snap.picks.map((leg) => (
                          <div
                            key={leg.matchId}
                            className={`border rounded-lg p-3 flex items-center justify-between gap-3 ${
                              leg.hit ? 'bg-emerald-50/70 border-[#0E8A38]/40' : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                                {leg.home} vs {leg.away}
                              </p>
                              <p className="text-[11px] text-slate-600 mt-0.5">
                                {leg.marketLabel || getMarketLabel(leg.market)}{' '}
                                <span className="font-mono-num font-bold text-slate-900">
                                  ({leg.odd.toFixed(2)}x)
                                </span>
                              </p>
                              <p className="text-[11px] font-mono-num text-slate-500 mt-0.5">
                                HT {leg.htHomeGoals ?? 0}-{leg.htAwayGoals ?? 0} ·{' '}
                                {bi('ካርድ', 'Cards')} {(leg.homeCards ?? 0) + (leg.awayCards ?? 0)} ·{' '}
                                {bi('ኮርነር', 'Corners')} {(leg.homeCorners ?? 0) + (leg.awayCorners ?? 0)}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono-num text-sm font-black text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded">
                                {leg.homeGoals} - {leg.awayGoals}
                              </span>
                              {leg.hit ? (
                                <CheckCircle2 className="w-5 h-5 text-[#0E8A38] shrink-0" />
                              ) : (
                                <Clock className="w-5 h-5 text-slate-400 shrink-0" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            {quote.eligible ? (
                              <Banknote className="w-4 h-4 text-[#0E8A38] shrink-0" />
                            ) : (
                              <Lock className="w-4 h-4 text-rose-500 shrink-0" />
                            )}
                            <span>{quote.reason}</span>
                          </p>
                          {quote.eligible && (
                            <p className="text-[11px] text-slate-500 font-mono-num">
                              {bi(
                                `12% ክፍያ ተቀንሶ ወዲያውኑ ወደ ቦርሳዎ የሚገባ: ${formatETB(quote.offer)}`,
                                `Net instant payout after 12% fee: ${formatETB(quote.offer)}`,
                              )}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={!quote.eligible || isBusy}
                            onClick={() => handleCashout(ticket)}
                            className={`px-4 py-2.5 min-h-[44px] rounded-lg font-extrabold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
                              quote.eligible
                                ? 'bg-[#0E8A38] hover:bg-[#0B732E] text-white'
                                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            <Banknote className="w-4 h-4 shrink-0" />
                            <span>
                              {isBusy
                                ? bi('በመፈጸም ላይ...', 'Processing...')
                                : quote.eligible
                                  ? `${bi('ካሽአውት ውሰድ', 'Cashout')} (${formatETB(quote.offer)})`
                                  : bi('ካሽአውት ተዘግቷል', 'Cashout Locked')}
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleFastForwardToFullTime(ticket)}
                            className="px-3.5 py-2.5 min-h-[44px] rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                          >
                            <FastForward className="w-4 h-4 text-[#0E8A38] shrink-0" />
                            <span>{bi("90' ጨርስ", "Finish 90'")}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {settledTickets.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3 shadow-xs">
              <h3 className="text-sm font-black text-slate-900">
                {bi(
                  `የቅርብ ጊዜ የተዘጉ እና ካሽአውት የተደረጉ ትኬቶች (${settledTickets.length})`,
                  `Recent Settled & Cashed-Out Tickets (${settledTickets.length})`,
                )}
              </h3>
              <div className="space-y-2">
                {settledTickets.slice(0, 8).map((t) => {
                  const isCashedOut = t.status === 'cashed_out';
                  const isWon = t.status === 'won';
                  return (
                    <div
                      key={t.id}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {isCashedOut ? (
                            <span className="font-black text-amber-700">
                              {bi('ካሽአውት', 'Cashed Out')} ({t.currentMinute}&apos;)
                            </span>
                          ) : isWon ? (
                            <span className="font-black text-[#0E8A38]">{bi('አሸናፊ', 'Won')} (90&apos; FT)</span>
                          ) : (
                            <span className="font-black text-rose-600">{bi('ተሸናፊ', 'Lost')} (90&apos; FT)</span>
                          )}
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-num text-slate-500">
                            {t.picksCount} {bi('ጨዋታ', 'legs')} ({t.totalOdds.toFixed(2)}x)
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 truncate">{t.resultText || t.choiceText}</p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 text-xs font-mono-num">
                        <span className="text-slate-500">{formatETB(t.betAmount)}</span>
                        <span
                          className={`font-black ${
                            isWon ? 'text-[#0E8A38]' : isCashedOut ? 'text-amber-700' : 'text-rose-600'
                          }`}
                        >
                          {t.payout > 0 ? `+${formatETB(t.payout)}` : `-${formatETB(t.betAmount)}`}
                        </span>
                        {t.payout > 0 ? (
                          <CheckCircle2 className="w-4 h-4 text-[#0E8A38]" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-500" />
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

      {/* TAB 3: COMPLETE FOOTBALL BETTING RULES & HOW-TO-BET GUIDE */}
      {subTab === 'rules' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setSubTab('fixtures');
                onChangeSportsSection?.('sport');
              }}
              className="min-h-[42px] px-3.5 py-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-black flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
            >
              <ArrowLeft className="w-4 h-4 text-[#0E8A38]" />
              <span>{bi('ወደ ጨዋታዎች ተመለስ', 'Back to Matches')}</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="bg-[#0E8A38] text-white px-4 py-3">
              <h3 className="text-base font-black">
                {bi(
                  'አጠቃላይ የእግር ኳስ ቤቲንግ እና ካሽአውት ህጎች',
                  'Standard Football Betting & Cashout Rules',
                )}
              </h3>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3.5 text-slate-800">
              <article className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1.5">
                <p className="text-xs font-mono-num font-bold text-[#0E8A38]">90&apos; + Stoppage Time</p>
                <h4 className="text-sm font-black">{bi('1. የ90 ደቂቃ ውጤት ህግ', '1. 90-Minute Result Rule')}</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {bi(
                    'ሁሉም 1/X/2፣ Double Chance፣ Over/Under እና GG/NG ውርርዶች የሚወሰኑት በመደበኛው 90 ደቂቃ እና ጭማሪ ሰዓት ውጤት ብቻ ነው። Extra Time እና Penalties አይካተቱም።',
                    'All 1/X/2, Double Chance, Over/Under, and GG/NG bets settle on regular 90 minutes plus stoppage time (excluding Extra Time & Penalties).',
                  )}
                </p>
              </article>

              <article className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1.5">
                <p className="text-xs font-mono-num font-bold text-[#0E8A38]">5&apos; – 80&apos; Cashout Window</p>
                <h4 className="text-sm font-black">{bi('2. የካሽአውት ህግ', '2. Live Cashout Terms')}</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {bi(
                    `ካሽአውት ከ${CASHOUT_MIN_MINUTE}' እስከ ${CASHOUT_MAX_MINUTE}' ደቂቃ ክፍት ሲሆን ${Math.round(CASHOUT_FEE_RATE * 100)}% ክፍያ ይቀነሳል (ዝቅተኛ ${CASHOUT_MIN_AMOUNT} ብር፣ ከፍተኛ ${Math.round(CASHOUT_MAX_PAYOUT_RATIO * 100)}% እና ቢያንስ ${Math.round(CASHOUT_MIN_STAKE_RATIO * 100)}% መነሻ)።`,
                    `Cashout opens between ${CASHOUT_MIN_MINUTE}' and ${CASHOUT_MAX_MINUTE}' with a ${Math.round(CASHOUT_FEE_RATE * 100)}% service fee (min ${CASHOUT_MIN_AMOUNT} ETB, cap ${Math.round(CASHOUT_MAX_PAYOUT_RATIO * 100)}% of max payout).`,
                  )}
                </p>
              </article>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="bg-[#0E8A38] text-white px-4 py-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#9AD84B]" />
              <h3 className="text-base font-black">
                {bi(
                  'አንድ ቆማሪ እንዴት ይቆምራል? · 135+ ገበያዎች መመሪያ',
                  'How To Bet · Guide to All 135+ Football Markets',
                )}
              </h3>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs text-slate-700 leading-relaxed">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
                <h4 className="font-black text-slate-900 text-sm">
                  {bi('1X2 · Double Chance · Draw No Bet', '1X2 · Double Chance · Draw No Bet')}
                </h4>
                <p>
                  {bi(
                    '• 1 / X / 2: ባለሜዳ ያሸንፋል (1)፣ አቻ (X)፣ እንግዳ ያሸንፋል (2)። • Double Chance (1/X, X/2, 1/2): 2 ውጤቶችን በአንድ ላይ መያዝ። • Draw No Bet: አቻ ካለቀ ብርዎ (1.00x) ይመለሳል።',
                    '• 1 / X / 2: Home win, Draw, Away win. • Double Chance (1/X, X/2, 1/2): Cover 2 outcomes. • Draw No Bet: Stake refunded (1.00x) on a draw.',
                  )}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
                <h4 className="font-black text-slate-900 text-sm">
                  {bi('Over/Under · GG/NG · Multigoals · Cards & Corners', 'Goals · GG/NG · Multigoals · Cards & Corners')}
                </h4>
                <p>
                  {bi(
                    '• Over 2.5 = 3+ ጎል፤ Under 2.5 = 0–2 ጎል። • GG = ሁለቱም ቡድኖች ሲያገቡ። • Multigoals (1-3, 2-4, 7+, No Goal)። • በ+135 ቁልፍ Handicap, 1st Half, HT/FT, Correct Score, Cards እና Corners ያገኛሉ።',
                    '• Over 2.5 = 3+ total goals; Under 2.5 = 0–2 goals. • GG = Both teams score. • Tap +135 on any match for Handicap, 1st Half, HT/FT, Exact Score, Cards & Corners.',
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* MOBILE COMPACT FLOATING BETSLIP TRIGGER BAR (Positioned cleanly above bottom mobile nav) */}
      {subTab === 'fixtures' && picks.length > 0 && !mobileSlipOpen && (
        <div className="lg:hidden fixed bottom-[64px] left-3 right-3 z-30">
          <button
            type="button"
            onClick={() => setMobileSlipOpen(true)}
            className="w-full h-12 px-4 rounded-xl bg-[#0E8A38] hover:bg-[#0B732E] text-white shadow-xl border border-[#9AD84B]/40 flex items-center justify-between gap-2 cursor-pointer"
          >
            <span className="flex items-center gap-2 text-xs font-black">
              <Receipt className="w-4 h-4 text-[#9AD84B]" />
              <span>
                {bi('ትኬት', 'Betslip')} ({picks.length})
              </span>
            </span>
            <span className="font-mono-num text-xs font-black text-[#9AD84B]">
              {totalOdds.toFixed(2)}x · {formatETB(potentialPayout)}
            </span>
          </button>
        </div>
      )}

      {/* MOBILE BETSLIP MODAL SHEET */}
      {mobileSlipOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/65 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[92dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
              <button
                type="button"
                onClick={() => setMobileSlipOpen(false)}
                className="min-h-[38px] px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-black flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#0E8A38]" />
                <span>{bi('ተመለስ', 'Back')}</span>
              </button>
              <span className="text-xs font-extrabold text-slate-700">
                {bi('የእርስዎ ትኬት', 'Your Betslip')} ({picks.length})
              </span>
              <button
                type="button"
                onClick={() => setMobileSlipOpen(false)}
                className="w-9 h-9 rounded-lg hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                aria-label={bi('ዝጋ', 'Close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderBetslipBody()}
          </div>
        </div>
      )}

      {/* CHECK BET / TICKET LOOKUP MODAL */}
      {checkBetOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/65 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl text-slate-900 max-h-[90dvh] flex flex-col">
            <div className="bg-[#0E8A38] text-white px-3.5 py-3 flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCheckBetOpen(false)}
                className="min-h-[38px] px-2.5 py-1 rounded-lg bg-black/20 hover:bg-black/30 text-white text-xs font-black flex items-center gap-1 cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#9AD84B]" />
                <span>{bi('ተመለስ', 'Back')}</span>
              </button>
              <h3 className="text-xs sm:text-sm font-black flex items-center gap-1.5 truncate">
                <Receipt className="w-4 h-4 text-[#9AD84B] shrink-0" />
                <span className="truncate">{bi('ትኬት አረጋግጥ · Check Bet', 'Check Bet')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setCheckBetOpen(false)}
                className="w-9 h-9 rounded-lg hover:bg-black/20 flex items-center justify-center cursor-pointer shrink-0"
                aria-label={bi('ዝጋ', 'Close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={checkBetCode}
                  onChange={(e) => setCheckBetCode(e.target.value)}
                  placeholder={bi('የትኬት ቁጥር ወይም ቡድን ያስገቡ...', 'Enter ticket ID or team name...')}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-[#0E8A38] rounded-lg pl-9 pr-3 py-2.5 text-xs sm:text-sm outline-none"
                />
              </div>

              {checkBetMatches.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  {bi('ምንም ትኬት አልተገኘም', 'No tickets found')}
                </p>
              ) : (
                <div className="space-y-2">
                  {checkBetMatches.map((t) => (
                    <div
                      key={t.id}
                      className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs font-mono-num">
                        <span className="font-black text-slate-900">
                          #{t.id.slice(-6).toUpperCase()}
                        </span>
                        <span
                          className={`font-black ${
                            t.status === 'live'
                              ? 'text-[#0E8A38]'
                              : t.status === 'won'
                                ? 'text-emerald-700'
                                : t.status === 'cashed_out'
                                  ? 'text-amber-700'
                                  : 'text-rose-600'
                          }`}
                        >
                          {t.status.toUpperCase()} ({t.currentMinute}&apos;)
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 truncate">{t.resultText || t.choiceText}</p>
                      <div className="flex items-center justify-between text-[11px] font-mono-num text-slate-600">
                        <span>
                          {bi('መወራረጃ', 'Stake')}: {formatETB(t.betAmount)} · {t.totalOdds.toFixed(2)}x
                        </span>
                        <span className="font-black text-[#0E8A38]">
                          {t.status === 'live'
                            ? `${bi('ዕድል', 'Potential')}: ${formatETB(t.potentialPayout)}`
                            : t.payout > 0
                              ? `+${formatETB(t.payout)}`
                              : `-${formatETB(t.betAmount)}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ALL 135+ MARKETS MODAL */}
      {activeModalMatch && (
        <MatchMarketsModal
          match={activeModalMatch}
          selectedMarket={selectedPicksByMatch[activeModalMatch.id]}
          getScaledOdd={getScaledOdd}
          disabled={placingTicket}
          onSelectMarket={(match, market) => togglePick(match, market)}
          onOpenStats={() => {
            const id = activeModalMatch.id;
            setMarketsMatchId(null);
            setStatsMatchId(id);
          }}
          onClose={() => setMarketsMatchId(null)}
        />
      )}

      {/* BESOCER MATCH STATISTICS MODAL (H2H · RECENT FORM W/D/L · LEAGUE STANDINGS) */}
      {activeStatsMatch && (
        <MatchStatsModal
          match={activeStatsMatch}
          onOpenMarkets={() => {
            const id = activeStatsMatch.id;
            setStatsMatchId(null);
            setMarketsMatchId(id);
          }}
          onClose={() => setStatsMatchId(null)}
        />
      )}
    </div>
  );
};
