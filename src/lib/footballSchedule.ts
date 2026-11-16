import { FootballMarketKey } from '../types';
import { generateAllMatchOdds } from './footballMarkets';

export type TimeframeBucket = 'all' | 'live' | 'hourly' | 'daily' | 'weekly' | 'monthly';
export type LeagueId =
  | 'all'
  | 'ethiopia'
  | 'epl'
  | 'ucl'
  | 'uel'
  | 'laliga'
  | 'seriea'
  | 'bundesliga'
  | 'ligue1'
  | 'intl';
export type LeagueTier = 1 | 2 | 3;

export interface ScheduledMatch {
  id: string;
  league: Exclude<LeagueId, 'all'>;
  leagueLabel: string;
  tier: LeagueTier;
  tierLabel: string;
  timeframe: Exclude<TimeframeBucket, 'all'>;
  dateKey?: string;
  kickoffIso?: string;
  kickoffLabel: string;
  scheduleGroupLabel: string;
  isLive: boolean;
  liveMinute?: number;
  liveHomeGoals?: number;
  liveAwayGoals?: number;
  liveHtHomeGoals?: number;
  liveHtAwayGoals?: number;
  liveHomeCards?: number;
  liveAwayCards?: number;
  liveHomeCorners?: number;
  liveAwayCorners?: number;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  homeLogo?: string;
  awayLogo?: string;
  besoccerUrl?: string;
  sourceName?: string;
  odds: Record<FootballMarketKey, number>;
  featured?: boolean;
}

export const TIMEFRAME_OPTIONS: { id: TimeframeBucket; label: string }[] = [
  { id: 'all', label: 'ሁሉም ፕሮግራም' },
  { id: 'live', label: 'ላይቭ አሁን (LIVE)' },
  { id: 'hourly', label: 'በሰዓት (Hourly)' },
  { id: 'daily', label: 'በቀን (ዛሬ)' },
  { id: 'weekly', label: 'በሳምንት (Weekly)' },
  { id: 'monthly', label: 'በወር (Monthly)' },
];

export const LEAGUE_OPTIONS: { id: LeagueId; label: string; tier?: LeagueTier }[] = [
  { id: 'all', label: 'ሁሉም ሊጎች' },
  { id: 'ethiopia', label: 'ኢትዮጵያ ፕሪሚየር ሊግ', tier: 1 },
  { id: 'epl', label: 'Premier League', tier: 1 },
  { id: 'laliga', label: 'La Liga', tier: 1 },
  { id: 'seriea', label: 'Serie A', tier: 1 },
  { id: 'bundesliga', label: 'Bundesliga', tier: 1 },
  { id: 'ucl', label: 'Champions League', tier: 2 },
  { id: 'uel', label: 'Europa League', tier: 2 },
  { id: 'ligue1', label: 'Ligue 1', tier: 2 },
  { id: 'intl', label: 'AFCON / ዓለም አቀፍ', tier: 3 },
];

export const TIER_OPTIONS: { id: 'all' | LeagueTier; label: string; subtitle: string }[] = [
  { id: 'all', label: 'ሁሉም ደረጃዎች', subtitle: 'Tier 1 – 3' },
  { id: 1, label: 'ደረጃ 1 · ዋና ሊጎች', subtitle: 'Ethiopia PL, EPL, La Liga, Serie A, Bundesliga' },
  { id: 2, label: 'ደረጃ 2 · የአውሮፓ ዋንጫዎች', subtitle: 'UCL, Europa League, Ligue 1' },
  { id: 3, label: 'ደረጃ 3 · ዓለም አቀፍ / አፍሪካ', subtitle: 'AFCON, World Cup Qualifiers' },
];

const ETH_WEEKDAYS = ['እሁድ', 'ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'አርብ', 'ቅዳሜ'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatOffsetTime(base: Date, addHours: number, fixedMinute = 0): string {
  const d = new Date(base.getTime() + addHours * 3600_000);
  return `${pad2(d.getHours())}:${pad2(fixedMinute)}`;
}

function formatFutureDay(base: Date, addDays: number, hour: number, minute = 0): string {
  const d = new Date(base.getTime() + addDays * 86400_000);
  const dayName = addDays === 1 ? 'ነገ' : ETH_WEEKDAYS[d.getDay()];
  const monthDay = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
  return `${dayName} (${monthDay}) · ${pad2(hour)}:${pad2(minute)}`;
}

