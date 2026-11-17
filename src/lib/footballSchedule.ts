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

export function getEatDateKey(date = new Date()): string {
  const eat = new Date(date.getTime() + 3 * 3600_000);
  return eat.toISOString().slice(0, 10);
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
  providerLabel?: string;
  providersActive?: string[];
  hasRapidApi?: boolean;
  liveCount?: number;
  upcomingCount?: number;
  fromCache?: boolean;
  fetchedAt: string;
}

export interface LiveMatchResultDTO {
  status: 'pre' | 'in' | 'post';
  minute: number;
  homeGoals: number;
  awayGoals: number;
  htHomeGoals?: number;
  htAwayGoals?: number;
  source: string;
}

const ONLINE_SCHEDULE_STORAGE_KEY = 'edilbet_online_schedule_cache_v1';
const CACHE_MAX_AGE_MS = 4 * 3600_000;

function formatDynamicKickoffEat(
  kickoff: Date,
  now: Date,
  timeframe: Exclude<TimeframeBucket, 'all'>,
  liveMin?: number,
): string {
  if (timeframe === 'live') {
    return `LIVE · ${liveMin ?? 1}'`;
  }
  const eat = new Date(kickoff.getTime() + 3 * 3600_000);
  const eatNow = new Date(now.getTime() + 3 * 3600_000);
  const hh = String(eat.getUTCHours()).padStart(2, '0');
  const mm = String(eat.getUTCMinutes()).padStart(2, '0');
  const diffHours = Math.max(1, Math.round((kickoff.getTime() - now.getTime()) / 3600_000));
  const sameDay =
    eat.getUTCFullYear() === eatNow.getUTCFullYear() &&
    eat.getUTCMonth() === eatNow.getUTCMonth() &&
    eat.getUTCDate() === eatNow.getUTCDate();

  if (timeframe === 'hourly') {
    return `ዛሬ · ${hh}:${mm} EAT (በ${diffHours} ሰዓት)`;
  }
  if (sameDay) {
    return `ዛሬ · ${hh}:${mm} EAT`;
  }
  const dd = String(eat.getUTCDate()).padStart(2, '0');
  const mo = String(eat.getUTCMonth() + 1).padStart(2, '0');
  return `${ETH_WEEKDAYS[eat.getUTCDay()]} (${dd}/${mo}) · ${hh}:${mm}`;
}

function getDynamicGroupLabel(tf: Exclude<TimeframeBucket, 'all'>): string {
  if (tf === 'live') return 'ላይቭ አሁን (በመካሄድ ላይ)';
  if (tf === 'hourly') return 'በሚቀጥሉት ሰዓታት';
  if (tf === 'daily') return 'የዛሬ ሙሉ ፕሮግራም';
  if (tf === 'weekly') return 'የቀጣይ 7 ቀናት ፕሮግራም (Weekly)';
  return 'የወሩ ታላላቅ ጨዋታዎች (8–30 ቀናት)';
}

function readCachedOnlineSchedule(now = new Date()): BeSoccerScheduleResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ONLINE_SCHEDULE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BeSoccerScheduleResult;
    if (!Array.isArray(parsed?.matches) || parsed.matches.length === 0) return null;

    const fetchedAtMs = parsed.fetchedAt ? new Date(parsed.fetchedAt).getTime() : 0;
    if (!Number.isFinite(fetchedAtMs) || now.getTime() - fetchedAtMs > CACHE_MAX_AGE_MS) {
      return null;
    }

    const todayKey = getEatDateKey(now);
    const cacheAgeMs = now.getTime() - fetchedAtMs;

    const freshMatches = parsed.matches
      .filter((m) => {
        if (m.isLive) {
          // Only treat cached matches as live if cache is reasonably recent (< 30 min)
          return cacheAgeMs < 30 * 60_000;
        }
        if (m.kickoffIso) {
          const koMs = new Date(m.kickoffIso).getTime();
          if (Number.isFinite(koMs) && koMs < now.getTime() - 90 * 60_000) {
            return false;
          }
        }
        if (m.dateKey && m.dateKey < todayKey) {
          return false;
        }
        return true;
      })
      .map((m) => {
        if (!m.kickoffIso || m.isLive) return m;
        const ko = new Date(m.kickoffIso);
        if (Number.isNaN(ko.getTime())) return m;
        const diffHours = (ko.getTime() - now.getTime()) / 3600_000;
        const dk = getEatDateKey(ko);
        let tf: Exclude<TimeframeBucket, 'all'>;
        if (diffHours >= -0.25 && diffHours <= 6) tf = 'hourly';
        else if (dk === todayKey || diffHours <= 24) tf = 'daily';
        else if (diffHours <= 168) tf = 'weekly';
        else tf = 'monthly';
        return {
          ...m,
          dateKey: dk,
          timeframe: tf,
          kickoffLabel: formatDynamicKickoffEat(ko, now, tf),
          scheduleGroupLabel: getDynamicGroupLabel(tf),
        };
      });

    if (freshMatches.length === 0) return null;
    return {
      ...parsed,
      matches: freshMatches,
      syncedCount: freshMatches.length,
      liveCount: freshMatches.filter((m) => m.isLive).length,
      upcomingCount: freshMatches.filter((m) => !m.isLive).length,
      fromCache: true,
    };
  } catch {
    return null;
  }
}