function makeOdds(
  home: number,
  draw: number,
  away: number,
  o25: number,
  u25: number,
  gg: number,
  ng: number,
): Record<FootballMarketKey, number> {
  return generateAllMatchOdds(home, draw, away, o25, u25, gg, ng);
}

export function buildFootballSchedule(now = new Date()): ScheduledMatch[] {
  return assignFallbackDateKeys([
    // ================= LIVE NOW (IN-PLAY) =================
    {
      id: 'live_eth_1',
      league: 'ethiopia',
      leagueLabel: 'ኢትዮጵያ ፕሪሚየር ሊግ',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'live',
      kickoffLabel: "LIVE · 38'",
      scheduleGroupLabel: 'ላይቭ አሁን (በመካሄድ ላይ)',
      isLive: true,
      liveMinute: 38,
      liveHomeGoals: 1,
      liveAwayGoals: 0,
      home: 'ቅዱስ ጊዮርጊስ',
      away: 'ፋሲል ከነማ',
      homeCode: 'SGE',
      awayCode: 'FAS',
      featured: true,
      odds: makeOdds(1.58, 3.6, 5.4, 1.95, 1.82, 1.85, 1.88),
    },
    {
      id: 'live_epl_1',
      league: 'epl',
      leagueLabel: 'Premier League',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'live',
      kickoffLabel: "LIVE · 54'",
      scheduleGroupLabel: 'ላይቭ አሁን (በመካሄድ ላይ)',
      isLive: true,
      liveMinute: 54,
      liveHomeGoals: 1,
      liveAwayGoals: 1,
      home: 'Arsenal',
      away: 'Liverpool',
      homeCode: 'ARS',
      awayCode: 'LIV',
      featured: true,
      odds: makeOdds(2.35, 2.95, 3.1, 1.55, 2.35, 1.12, 5.5),
    },
    {
      id: 'live_laliga_1',
      league: 'laliga',
      leagueLabel: 'La Liga',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'live',
      kickoffLabel: "LIVE · 22'",
      scheduleGroupLabel: 'ላይቭ አሁን (በመካሄድ ላይ)',
      isLive: true,
      liveMinute: 22,
      liveHomeGoals: 0,
      liveAwayGoals: 0,
      home: 'Real Madrid',
      away: 'Atletico Madrid',
      homeCode: 'RMA',
      awayCode: 'ATM',
      featured: true,
      odds: makeOdds(2.05, 3.25, 3.65, 1.88, 1.9, 1.82, 1.92),
    },
    {
      id: 'live_ucl_1',
      league: 'ucl',
      leagueLabel: 'Champions League',
      tier: 2,
      tierLabel: 'ደረጃ 2',
      timeframe: 'live',
      kickoffLabel: "LIVE · 69'",
      scheduleGroupLabel: 'ላይቭ አሁን (በመካሄድ ላይ)',
      isLive: true,
      liveMinute: 69,
      liveHomeGoals: 2,
      liveAwayGoals: 1,
      home: 'Bayern Munich',
      away: 'Inter Milan',
      homeCode: 'BAY',
      awayCode: 'INT',
      featured: true,
      odds: makeOdds(1.42, 4.2, 7.2, 1.15, 4.9, 1.12, 5.8),
    },

    // ================= HOURLY (NEXT 1–6 HOURS) =================
    {
      id: 'hr_eth_2',
      league: 'ethiopia',
      leagueLabel: 'ኢትዮጵያ ፕሪሚየር ሊግ',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'hourly',
      kickoffLabel: `ዛሬ · ${formatOffsetTime(now, 1, 0)} (በ1 ሰዓት)`,
      scheduleGroupLabel: 'በሚቀጥሉት ሰዓታት',
      isLive: false,
      home: 'ኢትዮጵያ ቡና',
      away: 'ሀዋሳ ከነማ',
      homeCode: 'ECB',
      awayCode: 'HAW',
      featured: true,
      odds: makeOdds(2.05, 3.15, 3.45, 1.95, 1.82, 1.82, 1.88),
    },
    {
      id: 'hr_epl_2',
      league: 'epl',
      leagueLabel: 'Premier League',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'hourly',
      kickoffLabel: `ዛሬ · ${formatOffsetTime(now, 2, 30)} (በ2 ሰዓት)`,
      scheduleGroupLabel: 'በሚቀጥሉት ሰዓታት',
      isLive: false,
      home: 'Man City',
      away: 'Chelsea',
      homeCode: 'MCI',
      awayCode: 'CHE',
      featured: true,
      odds: makeOdds(1.78, 3.75, 4.2, 1.65, 2.15, 1.68, 2.1),
    },
    {
      id: 'hr_seriea_1',
      league: 'seriea',
      leagueLabel: 'Serie A',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'hourly',
      kickoffLabel: `ዛሬ · ${formatOffsetTime(now, 3, 45)} (በ3 ሰዓት)`,
      scheduleGroupLabel: 'በሚቀጥሉት ሰዓታት',
      isLive: false,
      home: 'AC Milan',
      away: 'Juventus',
      homeCode: 'MIL',
      awayCode: 'JUV',
      odds: makeOdds(2.35, 3.15, 3.05, 1.98, 1.8, 1.84, 1.9),
    },
    {
      id: 'hr_bundes_1',
      league: 'bundesliga',
      leagueLabel: 'Bundesliga',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'hourly',
      kickoffLabel: `ዛሬ · ${formatOffsetTime(now, 4, 30)} (በ4 ሰዓት)`,
      scheduleGroupLabel: 'በሚቀጥሉት ሰዓታት',
      isLive: false,
      home: 'Borussia Dortmund',
      away: 'Bayer Leverkusen',
      homeCode: 'BVB',
      awayCode: 'B04',
      odds: makeOdds(2.55, 3.55, 2.55, 1.55, 2.35, 1.5, 2.45),
    },
    {
      id: 'hr_ligue1_1',
      league: 'ligue1',
      leagueLabel: 'Ligue 1',
      tier: 2,
      tierLabel: 'ደረጃ 2',
      timeframe: 'hourly',
      kickoffLabel: `ዛሬ · ${formatOffsetTime(now, 5, 0)} (በ5 ሰዓት)`,
      scheduleGroupLabel: 'በሚቀጥሉት ሰዓታት',
      isLive: false,
      home: 'PSG',
      away: 'Marseille',
      homeCode: 'PSG',
      awayCode: 'OM',
      odds: makeOdds(1.65, 4.0, 4.75, 1.58, 2.3, 1.62, 2.2),
    },

    // ================= DAILY (TODAY'S FULL PROGRAM) =================
    {
      id: 'day_eth_3',
      league: 'ethiopia',
      leagueLabel: 'ኢትዮጵያ ፕሪሚየር ሊግ',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'daily',
      kickoffLabel: 'ዛሬ · 15:00',
      scheduleGroupLabel: 'የዛሬ ሙሉ ፕሮግራም',
      isLive: false,
      home: 'መከላከያ',
      away: 'ባህር ዳር ከነማ',
      homeCode: 'MEK',
      awayCode: 'BDR',
      odds: makeOdds(2.45, 2.95, 2.85, 2.15, 1.65, 1.92, 1.78),
    },
    {
      id: 'day_eth_4',
      league: 'ethiopia',
      leagueLabel: 'ኢትዮጵያ ፕሪሚየር ሊግ',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'daily',
      kickoffLabel: 'ዛሬ · 18:00',
      scheduleGroupLabel: 'የዛሬ ሙሉ ፕሮግራም',
      isLive: false,
      home: 'ሲዳማ ቡና',
      away: 'አዳማ ከተማ',
      homeCode: 'SID',
      awayCode: 'ADA',
      odds: makeOdds(2.2, 3.05, 3.25, 2.08, 1.7, 1.88, 1.84),
    },
    {
      id: 'day_epl_3',
      league: 'epl',
      leagueLabel: 'Premier League',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'daily',
      kickoffLabel: 'ዛሬ · 19:30',
      scheduleGroupLabel: 'የዛሬ ሙሉ ፕሮግራም',
      isLive: false,
      home: 'Man United',
      away: 'Tottenham',
      homeCode: 'MUN',
      awayCode: 'TOT',
      odds: makeOdds(2.3, 3.45, 2.85, 1.72, 2.05, 1.62, 2.2),
    },
    {
      id: 'day_laliga_2',
      league: 'laliga',
      leagueLabel: 'La Liga',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'daily',
      kickoffLabel: 'ዛሬ · 21:00',
      scheduleGroupLabel: 'የዛሬ ሙሉ ፕሮግራም',
      isLive: false,
      home: 'Barcelona',
      away: 'Sevilla',
      homeCode: 'BAR',
      awayCode: 'SEV',
      odds: makeOdds(1.52, 4.3, 5.6, 1.6, 2.25, 1.72, 2.05),
    },
    {
      id: 'day_seriea_2',
      league: 'seriea',
      leagueLabel: 'Serie A',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'daily',
      kickoffLabel: 'ዛሬ · 22:45',
      scheduleGroupLabel: 'የዛሬ ሙሉ ፕሮግራም',
      isLive: false,
      home: 'Napoli',
      away: 'AS Roma',
      homeCode: 'NAP',
      awayCode: 'ROM',
      odds: makeOdds(1.92, 3.45, 3.85, 1.82, 1.94, 1.74, 2.0),
    },
    {
      id: 'day_ucl_2',
      league: 'ucl',
      leagueLabel: 'Champions League',
      tier: 2,
      tierLabel: 'ደረጃ 2',
      timeframe: 'daily',
      kickoffLabel: 'ዛሬ · 23:00',
      scheduleGroupLabel: 'የዛሬ ሙሉ ፕሮግራም',
      isLive: false,
      home: 'Barcelona',
      away: 'PSG',
      homeCode: 'BAR',
      awayCode: 'PSG',
      featured: true,
      odds: makeOdds(2.1, 3.6, 3.2, 1.58, 2.28, 1.54, 2.35),
    },

    // ================= WEEKLY (DAYS +1 TO +7) =================
    {
      id: 'wk_uel_1',
      league: 'uel',
      leagueLabel: 'Europa League',
      tier: 2,
      tierLabel: 'ደረጃ 2',
      timeframe: 'weekly',
      kickoffLabel: formatFutureDay(now, 1, 20, 45),
      scheduleGroupLabel: 'የሳምንቱ ፕሮግራም (1–7 ቀናት)',
      isLive: false,
      home: 'AS Roma',
      away: 'Ajax',
      homeCode: 'ROM',
      awayCode: 'AJX',
      odds: makeOdds(1.88, 3.55, 3.9, 1.76, 2.0, 1.7, 2.05),
    },
    {
      id: 'wk_uel_2',
      league: 'uel',
      leagueLabel: 'Europa League',
      tier: 2,
      tierLabel: 'ደረጃ 2',
      timeframe: 'weekly',
      kickoffLabel: formatFutureDay(now, 2, 23, 0),
      scheduleGroupLabel: 'የሳምንቱ ፕሮግራም (1–7 ቀናት)',
      isLive: false,
      home: 'FC Porto',
      away: 'Lazio',
      homeCode: 'POR',
      awayCode: 'LAZ',
      odds: makeOdds(2.25, 3.25, 3.15, 1.9, 1.85, 1.76, 1.98),
    },
    {
      id: 'wk_epl_4',
      league: 'epl',
      leagueLabel: 'Premier League',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'weekly',
      kickoffLabel: formatFutureDay(now, 3, 18, 30),
      scheduleGroupLabel: 'የሳምንቱ ፕሮግራም (1–7 ቀናት)',
      isLive: false,
      home: 'Aston Villa',
      away: 'Newcastle',
      homeCode: 'AVL',
      awayCode: 'NEW',
      odds: makeOdds(2.35, 3.4, 2.85, 1.7, 2.08, 1.62, 2.2),
    },
    {
      id: 'wk_bundes_2',
      league: 'bundesliga',
      leagueLabel: 'Bundesliga',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'weekly',
      kickoffLabel: formatFutureDay(now, 4, 20, 30),
      scheduleGroupLabel: 'የሳምንቱ ፕሮግራም (1–7 ቀናት)',
      isLive: false,
      home: 'Bayern Munich',
      away: 'RB Leipzig',
      homeCode: 'BAY',
      awayCode: 'RBL',
      odds: makeOdds(1.62, 4.1, 4.9, 1.5, 2.45, 1.6, 2.22),
    },
    {
      id: 'wk_ligue1_2',
      league: 'ligue1',
      leagueLabel: 'Ligue 1',
      tier: 2,
      tierLabel: 'ደረጃ 2',
      timeframe: 'weekly',
      kickoffLabel: formatFutureDay(now, 5, 22, 0),
      scheduleGroupLabel: 'የሳምንቱ ፕሮግራም (1–7 ቀናት)',
      isLive: false,
      home: 'AS Monaco',
      away: 'Lyon',
      homeCode: 'MON',
      awayCode: 'LYO',
      odds: makeOdds(1.98, 3.6, 3.5, 1.68, 2.12, 1.62, 2.2),
    },
    {
      id: 'wk_intl_1',
      league: 'intl',
      leagueLabel: 'AFCON / ዓለም አቀፍ',
      tier: 3,
      tierLabel: 'ደረጃ 3',
      timeframe: 'weekly',
      kickoffLabel: formatFutureDay(now, 6, 16, 0),
      scheduleGroupLabel: 'የሳምንቱ ፕሮግራም (1–7 ቀናት)',
      isLive: false,
      featured: true,
      home: 'ኢትዮጵያ (Ethiopia)',
      away: 'ግብፅ (Egypt)',
      homeCode: 'ETH',
      awayCode: 'EGY',
      odds: makeOdds(4.2, 3.35, 1.85, 2.15, 1.65, 1.98, 1.76),
    },
    {
      id: 'wk_intl_2',
      league: 'intl',
      leagueLabel: 'AFCON / ዓለም አቀፍ',
      tier: 3,
      tierLabel: 'ደረጃ 3',
      timeframe: 'weekly',
      kickoffLabel: formatFutureDay(now, 7, 21, 0),
      scheduleGroupLabel: 'የሳምንቱ ፕሮግራም (1–7 ቀናት)',
      isLive: false,
      home: 'ናይጄሪያ (Nigeria)',
      away: 'ሴኔጋል (Senegal)',
      homeCode: 'NGA',
      awayCode: 'SEN',
      odds: makeOdds(2.4, 3.05, 2.95, 2.18, 1.64, 1.92, 1.82),
    },

    // ================= MONTHLY (WEEKS 2–4 MARQUEE SCHEDULE) =================
    {
      id: 'mo_eth_derby',
      league: 'ethiopia',
      leagueLabel: 'ኢትዮጵያ ፕሪሚየር ሊግ',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'monthly',
      kickoffLabel: formatFutureDay(now, 10, 16, 0),
      scheduleGroupLabel: 'የወሩ ታላላቅ ጨዋታዎች (8–30 ቀናት)',
      isLive: false,
      featured: true,
      home: 'ቅዱስ ጊዮርጊስ',
      away: 'ኢትዮጵያ ቡና',
      homeCode: 'SGE',
      awayCode: 'ECB',
      odds: makeOdds(2.08, 3.1, 3.45, 2.02, 1.74, 1.82, 1.9),
    },
    {
      id: 'mo_laliga_clasico',
      league: 'laliga',
      leagueLabel: 'La Liga',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'monthly',
      kickoffLabel: formatFutureDay(now, 14, 23, 0),
      scheduleGroupLabel: 'የወሩ ታላላቅ ጨዋታዎች (8–30 ቀናት)',
      isLive: false,
      featured: true,
      home: 'Real Madrid',
      away: 'Barcelona',
      homeCode: 'RMA',
      awayCode: 'BAR',
      odds: makeOdds(2.2, 3.55, 2.95, 1.62, 2.2, 1.56, 2.3),
    },
    {
      id: 'mo_epl_derby',
      league: 'epl',
      leagueLabel: 'Premier League',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'monthly',
      kickoffLabel: formatFutureDay(now, 17, 19, 30),
      scheduleGroupLabel: 'የወሩ ታላላቅ ጨዋታዎች (8–30 ቀናት)',
      isLive: false,
      featured: true,
      home: 'Arsenal',
      away: 'Man City',
      homeCode: 'ARS',
      awayCode: 'MCI',
      odds: makeOdds(2.55, 3.3, 2.65, 1.8, 1.95, 1.68, 2.08),
    },
    {
      id: 'mo_seriea_derby',
      league: 'seriea',
      leagueLabel: 'Serie A',
      tier: 1,
      tierLabel: 'ደረጃ 1',
      timeframe: 'monthly',
      kickoffLabel: formatFutureDay(now, 21, 22, 45),
      scheduleGroupLabel: 'የወሩ ታላላቅ ጨዋታዎች (8–30 ቀናት)',
      isLive: false,
      home: 'Inter Milan',
      away: 'AC Milan',
      homeCode: 'INT',
      awayCode: 'MIL',
      odds: makeOdds(2.05, 3.35, 3.55, 1.9, 1.85, 1.78, 1.95),
    },
    {
      id: 'mo_ucl_semi',
      league: 'ucl',
      leagueLabel: 'Champions League',
      tier: 2,
      tierLabel: 'ደረጃ 2',
      timeframe: 'monthly',
      kickoffLabel: formatFutureDay(now, 24, 23, 0),
      scheduleGroupLabel: 'የወሩ ታላላቅ ጨዋታዎች (8–30 ቀናት)',
      isLive: false,
      featured: true,
      home: 'Real Madrid',
      away: 'Man City',
      homeCode: 'RMA',
      awayCode: 'MCI',
      odds: makeOdds(2.4, 3.45, 2.75, 1.68, 2.1, 1.6, 2.24),
    },
    {
      id: 'mo_intl_world',
      league: 'intl',
      leagueLabel: 'AFCON / ዓለም አቀፍ',
      tier: 3,
      tierLabel: 'ደረጃ 3',
      timeframe: 'monthly',
      kickoffLabel: formatFutureDay(now, 28, 22, 0),
      scheduleGroupLabel: 'የወሩ ታላላቅ ጨዋታዎች (8–30 ቀናት)',
      isLive: false,
      featured: true,
      home: 'ሞሮኮ (Morocco)',
      away: 'አይቮሪ ኮስት (Ivory Coast)',
      homeCode: 'MAR',
      awayCode: 'CIV',
      odds: makeOdds(2.15, 3.15, 3.4, 2.05, 1.72, 1.88, 1.84),
    },
  ], now);
}