function writeCachedOnlineSchedule(payload: BeSoccerScheduleResult): void {
  if (typeof window === 'undefined' || payload.matches.length === 0) return;
  try {
    window.localStorage.setItem(
      ONLINE_SCHEDULE_STORAGE_KEY,
      JSON.stringify({ ...payload, fromCache: false }),
    );
  } catch {
    // Ignore storage quota errors
  }
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

function clampClientOdd(n: number, min = 1.12, max = 14.5): number {
  return Number(Math.min(max, Math.max(min, n)).toFixed(2));
}

function clientAmericanToDecimal(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace('+', ''));
  if (!Number.isFinite(num) || num === 0) return null;
  if (num > 0) return clampClientOdd(1 + num / 100);
  return clampClientOdd(1 + 100 / Math.abs(num));
}

function clientHashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function clientMakeCode(name: string, abbr?: string): string {
  if (abbr) {
    const cleanAbbr = abbr.replace(/[^a-zA-Z0-9]/g, '').trim().toUpperCase();
    if (cleanAbbr.length >= 2 && cleanAbbr.length <= 4) return cleanAbbr;
  }
  const clean = name.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const combined = (words[0][0] + words[1].slice(0, 2)).toUpperCase();
    return combined.length >= 2 ? combined : combined.padEnd(2, 'F');
  }
  const single = (clean.slice(0, 3) || 'FC').toUpperCase();
  return single.length >= 2 ? single : single.padEnd(2, 'C');
}

function clientSynthesizeOdds(seedKey: string) {
  const s = clientHashSeed(seedKey);
  const strengthDiff = ((s % 45) - 22) / 100;
  const pHome = Math.min(0.66, Math.max(0.18, 0.42 + strengthDiff));
  const pDraw = 0.27;
  const pAway = Math.max(0.15, 1 - pHome - pDraw);
  const margin = 1.07;

  const overBase = 1.65 + (s % 50) / 100;
  const underBase = clampClientOdd(1 / Math.max(0.25, 1.06 - 1 / overBase));
  const ggBase = clampClientOdd(1.62 + ((s >> 4) % 42) / 100);
  const ngBase = clampClientOdd(1 / Math.max(0.25, 1.06 - 1 / ggBase));

  return {
    homeOdd: clampClientOdd(margin / pHome),
    drawOdd: clampClientOdd(margin / pDraw, 2.75, 5.2),
    awayOdd: clampClientOdd(margin / pAway),
    over25Odd: clampClientOdd(overBase),
    under25Odd: underBase,
    ggOdd: ggBase,
    ngOdd: ngBase,
  };
}

function mapClientEspnLeague(uid: string | undefined, slug?: string): {
  league: Exclude<LeagueId, 'all'>;
  leagueLabel: string;
  tier: LeagueTier;
  tierLabel: string;
  featured: boolean;
} {
  const lid = uid?.match(/l:(\d+)/)?.[1] || '';
  if (lid === '700' || slug === 'eng.1') {
    return { league: 'epl', leagueLabel: 'Premier League', tier: 1, tierLabel: 'ደረጃ 1', featured: true };
  }
  if (lid === '740' || slug === 'esp.1') {
    return { league: 'laliga', leagueLabel: 'La Liga', tier: 1, tierLabel: 'ደረጃ 1', featured: true };
  }
  if (lid === '730' || slug === 'ita.1') {
    return { league: 'seriea', leagueLabel: 'Serie A', tier: 1, tierLabel: 'ደረጃ 1', featured: true };
  }
  if (lid === '720' || slug === 'ger.1') {
    return { league: 'bundesliga', leagueLabel: 'Bundesliga', tier: 1, tierLabel: 'ደረጃ 1', featured: true };
  }
  if (lid === '710' || slug === 'fra.1') {
    return { league: 'ligue1', leagueLabel: 'Ligue 1', tier: 2, tierLabel: 'ደረጃ 2', featured: false };
  }
  if (lid === '775' || slug === 'uefa.champions') {
    return { league: 'ucl', leagueLabel: 'Champions League', tier: 2, tierLabel: 'ደረጃ 2', featured: true };
  }
  if (lid === '776' || slug === 'uefa.europa') {
    return { league: 'uel', leagueLabel: 'Europa League', tier: 2, tierLabel: 'ደረጃ 2', featured: false };
  }
  if (lid === '2395' || slug === 'uefa.nations') {
    return { league: 'intl', leagueLabel: 'UEFA Nations League', tier: 3, tierLabel: 'ደረጃ 3', featured: true };
  }
  if (slug === 'caf.nations') {
    return { league: 'intl', leagueLabel: 'AFCON · Africa Cup of Nations', tier: 3, tierLabel: 'ደረጃ 3', featured: true };
  }
  if (slug === 'caf.champions') {
    return { league: 'intl', leagueLabel: 'CAF Champions League', tier: 3, tierLabel: 'ደረጃ 3', featured: true };
  }
  if (lid === '3922' || slug === 'fifa.friendly') {
    return { league: 'intl', leagueLabel: 'ዓለም አቀፍ የወዳጅነት', tier: 3, tierLabel: 'ደረጃ 3', featured: false };
  }
  return { league: 'intl', leagueLabel: 'ዓለም አቀፍ ውድድር', tier: 3, tierLabel: 'ደረጃ 3', featured: false };
}

interface ClientEspnEvent {
  id?: string;
  uid?: string;
  date?: string;
  status?: {
    clock?: number;
    displayClock?: string;
    type?: { state?: string };
  };
  competitions?: Array<{
    competitors?: Array<{
      homeAway?: string;
      score?: string;
      team?: {
        displayName?: string;
        shortDisplayName?: string;
        abbreviation?: string;
        logo?: string;
      };
    }>;
    odds?: Array<{
      moneyline?: {
        home?: { close?: { odds?: string }; open?: { odds?: string } };
        away?: { close?: { odds?: string }; open?: { odds?: string } };
        draw?: { close?: { odds?: string }; open?: { odds?: string } };
      };
      total?: {
        over?: { close?: { odds?: string }; open?: { odds?: string } };
        under?: { close?: { odds?: string }; open?: { odds?: string } };
      };
    }>;
  }>;
}