export interface DaySlotOption {
  dateKey: string;
  label: string;
  shortLabel: string;
}

export function getNext7DaysEAT(now = new Date()): DaySlotOption[] {
  const daysEth = ['እሁድ', 'ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'አርብ', 'ቅዳሜ'];
  return Array.from({ length: 7 }, (_, offset) => {
    const eat = new Date(now.getTime() + offset * 86400_000 + 3 * 3600_000);
    const dateKey = eat.toISOString().slice(0, 10);
    const dd = String(eat.getUTCDate()).padStart(2, '0');
    const mm = String(eat.getUTCMonth() + 1).padStart(2, '0');
    const dayName = offset === 0 ? 'ዛሬ' : offset === 1 ? 'ነገ' : daysEth[eat.getUTCDay()];
    return {
      dateKey,
      label: `${dayName} (${dd}/${mm})`,
      shortLabel: offset === 0 ? 'ዛሬ' : offset === 1 ? 'ነገ' : `${dayName} ${dd}/${mm}`,
    };
  });
}

export interface ExternalMatchPayload {
  id: string;
  league: Exclude<LeagueId, 'all'>;
  leagueLabel: string;
  tier: LeagueTier;
  tierLabel: string;
  timeframe: Exclude<TimeframeBucket, 'all'>;
  dateKey?: string;
  kickoffIso: string;
  kickoffLabel: string;
  scheduleGroupLabel: string;
  isLive: boolean;
  liveMinute?: number;
  liveHomeGoals?: number;
  liveAwayGoals?: number;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  homeLogo?: string;
  awayLogo?: string;
  homeOdd: number;
  drawOdd: number;
  awayOdd: number;
  over25Odd: number;
  under25Odd: number;
  ggOdd: number;
  ngOdd: number;
  featured: boolean;
  besoccerUrl: string;
  sourceName: string;
}

export interface BeSoccerScheduleResult {
  matches: ScheduledMatch[];
  syncedCount: number;
  daysCovered: number;
  source: string;
  fetchedAt: string;
}

function assignFallbackDateKeys(matches: ScheduledMatch[], now = new Date()): ScheduledMatch[] {
  const days = getNext7DaysEAT(now);
  return matches.map((m, idx) => {
    const fallbackDateKey =
      m.dateKey ||
      (m.timeframe === 'live' || m.timeframe === 'hourly' || m.timeframe === 'daily'
        ? days[0].dateKey
        : m.timeframe === 'weekly'
          ? days[1 + (idx % 6)].dateKey
          : days[6].dateKey);

    let fallbackKickoffIso = m.kickoffIso;
    if (!fallbackKickoffIso) {
      if (m.isLive) {
        fallbackKickoffIso = new Date(now.getTime() - (m.liveMinute ?? 30) * 60_000).toISOString();
      } else if (m.timeframe === 'hourly') {
        const hoursAhead = idx % 2 === 0 ? 0.2 : 1 + (idx % 4);
        fallbackKickoffIso = new Date(now.getTime() + hoursAhead * 3600_000).toISOString();
      } else if (m.timeframe === 'daily') {
        fallbackKickoffIso = new Date(now.getTime() + (6 + (idx % 6)) * 3600_000).toISOString();
      } else {
        const dayOffset = m.timeframe === 'weekly' ? 1 + (idx % 6) : 10 + (idx % 12);
        fallbackKickoffIso = new Date(now.getTime() + dayOffset * 86400_000).toISOString();
      }
    }

    return {
      ...m,
      dateKey: fallbackDateKey,
      kickoffIso: fallbackKickoffIso,
    };
  });
}

export async function fetchBeSoccerSchedule(forceRefresh = false): Promise<BeSoccerScheduleResult> {
  const now = new Date();
  const localSchedule = assignFallbackDateKeys(buildFootballSchedule(now), now);
  const url = forceRefresh ? '/api/besoccer/schedule?force=1' : '/api/besoccer/schedule';
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as {
    matches?: ExternalMatchPayload[];
    daysCovered?: number;
    source?: string;
    fetchedAt?: string;
  };

  const remoteList = Array.isArray(data.matches) ? data.matches : [];
  if (remoteList.length === 0) {
    return {
      matches: localSchedule,
      syncedCount: 0,
      daysCovered: 7,
      source: 'local',
      fetchedAt: new Date().toISOString(),
    };
  }

  const converted: ScheduledMatch[] = remoteList.map((m) => ({
    id: m.id,
    league: m.league,
    leagueLabel: m.leagueLabel,
    tier: m.tier,
    tierLabel: m.tierLabel,
    timeframe: m.timeframe,
    dateKey: m.dateKey || (m.kickoffIso ? m.kickoffIso.slice(0, 10) : getNext7DaysEAT(now)[0].dateKey),
    kickoffIso: m.kickoffIso,
    kickoffLabel: m.kickoffLabel,
    scheduleGroupLabel: m.scheduleGroupLabel,
    isLive: m.isLive,
    liveMinute: m.liveMinute,
    liveHomeGoals: m.liveHomeGoals,
    liveAwayGoals: m.liveAwayGoals,
    home: m.home,
    away: m.away,
    homeCode: m.homeCode,
    awayCode: m.awayCode,
    homeLogo: m.homeLogo,
    awayLogo: m.awayLogo,
    besoccerUrl: m.besoccerUrl,
    sourceName: m.sourceName,
    featured: m.featured,
    odds: makeOdds(
      m.homeOdd,
      m.drawOdd,
      m.awayOdd,
      m.over25Odd,
      m.under25Odd,
      m.ggOdd,
      m.ngOdd,
    ),
  }));

  const ethiopiaMatches = localSchedule.filter((m) => m.league === 'ethiopia');
  const presentTimeframes = new Set(converted.map((m) => m.timeframe));
  const extraLocal = localSchedule.filter(
    (m) => m.league !== 'ethiopia' && !presentTimeframes.has(m.timeframe),
  );

  const merged = [...converted, ...ethiopiaMatches, ...extraLocal];

  return {
    matches: merged,
    syncedCount: converted.length,
    daysCovered: data.daysCovered ?? 7,
    source: data.source || 'besoccer-sync',
    fetchedAt: data.fetchedAt || new Date().toISOString(),
  };
}