async function fetchDirectOnlineEspnSchedule(now = new Date()): Promise<ExternalMatchPayload[]> {
  const fmtCompactEatDate = (d: Date) => getEatDateKey(d).replace(/-/g, '');
  const dayEndpoints = Array.from({ length: 7 }, (_, offset) => {
    const dt = new Date(now.getTime() + offset * 86400_000);
    return {
      url:
        offset === 0
          ? 'https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard'
          : `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${fmtCompactEatDate(dt)}`,
      slug: undefined as string | undefined,
    };
  });

  const leagueSlugs = [
    'eng.1',
    'esp.1',
    'ita.1',
    'ger.1',
    'fra.1',
    'uefa.champions',
    'uefa.europa',
    'uefa.nations',
    'caf.champions',
    'caf.nations',
    'fifa.friendly',
  ];

  const endpoints = [
    ...dayEndpoints,
    ...leagueSlugs.map((slug) => ({
      url: `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard`,
      slug,
    })),
  ];

  const responses = await Promise.allSettled(
    endpoints.map(async (ep) => {
      const r = await fetch(ep.url);
      if (!r.ok) return { events: [] as ClientEspnEvent[], slug: ep.slug };
      const json = (await r.json()) as {
        events?: ClientEspnEvent[];
        leagues?: Array<{ slug?: string }>;
      };
      return { events: json.events || [], slug: ep.slug || json.leagues?.[0]?.slug };
    }),
  );

  const seenIds = new Set<string>();
  const collected: ExternalMatchPayload[] = [];
  const todayKey = getEatDateKey(now);

  for (const res of responses) {
    if (res.status !== 'fulfilled') continue;
    for (const ev of res.value.events) {
      if (!ev.id || seenIds.has(ev.id)) continue;
      const state = ev.status?.type?.state;
      if (state === 'post') continue;

      const comp = ev.competitions?.[0];
      const homeComp = comp?.competitors?.find((c) => c.homeAway === 'home');
      const awayComp = comp?.competitors?.find((c) => c.homeAway === 'away');
      const homeName = homeComp?.team?.displayName || homeComp?.team?.shortDisplayName;
      const awayName = awayComp?.team?.displayName || awayComp?.team?.shortDisplayName;
      if (!homeName || !awayName) continue;

      const kickoff = ev.date ? new Date(ev.date) : now;
      const isLive = state === 'in';
      const diffHours = (kickoff.getTime() - now.getTime()) / 3600_000;
      if (!isLive && diffHours < -2.5) continue;

      seenIds.add(ev.id);
      const dateKey = getEatDateKey(kickoff);

      let tf: Exclude<TimeframeBucket, 'all'>;
      if (isLive) tf = 'live';
      else if (diffHours >= -0.25 && diffHours <= 6) tf = 'hourly';
      else if (dateKey === todayKey || diffHours <= 24) tf = 'daily';
      else if (diffHours <= 168) tf = 'weekly';
      else tf = 'monthly';

      const rawMin = parseInt(String(ev.status?.displayClock || '1').replace(/[^0-9]/g, ''), 10);
      const liveMinute = isLive
        ? Math.min(89, Math.max(1, Number.isFinite(rawMin) ? rawMin : Math.floor((ev.status?.clock ?? 60) / 60)))
        : undefined;

      const leagueMeta = mapClientEspnLeague(ev.uid, res.value.slug);
      const fallbackOdds = clientSynthesizeOdds(`${ev.id}-${homeName}-${awayName}`);
      const ml = comp?.odds?.[0]?.moneyline;
      const tot = comp?.odds?.[0]?.total;

      collected.push({
        id: `bslive_${ev.id}`,
        league: leagueMeta.league,
        leagueLabel: leagueMeta.leagueLabel,
        tier: leagueMeta.tier,
        tierLabel: leagueMeta.tierLabel,
        timeframe: tf,
        dateKey,
        kickoffIso: kickoff.toISOString(),
        kickoffLabel: formatDynamicKickoffEat(kickoff, now, tf, liveMinute),
        scheduleGroupLabel: getDynamicGroupLabel(tf),
        isLive,
        liveMinute,
        liveHomeGoals: isLive ? Number(homeComp?.score || 0) : undefined,
        liveAwayGoals: isLive ? Number(awayComp?.score || 0) : undefined,
        home: homeName,
        away: awayName,
        homeCode: clientMakeCode(homeName, homeComp?.team?.abbreviation),
        awayCode: clientMakeCode(awayName, awayComp?.team?.abbreviation),
        homeLogo: homeComp?.team?.logo,
        awayLogo: awayComp?.team?.logo,
        homeOdd: clientAmericanToDecimal(ml?.home?.close?.odds ?? ml?.home?.open?.odds) ?? fallbackOdds.homeOdd,
        drawOdd: clientAmericanToDecimal(ml?.draw?.close?.odds ?? ml?.draw?.open?.odds) ?? fallbackOdds.drawOdd,
        awayOdd: clientAmericanToDecimal(ml?.away?.close?.odds ?? ml?.away?.open?.odds) ?? fallbackOdds.awayOdd,
        over25Odd: clientAmericanToDecimal(tot?.over?.close?.odds ?? tot?.over?.open?.odds) ?? fallbackOdds.over25Odd,
        under25Odd: clientAmericanToDecimal(tot?.under?.close?.odds ?? tot?.under?.open?.odds) ?? fallbackOdds.under25Odd,
        ggOdd: fallbackOdds.ggOdd,
        ngOdd: fallbackOdds.ngOdd,
        featured: leagueMeta.featured || Boolean(ml),
        besoccerUrl: `https://www.besoccer.com/search?q=${encodeURIComponent(`${homeName} ${awayName}`)}`,
        sourceName: 'ESPN Live Online Feed',
      });
    }
  }

  return collected;
}

async function fetchSchedulePayloadWithRetry(forceRefresh: boolean) {
  const suffix = forceRefresh ? '?force=1' : '';
  const endpoints = [
    `/api/football/schedule${suffix}`,
    `/api/besoccer/schedule${suffix}`,
  ];

  let lastErr: Error | null = null;
  for (let i = 0; i < endpoints.length; i++) {
    try {
      const resp = await fetch(endpoints[i]);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const ctype = resp.headers.get('content-type') || '';
      if (!ctype.includes('application/json')) {
        throw new Error('Non-JSON API response');
      }
      const data = (await resp.json()) as {
        matches?: ExternalMatchPayload[];
        daysCovered?: number;
        source?: string;
        providerLabel?: string;
        providersActive?: string[];
        hasRapidApi?: boolean;
        liveCount?: number;
        upcomingCount?: number;
        fetchedAt?: string;
      };
      if (Array.isArray(data.matches) && data.matches.length > 0) {
        return data;
      }
      lastErr = new Error('Empty remote match list');
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error('Schedule fetch failed');
    }
    if (i < endpoints.length - 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  // Browser-side CORS fallback directly to ESPN Global Live Feed
  const directMatches = await fetchDirectOnlineEspnSchedule(new Date());
  if (directMatches.length > 0) {
    const uniqueDays = new Set(directMatches.map((m) => m.dateKey));
    return {
      matches: directMatches,
      daysCovered: uniqueDays.size,
      source: 'espn-direct-online',
      providerLabel: 'ESPN Global Live Feed (Direct)',
      providersActive: ['ESPN Global Feed'],
      hasRapidApi: false,
      liveCount: directMatches.filter((m) => m.isLive).length,
      upcomingCount: directMatches.filter((m) => !m.isLive).length,
      fetchedAt: new Date().toISOString(),
    };
  }

  throw lastErr || new Error('Could not reach football schedule API');
}

export async function fetchBeSoccerSchedule(forceRefresh = false): Promise<BeSoccerScheduleResult> {
  const now = new Date();
  const localSchedule = assignFallbackDateKeys(buildFootballSchedule(now), now);

  try {
    const data = await fetchSchedulePayloadWithRetry(forceRefresh);
    const remoteList = Array.isArray(data.matches) ? data.matches : [];
    if (remoteList.length === 0) {
      const cached = readCachedOnlineSchedule(now);
      if (cached) return cached;
      return {
        matches: localSchedule,
        syncedCount: 0,
        daysCovered: 7,
        source: 'local',
        providerLabel: 'Local Schedule Fallback',
        fetchedAt: new Date().toISOString(),
      };
    }

    const converted: ScheduledMatch[] = remoteList.map((m) => {
      const koDate = m.kickoffIso ? new Date(m.kickoffIso) : null;
      const eatDateKey =
        m.dateKey ||
        (koDate && !Number.isNaN(koDate.getTime())
          ? getEatDateKey(koDate)
          : getNext7DaysEAT(now)[0].dateKey);
      return {
        id: m.id,
        league: m.league,
        leagueLabel: m.leagueLabel,
        tier: m.tier,
        tierLabel: m.tierLabel,
        timeframe: m.timeframe,
        dateKey: eatDateKey,
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
      };
    });

    converted.sort((a, b) => {
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      const tA = a.kickoffIso ? new Date(a.kickoffIso).getTime() : Number.MAX_SAFE_INTEGER;
      const tB = b.kickoffIso ? new Date(b.kickoffIso).getTime() : Number.MAX_SAFE_INTEGER;
      if (tA !== tB) return tA - tB;
      return a.tier - b.tier;
    });

    const result: BeSoccerScheduleResult = {
      matches: converted,
      syncedCount: converted.length,
      daysCovered: data.daysCovered ?? 7,
      source: data.source || 'automated-api',
      providerLabel: data.providerLabel || 'BeSoccer Live + ESPN Global Feed',
      providersActive: data.providersActive || [],
      hasRapidApi: Boolean(data.hasRapidApi),
      liveCount: data.liveCount ?? converted.filter((m) => m.isLive).length,
      upcomingCount: data.upcomingCount ?? converted.filter((m) => !m.isLive).length,
      fromCache: false,
      fetchedAt: data.fetchedAt || new Date().toISOString(),
    };
    writeCachedOnlineSchedule(result);
    return result;
  } catch (err) {
    const cached = readCachedOnlineSchedule(now);
    if (cached) {
      return cached;
    }
    throw err;
  }
}

function normalizeTeamNameClient(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|cf|sc|ac|afc|club|united|city)\b/g, ' ')
    .replace(/[^a-z0-9\u1200-\u137f]/g, '')
    .trim();
}

function clientTeamsMatch(a: string, b: string): boolean {
  const na = normalizeTeamNameClient(a);
  const nb = normalizeTeamNameClient(b);
  if (!na || !nb) return a.toLowerCase() === b.toLowerCase();
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function fetchDirectEspnResultsFallback(
  picks: Array<{ matchId: string; home: string; away: string }>,
): Promise<Record<string, LiveMatchResultDTO>> {
  const now = new Date();
  const todayCompact = getEatDateKey(now).replace(/-/g, '');
  const yestCompact = getEatDateKey(new Date(now.getTime() - 86400_000)).replace(/-/g, '');
  const urls = [
    'https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard',
    `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${todayCompact}`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${yestCompact}`,
    'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard',
    'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard',
    'https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard',
    'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard',
    'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard',
    'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard',
  ];

  const pages = await Promise.allSettled(
    urls.map((u) => fetch(u).then((r) => (r.ok ? r.json() : null))),
  );
  const allEvents: ClientEspnEvent[] = [];
  for (const p of pages) {
    if (p.status === 'fulfilled' && Array.isArray(p.value?.events)) {
      allEvents.push(...(p.value.events as ClientEspnEvent[]));
    }
  }

  const results: Record<string, LiveMatchResultDTO> = {};
  for (const pick of picks) {
    const mid = (pick.matchId || '').trim();
    if (!mid || results[mid]) continue;
    const cleanEspnId = mid.startsWith('bslive_') ? mid.replace(/^bslive_/, '') : '';

    const matchedEv = allEvents.find((ev) => {
      if (cleanEspnId && ev.id === cleanEspnId) return true;
      const comp = ev.competitions?.[0];
      const hc = comp?.competitors?.find((c) => c.homeAway === 'home');
      const ac = comp?.competitors?.find((c) => c.homeAway === 'away');
      const hn = hc?.team?.displayName || hc?.team?.shortDisplayName || '';
      const an = ac?.team?.displayName || ac?.team?.shortDisplayName || '';
      return Boolean(
        pick.home && pick.away && hn && an && clientTeamsMatch(hn, pick.home) && clientTeamsMatch(an, pick.away),
      );
    });

    if (!matchedEv) continue;
    const stateRaw = matchedEv.status?.type?.state;
    const status: 'pre' | 'in' | 'post' =
      stateRaw === 'post' ? 'post' : stateRaw === 'in' ? 'in' : 'pre';
    const comp = matchedEv.competitions?.[0];
    const hc = comp?.competitors?.find((c) => c.homeAway === 'home');
    const ac = comp?.competitors?.find((c) => c.homeAway === 'away');
    const rawMin = parseInt(String(matchedEv.status?.displayClock || '1').replace(/[^0-9]/g, ''), 10);
    const minute =
      status === 'post'
        ? 90
        : status === 'in'
          ? Math.min(89, Math.max(1, Number.isFinite(rawMin) ? rawMin : 1))
          : 0;

    results[mid] = {
      status,
      minute,
      homeGoals: Number(hc?.score ?? 0),
      awayGoals: Number(ac?.score ?? 0),
      source: 'ESPN Live Results (Direct)',
    };
  }
  return results;
}

export async function fetchAutomatedMatchResults(
  picks: Array<{ matchId: string; home: string; away: string }>,
): Promise<Record<string, LiveMatchResultDTO>> {
  if (!Array.isArray(picks) || picks.length === 0) return {};
  try {
    const resp = await fetch('/api/football/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ picks: picks.slice(0, 60) }),
    });
    const ctype = resp.headers.get('content-type') || '';
    if (resp.ok && ctype.includes('application/json')) {
      const json = (await resp.json()) as {
        results?: Record<string, LiveMatchResultDTO>;
      };
      if (json.results && typeof json.results === 'object') {
        return json.results;
      }
    }
  } catch {
    // Fall through to direct browser ESPN results lookup
  }

  try {
    return await fetchDirectEspnResultsFallback(picks.slice(0, 60));
  } catch {
    return {};
  }
}



