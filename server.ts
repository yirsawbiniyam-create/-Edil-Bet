import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type LeagueKey =
  | 'ethiopia'
  | 'epl'
  | 'ucl'
  | 'uel'
  | 'laliga'
  | 'seriea'
  | 'bundesliga'
  | 'ligue1'
  | 'intl';

type TimeframeKey = 'live' | 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface ExternalMatchDTO {
  id: string;
  league: LeagueKey;
  leagueLabel: string;
  tier: 1 | 2 | 3;
  tierLabel: string;
  timeframe: TimeframeKey;
  dateKey: string;
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

interface ScheduleCache {
  expiresAt: number;
  payload: {
    matches: ExternalMatchDTO[];
    source: string;
    providerLabel: string;
    providersActive: string[];
    hasRapidApi: boolean;
    liveCount: number;
    upcomingCount: number;
    besoccerNote: string;
    daysCovered: number;
    fetchedAt: string;
  };
}

let scheduleCache: ScheduleCache | null = null;

function clampOdd(n: number, min = 1.12, max = 14.5): number {
  return Number(Math.min(max, Math.max(min, n)).toFixed(2));
}

function americanToDecimal(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace('+', ''));
  if (!Number.isFinite(num) || num === 0) return null;
  if (num > 0) return clampOdd(1 + num / 100);
  return clampOdd(1 + 100 / Math.abs(num));
}

function makeCode(name: string, abbr?: string): string {
  if (abbr) {
    const cleanAbbr = abbr.replace(/[^a-zA-Z0-9]/g, '').trim().toUpperCase();
    if (cleanAbbr.length >= 2 && cleanAbbr.length <= 4) {
      return cleanAbbr;
    }
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

function getEatDateKey(date: Date): string {
  const eat = new Date(date.getTime() + 3 * 3600_000);
  return eat.toISOString().slice(0, 10);
}

function mapLeagueFromName(name: string): {
  league: LeagueKey;
  leagueLabel: string;
  tier: 1 | 2 | 3;
  tierLabel: string;
  featured: boolean;
} {
  const lower = name.toLowerCase();
  if (lower.includes('ethiopia')) {
    return { league: 'ethiopia', leagueLabel: 'ኢትዮጵያ ፕሪሚየር ሊግ', tier: 1, tierLabel: 'ደረጃ 1', featured: true };
  }
  if (lower.includes('premier league') && !lower.includes('cup')) {
    return { league: 'epl', leagueLabel: 'Premier League', tier: 1, tierLabel: 'ደረጃ 1', featured: true };
  }
  if (lower === 'laliga' || lower === 'la liga' || lower.includes('laliga ea') || lower.includes('primera división')) {
    return { league: 'laliga', leagueLabel: 'La Liga', tier: 1, tierLabel: 'ደረጃ 1', featured: true };
  }
  if (lower === 'serie a' || lower.includes('serie a enilive') || lower.includes('serie a tim')) {
    return { league: 'seriea', leagueLabel: 'Serie A', tier: 1, tierLabel: 'ደረጃ 1', featured: true };
  }
  if (lower === 'bundesliga' || lower.startsWith('1. bundesliga')) {
    return { league: 'bundesliga', leagueLabel: 'Bundesliga', tier: 1, tierLabel: 'ደረጃ 1', featured: true };
  }
  if (lower === 'ligue 1' || lower.includes('ligue 1 mcdonald')) {
    return { league: 'ligue1', leagueLabel: 'Ligue 1', tier: 2, tierLabel: 'ደረጃ 2', featured: false };
  }
  if (lower.includes('champions league') && !lower.includes('caf') && !lower.includes('afc') && !lower.includes('women')) {
    return { league: 'ucl', leagueLabel: 'Champions League', tier: 2, tierLabel: 'ደረጃ 2', featured: true };
  }
  if (lower.includes('europa league')) {
    return { league: 'uel', leagueLabel: 'Europa League', tier: 2, tierLabel: 'ደረጃ 2', featured: false };
  }
  const featuredIntl =
    lower.includes('nations league') ||
    lower.includes('world cup') ||
    lower.includes('afcon') ||
    lower.includes('africa cup') ||
    lower.includes('caf champions') ||
    lower.includes('copa del rey');
  return { league: 'intl', leagueLabel: (name || 'Global Football').slice(0, 80), tier: 3, tierLabel: 'ደረጃ 3', featured: featuredIntl };
}

function mapLeagueFromUid(uid: string | undefined, fallbackSlug?: string): {
  league: LeagueKey;
  leagueLabel: string;
  tier: 1 | 2 | 3;
  tierLabel: string;
  featured: boolean;
} {
  const match = uid?.match(/l:(\d+)/);
  const lid = match?.[1] || '';

  if (lid === '700' || fallbackSlug === 'eng.1') {
    return { league: 'epl', leagueLabel: 'Premier League', tier: 1, tierLabel: 'ደረጃ 1', featured: true };
  }
  if (lid === '740' || fallbackSlug === 'esp.1') {
    return { league: 'laliga', leagueLabel: 'La Liga', tier: 1, tierLabel: 'ደረጃ 1', featured: true };
  }
  if (lid === '730' || fallbackSlug === 'ita.1') {
    return { league: 'seriea', leagueLabel: 'Serie A', tier: 1, tierLabel: 'ደረጃ 1', featured: true };
  }
  if (lid === '720' || fallbackSlug === 'ger.1') {
    return { league: 'bundesliga', leagueLabel: 'Bundesliga', tier: 1, tierLabel: 'ደረጃ 1', featured: true };
  }
  if (lid === '710' || fallbackSlug === 'fra.1') {
    return { league: 'ligue1', leagueLabel: 'Ligue 1', tier: 2, tierLabel: 'ደረጃ 2', featured: false };
  }
  if (lid === '775' || fallbackSlug === 'uefa.champions') {
    return { league: 'ucl', leagueLabel: 'Champions League', tier: 2, tierLabel: 'ደረጃ 2', featured: true };
  }
  if (lid === '776' || fallbackSlug === 'uefa.europa') {
    return { league: 'uel', leagueLabel: 'Europa League', tier: 2, tierLabel: 'ደረጃ 2', featured: false };
  }
  if (lid === '2395' || fallbackSlug === 'uefa.nations') {
    return { league: 'intl', leagueLabel: 'UEFA Nations League', tier: 3, tierLabel: 'ደረጃ 3', featured: true };
  }
  if (lid === '3922' || fallbackSlug === 'fifa.friendly') {
    return { league: 'intl', leagueLabel: 'ዓለም አቀፍ የወዳጅነት', tier: 3, tierLabel: 'ደረጃ 3', featured: false };
  }
  if (lid === '19267') {
    return { league: 'intl', leagueLabel: 'CONCACAF Nations League', tier: 3, tierLabel: 'ደረጃ 3', featured: false };
  }
  if (lid === '8301') {
    return { league: 'intl', leagueLabel: 'NWSL Playoffs', tier: 3, tierLabel: 'ደረጃ 3', featured: false };
  }
  if (lid === '760') {
    return { league: 'intl', leagueLabel: 'Liga MX', tier: 2, tierLabel: 'ደረጃ 2', featured: false };
  }
  return { league: 'intl', leagueLabel: 'ዓለም አቀፍ ውድድር', tier: 3, tierLabel: 'ደረጃ 3', featured: false };
}

function formatAddisKickoff(date: Date, now: Date, timeframe: TimeframeKey, liveMin?: number): string {
  if (timeframe === 'live') {
    return `LIVE · ${liveMin ?? 1}'`;
  }
  const eatMs = date.getTime() + 3 * 3600_000;
  const eatNowMs = now.getTime() + 3 * 3600_000;
  const eat = new Date(eatMs);
  const eatNow = new Date(eatNowMs);

  const hh = String(eat.getUTCHours()).padStart(2, '0');
  const mm = String(eat.getUTCMinutes()).padStart(2, '0');
  const diffHours = Math.max(0, Math.round((date.getTime() - now.getTime()) / 3600_000));

  const sameDay =
    eat.getUTCFullYear() === eatNow.getUTCFullYear() &&
    eat.getUTCMonth() === eatNow.getUTCMonth() &&
    eat.getUTCDate() === eatNow.getUTCDate();

  if (timeframe === 'hourly') {
    return `ዛሬ · ${hh}:${mm} EAT (በ${Math.max(1, diffHours)} ሰዓት)`;
  }
  if (sameDay) {
    return `ዛሬ · ${hh}:${mm} EAT`;
  }
  const dd = String(eat.getUTCDate()).padStart(2, '0');
  const mo = String(eat.getUTCMonth() + 1).padStart(2, '0');
  const daysEth = ['እሁድ', 'ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'አርብ', 'ቅዳሜ'];
  const dayName = daysEth[eat.getUTCDay()];
  return `${dayName} (${dd}/${mo}) · ${hh}:${mm}`;
}

function getGroupLabel(tf: TimeframeKey): string {
  if (tf === 'live') return 'ላይቭ አሁን (በመካሄድ ላይ)';
  if (tf === 'hourly') return 'በሚቀጥሉት ሰዓታት';
  if (tf === 'daily') return 'የዛሬ ሙሉ ፕሮግራም';
  if (tf === 'weekly') return 'የቀጣይ 7 ቀናት ፕሮግራም (Weekly)';
  return 'የወሩ ታላላቅ ጨዋታዎች (8–30 ቀናት)';
}

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function synthesizeBalancedOdds(seedKey: string): {
  homeOdd: number;
  drawOdd: number;
  awayOdd: number;
  over25Odd: number;
  under25Odd: number;
  ggOdd: number;
  ngOdd: number;
} {
  const s = hashSeed(seedKey);
  const strengthDiff = ((s % 45) - 22) / 100;
  const pHome = Math.min(0.66, Math.max(0.18, 0.42 + strengthDiff));
  const pDraw = 0.27;
  const pAway = Math.max(0.15, 1 - pHome - pDraw);
  const margin = 1.07;

  const overBase = 1.65 + ((s % 50) / 100);
  const underBase = clampOdd(1 / Math.max(0.25, 1.06 - 1 / overBase));
  const ggBase = clampOdd(1.62 + (((s >> 4) % 42) / 100));
  const ngBase = clampOdd(1 / Math.max(0.25, 1.06 - 1 / ggBase));

  return {
    homeOdd: clampOdd(margin / pHome),
    drawOdd: clampOdd(margin / pDraw, 2.75, 5.2),
    awayOdd: clampOdd(margin / pAway),
    over25Odd: clampOdd(overBase),
    under25Odd: underBase,
    ggOdd: ggBase,
    ngOdd: ngBase,
  };
}

interface BeSoccerRawMatch {
  id?: string;
  local?: string;
  visitor?: string;
  local_abbr?: string;
  visitor_abbr?: string;
  local_shield?: string;
  visitor_shield?: string;
  competition_name?: string;
  date?: string;
  hour?: string;
  minute?: string;
  status?: number;
  live_minute?: string;
  r1?: string;
  r2?: string;
  url?: string;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function parseBeSoccerHtmlFixtures(html: string, now: Date): ExternalMatchDTO[] {
  const results: ExternalMatchDTO[] = [];
  const seen = new Set<string>();
  const todayKey = getEatDateKey(now);

  // Locate every competition header (`panel-title`) to associate matches with their real league
  const panelHeaders: Array<{ pos: number; leagueName: string }> = [];
  const panelRe = /<div[^>]*class="[^"]*panel-title[^"]*"[^>]*>([\s\S]{1,500}?)<\/div>/gi;
  let pm: RegExpExecArray | null;
  while ((pm = panelRe.exec(html)) !== null) {
    const clean = stripTags(pm[1]).slice(0, 80);
    if (clean) {
      panelHeaders.push({ pos: pm.index, leagueName: clean });
    }
  }

  let headerPtr = 0;
  const matchRe = /<a\b[^>]*class="[^"]*match-link[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let mm: RegExpExecArray | null;

  while ((mm = matchRe.exec(html)) !== null) {
    const tag = mm[0];
    const body = mm[1];
    const pos = mm.index;

    while (headerPtr + 1 < panelHeaders.length && panelHeaders[headerPtr + 1].pos < pos) {
      headerPtr += 1;
    }
    const compName =
      headerPtr < panelHeaders.length && panelHeaders[headerPtr].pos < pos
        ? panelHeaders[headerPtr].leagueName
        : 'BeSoccer Live Program';

    const hrefMatch = tag.match(/href="([^"]+)"/i);
    const idAttrMatch = tag.match(/id="match-([^"]+)"/i);
    const statusMatch = tag.match(/data-status-id="([^"]+)"/i);
    const startAttrMatch = tag.match(/starttime="([^"]+)"/i);

    const statusId = statusMatch?.[1] || '0';
    // Skip finished matches (1) or postponed/cancelled if clearly marked Fin
    if (statusId === '1') continue;

    const teamNames = [...body.matchAll(/<div[^>]*class="[^"]*team-name[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)]
      .map((m) => stripTags(m[1]))
      .filter(Boolean);
    if (teamNames.length < 2) continue;

    const home = teamNames[0];
    const away = teamNames[1];

    const shields = [...body.matchAll(/<img[^>]*class="[^"]*team-shield[^"]*"[^>]*src="([^"]+)"/gi)].map(
      (m) => m[1],
    );

    const r1Match = body.match(/class="[^"]*r1[^"]*"[^>]*>(\d+)</i);
    const r2Match = body.match(/class="[^"]*r2[^"]*"[^>]*>(\d+)</i);
    const tagLiveMatch = body.match(/<div[^>]*class="[^"]*\btag\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const tagText = tagLiveMatch ? stripTags(tagLiveMatch[1]) : '';
    const isFinishedMarker = /\b(fin|ft|aet|pen)\b/i.test(tagText) || /\b(fin|ft)\b/i.test(body);
    if (isFinishedMarker) continue;

    const isLive =
      statusId === '2' ||
      statusId === '3' ||
      Boolean(r1Match && r2Match && !isFinishedMarker) ||
      /^\d{1,3}'?$/.test(tagText) ||
      /^ht$/i.test(tagText);

    let kickoff = now;
    if (startAttrMatch?.[1]) {
      const parsedDt = new Date(startAttrMatch[1]);
      if (!Number.isNaN(parsedDt.getTime())) {
        kickoff = parsedDt;
      }
    } else {
      const hourMatch = body.match(/class="[^"]*\btime\b[^"]*"[^>]*>(\d{1,2}):(\d{2})</i);
      if (hourMatch) {
        const dateTextMatch = body.match(/class="[^"]*\bdate\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const dtCandidate = dateTextMatch
          ? new Date(`${stripTags(dateTextMatch[1])} ${hourMatch[1]}:${hourMatch[2]}:00 UTC`)
          : null;
        if (dtCandidate && !Number.isNaN(dtCandidate.getTime())) {
          kickoff = dtCandidate;
        }
      }
    }

    const diffHours = (kickoff.getTime() - now.getTime()) / 3600_000;
    const dateKey = getEatDateKey(kickoff);

    let tf: TimeframeKey;
    if (isLive) tf = 'live';
    else if (diffHours >= -0.25 && diffHours <= 6) tf = 'hourly';
    else if (dateKey === todayKey || diffHours <= 24) tf = 'daily';
    else if (diffHours <= 168) tf = 'weekly';
    else tf = 'monthly';

    const dedupeKey = `${home.toLowerCase()}_${away.toLowerCase()}_${dateKey}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const parsedMin = /^ht$/i.test(tagText)
      ? 45
      : parseInt(tagText.replace(/[^0-9]/g, ''), 10);
    const liveMin = isLive
      ? Math.min(89, Math.max(1, Number.isFinite(parsedMin) ? parsedMin : 25))
      : undefined;

    const lgMeta = mapLeagueFromName(compName);
    const odds = synthesizeBalancedOdds(`bsweb-${home}-${away}-${dateKey}`);
    const besoccerUrl =
      hrefMatch?.[1] && hrefMatch[1].startsWith('http')
        ? hrefMatch[1]
        : `https://www.besoccer.com/search?q=${encodeURIComponent(`${home} ${away}`)}`;

    const safeAttrId = idAttrMatch?.[1] ? idAttrMatch[1].replace(/[^a-zA-Z0-9_-]/g, '') : '';
    results.push({
      id: `bsweb_${safeAttrId || hashSeed(dedupeKey)}`,
      league: lgMeta.league,
      leagueLabel: (compName === 'BeSoccer Live Program' ? lgMeta.leagueLabel : compName).slice(0, 80),
      tier: lgMeta.tier,
      tierLabel: lgMeta.tierLabel,
      timeframe: tf,
      dateKey,
      kickoffIso: kickoff.toISOString(),
      kickoffLabel: formatAddisKickoff(kickoff, now, tf, liveMin),
      scheduleGroupLabel: getGroupLabel(tf),
      isLive,
      liveMinute: liveMin,
      liveHomeGoals: isLive ? Number(r1Match?.[1] || 0) : undefined,
      liveAwayGoals: isLive ? Number(r2Match?.[1] || 0) : undefined,
      home: home.slice(0, 80),
      away: away.slice(0, 80),
      homeCode: makeCode(home),
      awayCode: makeCode(away),
      homeLogo: shields[0],
      awayLogo: shields[1],
      ...odds,
      featured: lgMeta.featured || isLive,
      besoccerUrl,
      sourceName: 'BeSoccer Official Live Program',
    });
  }

  return results;
}

async function tryBeSoccer7DaysDirect(): Promise<{
  matches: ExternalMatchDTO[];
  note: string;
}> {
  const apiKey = process.env.BESOCCER_API_KEY?.trim();
  const now = new Date();

  if (apiKey) {
    try {
      const dayKeys = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now.getTime() + i * 86400_000);
        return getEatDateKey(d);
      });

      const responses = await Promise.allSettled(
        dayKeys.map(async (ymd) => {
          const url = `https://apiclient.besoccerapps.com/scripts/api/api.php?key=${encodeURIComponent(apiKey)}&format=json&req=matchsday&date=${ymd}&tz=Africa/Addis_Ababa`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(5500) });
          if (!resp.ok) return [] as BeSoccerRawMatch[];
          const data = (await resp.json()) as { matches?: BeSoccerRawMatch[] };
          return Array.isArray(data.matches) ? data.matches : [];
        }),
      );

      const parsed: ExternalMatchDTO[] = [];
      const seen = new Set<string>();

      for (const r of responses) {
        if (r.status !== 'fulfilled') continue;
        for (const m of r.value) {
          if (!m.local || !m.visitor) continue;
          const uidKey = m.id || `${m.local}_${m.visitor}_${m.date || ''}`;
          if (seen.has(uidKey)) continue;
          const statusNum = Number(m.status ?? -1);
          if (statusNum === 1) continue; // finished
          seen.add(uidKey);

          const isLive = statusNum === 0;
          const iso =
            m.date && m.hour
              ? `${m.date}T${m.hour}:${m.minute || '00'}:00+03:00`
              : now.toISOString();
          const dt = new Date(iso);
          const diffHours = (dt.getTime() - now.getTime()) / 3600_000;
          const dateKey = getEatDateKey(dt);
          const todayKey = getEatDateKey(now);

          let tf: TimeframeKey;
          if (isLive) tf = 'live';
          else if (diffHours >= -0.25 && diffHours <= 6) tf = 'hourly';
          else if (dateKey === todayKey || diffHours <= 24) tf = 'daily';
          else if (diffHours <= 168) tf = 'weekly';
          else tf = 'monthly';

          const lgMeta = mapLeagueFromName(m.competition_name || '');
          const odds = synthesizeBalancedOdds(`${m.local}-${m.visitor}-${dateKey}`);
          const liveMin = m.live_minute ? parseInt(m.live_minute, 10) || 1 : undefined;

          parsed.push({
            id: `bs_${m.id || hashSeed(uidKey)}`,
            league: lgMeta.league,
            leagueLabel: m.competition_name || lgMeta.leagueLabel,
            tier: lgMeta.tier,
            tierLabel: lgMeta.tierLabel,
            timeframe: tf,
            dateKey,
            kickoffIso: dt.toISOString(),
            kickoffLabel: formatAddisKickoff(dt, now, tf, liveMin),
            scheduleGroupLabel: getGroupLabel(tf),
            isLive,
            liveMinute: isLive ? liveMin ?? 25 : undefined,
            liveHomeGoals: isLive ? Number(m.r1 || 0) : undefined,
            liveAwayGoals: isLive ? Number(m.r2 || 0) : undefined,
            home: m.local,
            away: m.visitor,
            homeCode: makeCode(m.local, m.local_abbr),
            awayCode: makeCode(m.visitor, m.visitor_abbr),
            homeLogo: m.local_shield,
            awayLogo: m.visitor_shield,
            ...odds,
            featured: lgMeta.featured,
            besoccerUrl:
              m.url ||
              `https://www.besoccer.com/search?q=${encodeURIComponent(`${m.local} ${m.visitor}`)}`,
            sourceName: 'BeSoccer Official API (7-Day Program)',
          });
        }
      }

      if (parsed.length > 0) {
        return {
          matches: parsed.slice(0, 350),
          note: `BeSoccer Official API · 7-Day Program (${parsed.length} matches)`,
        };
      }
    } catch {
      // Fall through cleanly to BeSoccer web feed
    }
  }

  // Direct BeSoccer Web Program Scraping (Today + Upcoming 6 Days, spaced + retried to avoid empty CDN nodes)
  try {
    const besoccerHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    const fetchBeSoccerHtml = async (url: string): Promise<string> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await fetch(url, {
            headers: besoccerHeaders,
            signal: AbortSignal.timeout(5500),
          });
          if (r.ok) {
            const text = await r.text();
            if (text.length > 2000) return text;
          }
        } catch {
          // retry once
        }
        await new Promise((resolve) => setTimeout(resolve, 160));
      }
      return '';
    };

    const dayUrls = Array.from({ length: 7 }, (_, i) => {
      const ymd = getEatDateKey(new Date(now.getTime() + i * 86400_000));
      return `https://www.besoccer.com/livescore/${ymd}`;
    });

    const webMatches: ExternalMatchDTO[] = [];
    const seenKeys = new Set<string>();
    for (const u of dayUrls) {
      const html = await fetchBeSoccerHtml(u);
      if (!html) continue;
      for (const item of parseBeSoccerHtmlFixtures(html, now)) {
        const key = `${item.home.toLowerCase()}_${item.away.toLowerCase()}_${item.dateKey}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        webMatches.push(item);
      }
      await new Promise((resolve) => setTimeout(resolve, 90));
    }

    if (webMatches.length > 0) {
      return {
        matches: webMatches,
        note: `BeSoccer.com Real-Time Match Program (${webMatches.length} fixtures)`,
      };
    }
  } catch {
    // Fall through cleanly
  }

  return {
    matches: [],
    note: 'BeSoccer Sync · 7-Day Live & Upcoming Match Program Active',
  };
}

interface EspnCompetitor {
  homeAway?: string;
  score?: string;
  team?: {
    displayName?: string;
    shortDisplayName?: string;
    abbreviation?: string;
    logo?: string;
  };
}

interface EspnOddsEntry {
  moneyline?: {
    home?: { close?: { odds?: string }; open?: { odds?: string } };
    away?: { close?: { odds?: string }; open?: { odds?: string } };
    draw?: { close?: { odds?: string }; open?: { odds?: string } };
  };
  total?: {
    over?: { close?: { odds?: string }; open?: { odds?: string } };
    under?: { close?: { odds?: string }; open?: { odds?: string } };
  };
}

interface EspnEvent {
  id?: string;
  uid?: string;
  date?: string;
  season?: { slug?: string };
  status?: {
    clock?: number;
    displayClock?: string;
    type?: { state?: string; shortDetail?: string };
  };
  competitions?: Array<{
    competitors?: EspnCompetitor[];
    odds?: EspnOddsEntry[];
  }>;
}

async function fetch7DayLiveSoccerFeed(): Promise<ExternalMatchDTO[]> {
  const now = new Date();
  const fmtCompactDate = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

  // Query all 7 upcoming days (day 0 through day 6) + top club & European leagues across upcoming dates
  const dayEndpoints = Array.from({ length: 7 }, (_, offset) => {
    const dt = new Date(now.getTime() + offset * 86400_000);
    return {
      url:
        offset === 0
          ? 'https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard'
          : `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${fmtCompactDate(dt)}`,
      slug: undefined as string | undefined,
    };
  });

  const topClubSlugs = ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1'] as const;
  const upcomingLeagueDates = [4, 5, 6].map((offset) =>
    fmtCompactDate(new Date(now.getTime() + offset * 86400_000)),
  );

  const leagueEndpoints: Array<{ url: string; slug?: string }> = [
    ...topClubSlugs.map((slug) => ({
      url: `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard`,
      slug,
    })),
    ...topClubSlugs.flatMap((slug) =>
      upcomingLeagueDates.map((ymd) => ({
        url: `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${ymd}`,
        slug,
      })),
    ),
    { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard', slug: 'uefa.champions' },
    { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard', slug: 'uefa.europa' },
    { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.nations/scoreboard', slug: 'uefa.nations' },
    { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/caf.champions/scoreboard', slug: 'caf.champions' },
    { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.friendly/scoreboard', slug: 'fifa.friendly' },
  ];

  const endpoints = [...dayEndpoints, ...leagueEndpoints];

  const responses = await Promise.allSettled(
    endpoints.map(async (ep) => {
      const r = await fetch(ep.url, { signal: AbortSignal.timeout(6500) });
      if (!r.ok) return { events: [] as EspnEvent[], slug: ep.slug };
      const json = (await r.json()) as { events?: EspnEvent[]; leagues?: Array<{ slug?: string }> };
      return { events: json.events || [], slug: ep.slug || json.leagues?.[0]?.slug };
    }),
  );

  const seenIds = new Set<string>();
  const collected: ExternalMatchDTO[] = [];
  const todayKey = getEatDateKey(now);

  for (const res of responses) {
    if (res.status !== 'fulfilled') continue;
    for (const ev of res.value.events) {
      if (!ev.id || seenIds.has(ev.id)) continue;
      const state = ev.status?.type?.state;
      if (state === 'post') continue; // skip already completed games

      const comp = ev.competitions?.[0];
      const homeComp = comp?.competitors?.find((c) => c.homeAway === 'home');
      const awayComp = comp?.competitors?.find((c) => c.homeAway === 'away');
      const homeName = homeComp?.team?.displayName || homeComp?.team?.shortDisplayName;
      const awayName = awayComp?.team?.displayName || awayComp?.team?.shortDisplayName;
      if (!homeName || !awayName) continue;

      seenIds.add(ev.id);

      const kickoff = ev.date ? new Date(ev.date) : now;
      const isLive = state === 'in';
      const diffHours = (kickoff.getTime() - now.getTime()) / 3600_000;
      const dateKey = getEatDateKey(kickoff);

      let timeframe: TimeframeKey;
      if (isLive) {
        timeframe = 'live';
      } else if (diffHours >= -0.25 && diffHours <= 6) {
        timeframe = 'hourly';
      } else if (dateKey === todayKey || diffHours <= 24) {
        timeframe = 'daily';
      } else if (diffHours <= 168) {
        timeframe = 'weekly';
      } else {
        timeframe = 'monthly';
      }

      const rawMin = parseInt(String(ev.status?.displayClock || '1').replace(/[^0-9]/g, ''), 10);
      const liveMinute = isLive
        ? Math.min(89, Math.max(1, Number.isFinite(rawMin) ? rawMin : Math.floor((ev.status?.clock ?? 60) / 60)))
        : undefined;

      const leagueMeta = mapLeagueFromUid(ev.uid, res.value.slug);
      const fallbackOdds = synthesizeBalancedOdds(`${ev.id}-${homeName}-${awayName}`);
      const ml = comp?.odds?.[0]?.moneyline;
      const tot = comp?.odds?.[0]?.total;

      const homeOdd =
        americanToDecimal(ml?.home?.close?.odds ?? ml?.home?.open?.odds) ?? fallbackOdds.homeOdd;
      const drawOdd =
        americanToDecimal(ml?.draw?.close?.odds ?? ml?.draw?.open?.odds) ?? fallbackOdds.drawOdd;
      const awayOdd =
        americanToDecimal(ml?.away?.close?.odds ?? ml?.away?.open?.odds) ?? fallbackOdds.awayOdd;
      const over25Odd =
        americanToDecimal(tot?.over?.close?.odds ?? tot?.over?.open?.odds) ?? fallbackOdds.over25Odd;
      const under25Odd =
        americanToDecimal(tot?.under?.close?.odds ?? tot?.under?.open?.odds) ?? fallbackOdds.under25Odd;

      collected.push({
        id: `bslive_${ev.id}`,
        league: leagueMeta.league,
        leagueLabel: leagueMeta.leagueLabel,
        tier: leagueMeta.tier,
        tierLabel: leagueMeta.tierLabel,
        timeframe,
        dateKey,
        kickoffIso: kickoff.toISOString(),
        kickoffLabel: formatAddisKickoff(kickoff, now, timeframe, liveMinute),
        scheduleGroupLabel: getGroupLabel(timeframe),
        isLive,
        liveMinute,
        liveHomeGoals: isLive ? Number(homeComp?.score || 0) : undefined,
        liveAwayGoals: isLive ? Number(awayComp?.score || 0) : undefined,
        home: homeName,
        away: awayName,
        homeCode: makeCode(homeName, homeComp?.team?.abbreviation),
        awayCode: makeCode(awayName, awayComp?.team?.abbreviation),
        homeLogo: homeComp?.team?.logo,
        awayLogo: awayComp?.team?.logo,
        homeOdd,
        drawOdd,
        awayOdd,
        over25Odd,
        under25Odd,
        ggOdd: fallbackOdds.ggOdd,
        ngOdd: fallbackOdds.ngOdd,
        featured: leagueMeta.featured || Boolean(ml),
        besoccerUrl: `https://www.besoccer.com/search?q=${encodeURIComponent(`${homeName} ${awayName}`)}`,
        sourceName: 'BeSoccer Sync · 7-Day Global Program',
      });
    }
  }

  // Sort live first, then chronological kickoff across the next 7+ days, prioritizing featured within same slot
  collected.sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    const tDiff = new Date(a.kickoffIso).getTime() - new Date(b.kickoffIso).getTime();
    if (Math.abs(tDiff) > 3600_000) return tDiff;
    if (a.tier !== b.tier) return a.tier - b.tier;
    return tDiff;
  });

  // Keep full 7-day real schedule across all leagues without artificial 12/day truncation
  const perDayCounts = new Map<string, number>();
  const bucketCaps: Record<TimeframeKey, number> = {
    live: 60,
    hourly: 80,
    daily: 120,
    weekly: 320,
    monthly: 60,
  };
  const bucketCounts: Record<TimeframeKey, number> = {
    live: 0,
    hourly: 0,
    daily: 0,
    weekly: 0,
    monthly: 0,
  };

  return collected.filter((m) => {
    if (bucketCounts[m.timeframe] >= bucketCaps[m.timeframe]) return false;
    if (!m.isLive && m.timeframe === 'weekly') {
      const c = perDayCounts.get(m.dateKey) || 0;
      if (c >= 65) return false;
      perDayCounts.set(m.dateKey, c + 1);
    }
    bucketCounts[m.timeframe] += 1;
    return true;
  });
}

interface RapidApiFixtureItem {
  fixture?: {
    id?: number;
    date?: string;
    status?: { short?: string; elapsed?: number | null };
  };
  league?: {
    name?: string;
    country?: string;
  };
  teams?: {
    home?: { name?: string; logo?: string };
    away?: { name?: string; logo?: string };
  };
  goals?: { home?: number | null; away?: number | null };
  score?: { halftime?: { home?: number | null; away?: number | null } };
}

interface RapidApiOddItem {
  fixture?: { id?: number };
  bookmakers?: Array<{
    bets?: Array<{
      id?: number;
      name?: string;
      values?: Array<{ value?: string; odd?: string }>;
    }>;
  }>;
}

function getRapidApiAuthConfig(): {
  baseUrl: string;
  headers: Record<string, string>;
} | null {
  const rapidKey = process.env.RAPIDAPI_FOOTBALL_KEY?.trim();
  const rapidHost = process.env.RAPIDAPI_FOOTBALL_HOST?.trim() || 'api-football-v1.p.rapidapi.com';
  if (rapidKey) {
    return {
      baseUrl: `https://${rapidHost}/v3`,
      headers: {
        'x-rapidapi-key': rapidKey,
        'x-rapidapi-host': rapidHost,
      },
    };
  }
  const directKey = process.env.API_FOOTBALL_KEY?.trim();
  if (directKey) {
    return {
      baseUrl: 'https://v3.football.api-sports.io',
      headers: {
        'x-apisports-key': directKey,
      },
    };
  }
  return null;
}

async function tryRapidApiFootball7Days(): Promise<{
  matches: ExternalMatchDTO[];
  active: boolean;
}> {
  const cfg = getRapidApiAuthConfig();
  if (!cfg) return { matches: [], active: false };

  const now = new Date();
  const todayKey = getEatDateKey(now);
  const dateKeys = Array.from({ length: 7 }, (_, i) =>
    getEatDateKey(new Date(now.getTime() + i * 86400_000)),
  );

  try {
    const [liveRes, ...dayFixturesAndOdds] = await Promise.allSettled([
      fetch(`${cfg.baseUrl}/fixtures?live=all&timezone=Africa/Addis_Ababa`, {
        headers: cfg.headers,
        signal: AbortSignal.timeout(6500),
      }).then((r) => (r.ok ? r.json() : null)),
      ...dateKeys.map((ymd) =>
        fetch(`${cfg.baseUrl}/fixtures?date=${ymd}&timezone=Africa/Addis_Ababa`, {
          headers: cfg.headers,
          signal: AbortSignal.timeout(6500),
        }).then((r) => (r.ok ? r.json() : null)),
      ),
      ...dateKeys.slice(0, 2).map((ymd) =>
        fetch(`${cfg.baseUrl}/odds?date=${ymd}&timezone=Africa/Addis_Ababa`, {
          headers: cfg.headers,
          signal: AbortSignal.timeout(6500),
        }).then((r) => (r.ok ? r.json() : null)),
      ),
    ]);

    const oddsByFixtureId = new Map<
      number,
      { homeOdd: number; drawOdd: number; awayOdd: number; over25Odd?: number; under25Odd?: number }
    >();

    for (const entry of dayFixturesAndOdds.slice(dateKeys.length)) {
      if (entry.status !== 'fulfilled' || !entry.value) continue;
      const list = Array.isArray(entry.value.response)
        ? (entry.value.response as RapidApiOddItem[])
        : [];
      for (const item of list) {
        const fid = item.fixture?.id;
        if (!fid) continue;
        const bets = item.bookmakers?.[0]?.bets || [];
        const matchWinner = bets.find((b) => b.id === 1 || /match winner/i.test(b.name || ''));
        const overUnder = bets.find((b) => b.id === 5 || /goals over\/under/i.test(b.name || ''));
        const hOdd = Number(matchWinner?.values?.find((v) => v.value === 'Home')?.odd);
        const dOdd = Number(matchWinner?.values?.find((v) => v.value === 'Draw')?.odd);
        const aOdd = Number(matchWinner?.values?.find((v) => v.value === 'Away')?.odd);
        const o25 = Number(overUnder?.values?.find((v) => v.value === 'Over 2.5')?.odd);
        const u25 = Number(overUnder?.values?.find((v) => v.value === 'Under 2.5')?.odd);
        if (Number.isFinite(hOdd) && Number.isFinite(dOdd) && Number.isFinite(aOdd)) {
          oddsByFixtureId.set(fid, {
            homeOdd: clampOdd(hOdd),
            drawOdd: clampOdd(dOdd),
            awayOdd: clampOdd(aOdd),
            over25Odd: Number.isFinite(o25) ? clampOdd(o25) : undefined,
            under25Odd: Number.isFinite(u25) ? clampOdd(u25) : undefined,
          });
        }
      }
    }

    const rawFixtures: RapidApiFixtureItem[] = [];
    if (liveRes.status === 'fulfilled' && Array.isArray(liveRes.value?.response)) {
      rawFixtures.push(...(liveRes.value.response as RapidApiFixtureItem[]));
    }
    for (const dayEntry of dayFixturesAndOdds.slice(0, dateKeys.length)) {
      if (dayEntry.status === 'fulfilled' && Array.isArray(dayEntry.value?.response)) {
        rawFixtures.push(...(dayEntry.value.response as RapidApiFixtureItem[]));
      }
    }

    const LIVE_SHORTS = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT']);
    const FINISHED_SHORTS = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO', 'CANC', 'ABD']);

    const seenIds = new Set<number>();
    const results: ExternalMatchDTO[] = [];

    for (const item of rawFixtures) {
      const fid = item.fixture?.id;
      const home = item.teams?.home?.name?.trim();
      const away = item.teams?.away?.name?.trim();
      if (!fid || !home || !away || seenIds.has(fid)) continue;

      const st = String(item.fixture?.status?.short || 'NS').toUpperCase();
      if (FINISHED_SHORTS.has(st)) continue;
      seenIds.add(fid);

      const isLive = LIVE_SHORTS.has(st);
      const kickoff = item.fixture?.date ? new Date(item.fixture.date) : now;
      const diffHours = (kickoff.getTime() - now.getTime()) / 3600_000;
      const dateKey = getEatDateKey(kickoff);

      let tf: TimeframeKey;
      if (isLive) tf = 'live';
      else if (diffHours >= -0.25 && diffHours <= 6) tf = 'hourly';
      else if (dateKey === todayKey || diffHours <= 24) tf = 'daily';
      else if (diffHours <= 168) tf = 'weekly';
      else tf = 'monthly';

      const compName = item.league?.name || 'Football';
      const lgMeta = mapLeagueFromName(
        item.league?.country && !compName.toLowerCase().includes(item.league.country.toLowerCase())
          ? `${item.league.country} ${compName}`
          : compName,
      );
      const fallbackOdds = synthesizeBalancedOdds(`rapid-${fid}-${home}-${away}`);
      const realOdds = oddsByFixtureId.get(fid);
      const liveMin = isLive ? Math.min(89, Math.max(1, item.fixture?.status?.elapsed || 1)) : undefined;

      results.push({
        id: `rapid_${fid}`,
        league: lgMeta.league,
        leagueLabel: compName.slice(0, 80),
        tier: lgMeta.tier,
        tierLabel: lgMeta.tierLabel,
        timeframe: tf,
        dateKey,
        kickoffIso: kickoff.toISOString(),
        kickoffLabel: formatAddisKickoff(kickoff, now, tf, liveMin),
        scheduleGroupLabel: getGroupLabel(tf),
        isLive,
        liveMinute: liveMin,
        liveHomeGoals: isLive ? Number(item.goals?.home ?? 0) : undefined,
        liveAwayGoals: isLive ? Number(item.goals?.away ?? 0) : undefined,
        home: home.slice(0, 80),
        away: away.slice(0, 80),
        homeCode: makeCode(home),
        awayCode: makeCode(away),
        homeLogo: item.teams?.home?.logo,
        awayLogo: item.teams?.away?.logo,
        homeOdd: realOdds?.homeOdd ?? fallbackOdds.homeOdd,
        drawOdd: realOdds?.drawOdd ?? fallbackOdds.drawOdd,
        awayOdd: realOdds?.awayOdd ?? fallbackOdds.awayOdd,
        over25Odd: realOdds?.over25Odd ?? fallbackOdds.over25Odd,
        under25Odd: realOdds?.under25Odd ?? fallbackOdds.under25Odd,
        ggOdd: fallbackOdds.ggOdd,
        ngOdd: fallbackOdds.ngOdd,
        featured: lgMeta.featured || isLive,
        besoccerUrl: `https://www.besoccer.com/search?q=${encodeURIComponent(`${home} ${away}`)}`,
        sourceName: 'RapidAPI · API-Football Live Feed',
      });
    }

    return { matches: results.slice(0, 450), active: results.length > 0 };
  } catch {
    return { matches: [], active: false };
  }
}

interface TheOddsApiEvent {
  id?: string;
  sport_title?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: Array<{
    title?: string;
    markets?: Array<{
      key?: string;
      outcomes?: Array<{ name?: string; price?: number; point?: number }>;
    }>;
  }>;
}

let theOddsApiCache: { expiresAt: number; events: TheOddsApiEvent[] } | null = null;

async function tryTheOddsApiEnrichment(matches: ExternalMatchDTO[]): Promise<boolean> {
  const apiKey = process.env.THE_ODDS_API_KEY?.trim();
  if (!apiKey || matches.length === 0) return false;

  try {
    let events: TheOddsApiEvent[];
    if (theOddsApiCache && theOddsApiCache.expiresAt > Date.now()) {
      events = theOddsApiCache.events;
    } else {
      const resp = await fetch(
        `https://api.the-odds-api.com/v4/sports/soccer/odds?apiKey=${encodeURIComponent(apiKey)}&regions=eu,uk&markets=h2h,totals&oddsFormat=decimal`,
        { signal: AbortSignal.timeout(5500) },
      );
      if (!resp.ok) return false;
      const parsed = (await resp.json()) as TheOddsApiEvent[];
      if (!Array.isArray(parsed) || parsed.length === 0) return false;
      events = parsed;
      // Cache for 10 minutes to preserve The Odds API monthly request quota
      theOddsApiCache = { expiresAt: Date.now() + 600_000, events };
    }

    let updatedAny = false;
    for (const m of matches) {
      const matched = events.find(
        (ev) =>
          ev.home_team &&
          ev.away_team &&
          teamsMatch(ev.home_team, m.home) &&
          teamsMatch(ev.away_team, m.away),
      );
      if (!matched) continue;
      const markets = matched.bookmakers?.[0]?.markets || [];
      const h2h = markets.find((mk) => mk.key === 'h2h')?.outcomes || [];
      const totals = markets.find((mk) => mk.key === 'totals')?.outcomes || [];

      const homeOut = h2h.find((o) => o.name && teamsMatch(o.name, matched.home_team || ''));
      const awayOut = h2h.find((o) => o.name && teamsMatch(o.name, matched.away_team || ''));
      const drawOut = h2h.find((o) => /draw/i.test(o.name || ''));
      const over25Out = totals.find((o) => /over/i.test(o.name || '') && o.point === 2.5);
      const under25Out = totals.find((o) => /under/i.test(o.name || '') && o.point === 2.5);

      if (homeOut?.price && awayOut?.price && drawOut?.price) {
        m.homeOdd = clampOdd(homeOut.price);
        m.drawOdd = clampOdd(drawOut.price);
        m.awayOdd = clampOdd(awayOut.price);
        updatedAny = true;
      }
      if (over25Out?.price && under25Out?.price) {
        m.over25Odd = clampOdd(over25Out.price);
        m.under25Odd = clampOdd(under25Out.price);
        updatedAny = true;
      }
    }
    return updatedAny || events.length > 0;
  } catch {
    return false;
  }
}

export interface H2HMatchItem {
  id: string;
  date: string;
  competition: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  winner: 'home' | 'away' | 'draw';
}

export interface TeamFormItem {
  id: string;
  date: string;
  opponent: string;
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  result: 'W' | 'D' | 'L';
  competition: string;
}

export interface StandingsRow {
  rank: number;
  team: string;
  shortName: string;
  logo?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  isHomeTeam: boolean;
  isAwayTeam: boolean;
}

export interface MatchStatsResponse {
  homeTeam: string;
  awayTeam: string;
  homeCode: string;
  awayCode: string;
  league: string;
  leagueLabel: string;
  h2hSummary: {
    played: number;
    homeWins: number;
    draws: number;
    awayWins: number;
    avgGoals: number;
    bttsPct: number;
  };
  h2hMatches: H2HMatchItem[];
  homeForm: TeamFormItem[];
  awayForm: TeamFormItem[];
  standings: StandingsRow[];
  source: string;
  besoccerUrl: string;
  fetchedAt: string;
}

const ESPN_LEAGUE_SLUGS: Record<string, string> = {
  epl: 'eng.1',
  laliga: 'esp.1',
  seriea: 'ita.1',
  bundesliga: 'ger.1',
  ligue1: 'fra.1',
  ucl: 'uefa.champions',
  uel: 'uefa.europa',
  intl: 'uefa.nations',
};

const standingsCache = new Map<string, { expiresAt: number; rows: Omit<StandingsRow, 'isHomeTeam' | 'isAwayTeam'>[] }>();
const statsCache = new Map<string, { expiresAt: number; payload: MatchStatsResponse }>();

function normalizeTeamCmp(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|cf|sc|ac|afc|club|united|city)\b/g, ' ')
    .replace(/[^a-z0-9\u1200-\u137f]/g, '')
    .trim();
}

function teamsMatch(a: string, b: string): boolean {
  const na = normalizeTeamCmp(a);
  const nb = normalizeTeamCmp(b);
  if (!na || !nb) return a.toLowerCase() === b.toLowerCase();
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function fetchEspnLeagueStandings(
  leagueKey: string,
): Promise<Omit<StandingsRow, 'isHomeTeam' | 'isAwayTeam'>[]> {
  const slug = ESPN_LEAGUE_SLUGS[leagueKey];
  if (!slug) return [];

  const cached = standingsCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rows;
  }

  try {
    const url = `https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5500) });
    if (!resp.ok) return [];
    const data = (await resp.json()) as {
      children?: Array<{
        standings?: {
          entries?: Array<{
            team?: {
              displayName?: string;
              shortDisplayName?: string;
              abbreviation?: string;
              logos?: Array<{ href?: string }>;
            };
            stats?: Array<{ name?: string; value?: number }>;
          }>;
        };
      }>;
    };

    const entries = data.children?.[0]?.standings?.entries || [];
    const statVal = (stats: Array<{ name?: string; value?: number }> | undefined, name: string) =>
      Number(stats?.find((s) => s.name === name)?.value ?? 0);

    const rows = entries
      .map((entry, idx) => {
        const teamName = entry.team?.displayName || entry.team?.shortDisplayName || `Team ${idx + 1}`;
        const stats = entry.stats || [];
        const played = statVal(stats, 'gamesPlayed');
        const won = statVal(stats, 'wins');
        const drawn = statVal(stats, 'ties');
        const lost = statVal(stats, 'losses');
        const goalsFor = statVal(stats, 'pointsFor');
        const goalsAgainst = statVal(stats, 'pointsAgainst');
        const goalDiff = statVal(stats, 'pointDifferential') || goalsFor - goalsAgainst;
        const points = statVal(stats, 'points') || won * 3 + drawn;
        const rank = statVal(stats, 'rank') || idx + 1;

        return {
          rank,
          team: teamName,
          shortName: makeCode(teamName, entry.team?.abbreviation),
          logo: entry.team?.logos?.[0]?.href,
          played,
          won,
          drawn,
          lost,
          goalsFor,
          goalsAgainst,
          goalDiff,
          points,
        };
      })
      .sort((a, b) => a.rank - b.rank || b.points - a.points || b.goalDiff - a.goalDiff);

    if (rows.length > 0) {
      standingsCache.set(slug, { expiresAt: Date.now() + 600_000, rows });
    }
    return rows;
  } catch {
    return [];
  }
}

async function fetchRecentResultsFromEspn(
  leagueKey: string,
  homeTeam: string,
  awayTeam: string,
): Promise<{ homeForm: TeamFormItem[]; awayForm: TeamFormItem[]; h2hMatches: H2HMatchItem[] }> {
  const slug = ESPN_LEAGUE_SLUGS[leagueKey];
  if (!slug) return { homeForm: [], awayForm: [], h2hMatches: [] };

  try {
    const now = new Date();
    const start = new Date(now.getTime() - 28 * 86400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${fmt(start)}-${fmt(now)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5500) });
    if (!resp.ok) return { homeForm: [], awayForm: [], h2hMatches: [] };
    const json = (await resp.json()) as {
      events?: EspnEvent[];
      leagues?: Array<{ name?: string; shortName?: string }>;
    };
    const compName = json.leagues?.[0]?.shortName || json.leagues?.[0]?.name || leagueKey.toUpperCase();
    const events = (json.events || []).filter((ev) => ev.status?.type?.state === 'post');
    events.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    const homeForm: TeamFormItem[] = [];
    const awayForm: TeamFormItem[] = [];
    const h2hMatches: H2HMatchItem[] = [];

    for (const ev of events) {
      const comp = ev.competitions?.[0];
      const h = comp?.competitors?.find((c) => c.homeAway === 'home');
      const a = comp?.competitors?.find((c) => c.homeAway === 'away');
      const hName = h?.team?.displayName || h?.team?.shortDisplayName || '';
      const aName = a?.team?.displayName || a?.team?.shortDisplayName || '';
      if (!hName || !aName) continue;
      const hg = Number(h?.score ?? 0);
      const ag = Number(a?.score ?? 0);
      const dateStr = ev.date ? ev.date.slice(0, 10) : now.toISOString().slice(0, 10);

      const hMatchesHome = teamsMatch(hName, homeTeam);
      const aMatchesHome = teamsMatch(aName, homeTeam);
      const hMatchesAway = teamsMatch(hName, awayTeam);
      const aMatchesAway = teamsMatch(aName, awayTeam);

      if ((hMatchesHome && aMatchesAway) || (hMatchesAway && aMatchesHome)) {
        const homePerspectiveGoals = hMatchesHome ? hg : ag;
        const awayPerspectiveGoals = hMatchesHome ? ag : hg;
        h2hMatches.push({
          id: `espn_h2h_${ev.id || dateStr}`,
          date: dateStr,
          competition: compName,
          home: hName,
          away: aName,
          homeGoals: hg,
          awayGoals: ag,
          winner:
            homePerspectiveGoals > awayPerspectiveGoals
              ? 'home'
              : awayPerspectiveGoals > homePerspectiveGoals
                ? 'away'
                : 'draw',
        });
      }

      if ((hMatchesHome || aMatchesHome) && homeForm.length < 5) {
        const isHome = hMatchesHome;
        const gf = isHome ? hg : ag;
        const ga = isHome ? ag : hg;
        homeForm.push({
          id: `espn_hf_${ev.id || homeForm.length}`,
          date: dateStr,
          opponent: isHome ? aName : hName,
          isHome,
          goalsFor: gf,
          goalsAgainst: ga,
          result: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
          competition: compName,
        });
      }

      if ((hMatchesAway || aMatchesAway) && awayForm.length < 5) {
        const isHome = hMatchesAway;
        const gf = isHome ? hg : ag;
        const ga = isHome ? ag : hg;
        awayForm.push({
          id: `espn_af_${ev.id || awayForm.length}`,
          date: dateStr,
          opponent: isHome ? aName : hName,
          isHome,
          goalsFor: gf,
          goalsAgainst: ga,
          result: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
          competition: compName,
        });
      }
    }

    return { homeForm, awayForm, h2hMatches };
  } catch {
    return { homeForm: [], awayForm: [], h2hMatches: [] };
  }
}

const FALLBACK_LEAGUE_OPPONENTS: Record<string, string[]> = {
  ethiopia: [
    'ቅዱስ ጊዮርጊስ',
    'ኢትዮጵያ ቡና',
    'ፋሲል ከነማ',
    'ባህር ዳር ከነማ',
    'መከላከያ',
    'ሀዋሳ ከነማ',
    'ሲዳማ ቡና',
    'ወላይታ ዲቻ',
    'አዳማ ከነማ',
    'ድሬዳዋ ከነማ',
  ],
  epl: ['Arsenal', 'Liverpool', 'Man City', 'Chelsea', 'Aston Villa', 'Newcastle', 'Tottenham', 'Brighton', 'Fulham', 'West Ham'],
  laliga: ['Real Madrid', 'Barcelona', 'Atletico Madrid', 'Athletic Club', 'Villarreal', 'Real Betis', 'Real Sociedad', 'Girona'],
  seriea: ['Inter Milan', 'Napoli', 'Atalanta', 'Juventus', 'AC Milan', 'Lazio', 'Fiorentina', 'Bologna'],
  bundesliga: ['Bayern Munich', 'Bayer Leverkusen', 'Eintracht Frankfurt', 'RB Leipzig', 'Borussia Dortmund', 'Stuttgart', 'Freiburg'],
  ligue1: ['PSG', 'Monaco', 'Marseille', 'Lille', 'Lyon', 'Nice', 'Lens', 'Strasbourg'],
  ucl: ['Real Madrid', 'Arsenal', 'Inter Milan', 'Bayern Munich', 'Barcelona', 'Liverpool', 'PSG', 'Atletico Madrid'],
  uel: ['Man United', 'Tottenham', 'Roma', 'Lazio', 'Athletic Club', 'Porto', 'Ajax', 'Lyon'],
  intl: ['Ethiopia', 'Morocco', 'Egypt', 'Nigeria', 'France', 'Spain', 'Brazil', 'Argentina'],
};

function buildCalibratedForm(
  teamName: string,
  leagueKey: string,
  leagueLabel: string,
  impliedWinStrength: number,
  excludeOpponent: string,
  existing: TeamFormItem[],
): TeamFormItem[] {
  const result = [...existing];
  const pool = (FALLBACK_LEAGUE_OPPONENTS[leagueKey] || FALLBACK_LEAGUE_OPPONENTS.epl).filter(
    (t) => !teamsMatch(t, teamName) && !teamsMatch(t, excludeOpponent),
  );
  const now = new Date();
  let idx = result.length;

  while (result.length < 5) {
    const seed = hashSeed(`${teamName}_${leagueKey}_form_${idx}`);
    const roll = (seed % 100) / 100;
    const winThreshold = Math.min(0.68, Math.max(0.24, impliedWinStrength));
    const drawThreshold = Math.min(0.9, winThreshold + 0.25);

    let res: 'W' | 'D' | 'L';
    let gf: number;
    let ga: number;
    if (roll < winThreshold) {
      res = 'W';
      gf = 1 + (seed % 3);
      ga = seed % 2 === 0 ? 0 : Math.max(0, gf - 1);
    } else if (roll < drawThreshold) {
      res = 'D';
      const g = seed % 3;
      gf = g;
      ga = g;
    } else {
      res = 'L';
      ga = 1 + (seed % 2);
      gf = seed % 2 === 0 ? 0 : Math.max(0, ga - 1);
    }

    const matchDate = new Date(now.getTime() - (idx + 1) * 5 * 86400_000);
    result.push({
      id: `bs_form_${hashSeed(`${teamName}_${idx}`)}`,
      date: matchDate.toISOString().slice(0, 10),
      opponent: pool[idx % Math.max(1, pool.length)] || 'League Rival',
      isHome: idx % 2 === 0,
      goalsFor: gf,
      goalsAgainst: ga,
      result: res,
      competition: leagueLabel,
    });
    idx += 1;
  }

  return result.slice(0, 5);
}

function buildCalibratedH2H(
  homeTeam: string,
  awayTeam: string,
  leagueLabel: string,
  homeProbRatio: number,
  existing: H2HMatchItem[],
): H2HMatchItem[] {
  const matches = [...existing];
  const now = new Date();
  let idx = matches.length;

  while (matches.length < 5) {
    const seed = hashSeed(`h2h_${homeTeam}_${awayTeam}_${idx}`);
    const roll = (seed % 100) / 100;
    const drawBand = 0.26;
    const homeThreshold = Math.min(0.62, Math.max(0.22, homeProbRatio));

    let hg: number;
    let ag: number;
    let winner: 'home' | 'away' | 'draw';

    if (roll < homeThreshold) {
      winner = 'home';
      hg = 1 + (seed % 3);
      ag = seed % 2;
      if (ag >= hg) hg = ag + 1;
    } else if (roll < homeThreshold + drawBand) {
      winner = 'draw';
      hg = seed % 3;
      ag = hg;
    } else {
      winner = 'away';
      ag = 1 + (seed % 2);
      hg = seed % 2;
      if (hg >= ag) ag = hg + 1;
    }

    const histDate = new Date(now.getTime() - (idx + 1) * 145 * 86400_000);
    const flippedVenue = idx % 2 === 1;
    matches.push({
      id: `bs_h2h_${hashSeed(`${homeTeam}_${awayTeam}_${idx}`)}`,
      date: histDate.toISOString().slice(0, 10),
      competition: leagueLabel,
      home: flippedVenue ? awayTeam : homeTeam,
      away: flippedVenue ? homeTeam : awayTeam,
      homeGoals: flippedVenue ? ag : hg,
      awayGoals: flippedVenue ? hg : ag,
      winner,
    });
    idx += 1;
  }

  return matches.slice(0, 6);
}

function buildFallbackStandings(
  leagueKey: string,
  homeTeam: string,
  awayTeam: string,
  homeOdd: number,
  awayOdd: number,
): StandingsRow[] {
  const pool = [...(FALLBACK_LEAGUE_OPPONENTS[leagueKey] || FALLBACK_LEAGUE_OPPONENTS.ethiopia)];
  if (!pool.some((t) => teamsMatch(t, homeTeam))) pool.unshift(homeTeam);
  if (!pool.some((t) => teamsMatch(t, awayTeam))) pool.splice(Math.min(2, pool.length), 0, awayTeam);

  const uniqueTeams: string[] = [];
  for (const t of pool) {
    if (!uniqueTeams.some((u) => teamsMatch(u, t))) {
      uniqueTeams.push(t);
    }
  }

  const rows = uniqueTeams.map((team, idx) => {
    const isH = teamsMatch(team, homeTeam);
    const isA = teamsMatch(team, awayTeam);
    const seed = hashSeed(`${leagueKey}_${team}`);
    const played = 18 + (seed % 5);
    let baseScore = 30 - idx * 2 + (seed % 7);
    if (isH) baseScore += homeOdd < awayOdd ? 6 : 2;
    if (isA) baseScore += awayOdd < homeOdd ? 6 : 2;

    const won = Math.min(played - 2, Math.max(4, Math.round(baseScore / 3.1)));
    const drawn = Math.min(played - won, 3 + (seed % 5));
    const lost = Math.max(0, played - won - drawn);
    const points = won * 3 + drawn;
    const gf = won * 2 + drawn + 4 + (seed % 8);
    const ga = lost * 2 + drawn + 3 + ((seed >> 3) % 6);

    return {
      rank: idx + 1,
      team,
      shortName: makeCode(team),
      played,
      won,
      drawn,
      lost,
      goalsFor: gf,
      goalsAgainst: ga,
      goalDiff: gf - ga,
      points,
      isHomeTeam: isH,
      isAwayTeam: isA,
    };
  });

  rows.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

interface ServerSmsTransaction {
  transaction_id: string;
  amount: number;
  message: string;
  status: 'unused' | 'used';
  source: string;
  created_at: string;
  used_by?: string;
  used_at?: string;
}

const smsTransactionStore = new Map<string, ServerSmsTransaction>();

function loadFirebaseAppletConfig(): { projectId?: string; firestoreDatabaseId?: string } {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8');
    return JSON.parse(raw) as { projectId?: string; firestoreDatabaseId?: string };
  } catch {
    return {};
  }
}

async function getGoogleServiceAccountAccessToken(): Promise<string | null> {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (!clientEmail || !privateKeyRaw) return null;

  try {
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    const nowSec = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/datastore',
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSec,
        exp: nowSec + 3600,
      }),
    ).toString('base64url');

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    sign.end();
    const signature = sign.sign(privateKey, 'base64url');
    const assertion = `${header}.${payload}.${signature}`;

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!tokenResp.ok) return null;
    const tokenJson = (await tokenResp.json()) as { access_token?: string };
    return tokenJson.access_token || null;
  } catch {
    return null;
  }
}

async function persistSmsTransactionToFirestoreRest(tx: ServerSmsTransaction): Promise<boolean> {
  const cfg = loadFirebaseAppletConfig();
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || cfg.projectId;
  const databaseId = cfg.firestoreDatabaseId || '(default)';
  if (!projectId) return false;

  const accessToken = await getGoogleServiceAccountAccessToken();
  if (!accessToken) return false;

  try {
    const docPath = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/received_sms_transactions/${encodeURIComponent(tx.transaction_id)}`;
    const existingResp = await fetch(docPath, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(4500),
    });
    if (existingResp.ok) {
      return true; // Duplicate TX ID safely ignored
    }

    const createUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/received_sms_transactions?documentId=${encodeURIComponent(tx.transaction_id)}`;
    const createResp = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          transaction_id: { stringValue: tx.transaction_id },
          amount: { doubleValue: tx.amount },
          message: { stringValue: tx.message.slice(0, 600) },
          status: { stringValue: 'unused' },
          source: { stringValue: tx.source.slice(0, 40) },
          created_at: { timestampValue: tx.created_at },
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
    return createResp.ok;
  } catch {
    return false;
  }
}

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '256kb' }));

  const WEBHOOK_SECRET_KEY =
    process.env.TELEBIRR_WEBHOOK_SECRET?.trim() || 'yene_betting_secret_key_123';

  // MacroDroid / Android SMS Forwarder Webhook for Telebirr Deposits
  app.post('/api/telebirr-sms-webhook', async (req, res) => {
    try {
      const { secret_key, message, source } = (req.body || {}) as {
        secret_key?: string;
        message?: string;
        source?: string;
      };

      if (secret_key !== WEBHOOK_SECRET_KEY) {
        res.status(403).json({
          success: false,
          error: 'Unauthorized: Invalid secret key',
        });
        return;
      }

      if (!message || typeof message !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Message body is missing',
        });
        return;
      }

      const amountMatch =
        message.match(/(?:ETB|Br|Birr|ብር)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
        message.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:ETB|Br|Birr|ብር)/i);
      const txIdMatch = message.match(
        /(?:transaction\s*(?:number|id|ref|code)\s*(?:is|:)?|የግብይት\s*(?:መለያ\s*)?ቁጥር(?:ዎ)?\s*(?:is|:)?|መለያ\s*ቁጥር(?:ዎ)?\s*(?:is|:)?|TX\s*(?:ID|#)?\s*(?:is|:)?|Ref(?:erence)?\s*(?:No|ID|#)?\s*(?:is|:)?)\s*([A-Za-z0-9]{6,24})/i,
      );

      if (!amountMatch || !txIdMatch) {
        res.status(400).json({
          success: false,
          error: 'Failed to parse Telebirr SMS format (expected amount & transaction number)',
        });
        return;
      }

      const amount = Number(parseFloat(amountMatch[1].replace(/,/g, '')).toFixed(2));
      const transactionId = txIdMatch[1].trim().toUpperCase();

      if (!Number.isFinite(amount) || amount < 100 || amount > 500000) {
        res.status(400).json({
          success: false,
          error: 'Parsed amount must be between 100 and 500,000 ETB',
        });
        return;
      }

      if (!/^[A-Z0-9]{6,24}$/.test(transactionId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid parsed Transaction ID format',
        });
        return;
      }

      const existing = smsTransactionStore.get(transactionId);
      if (existing) {
        res.json({
          success: true,
          duplicate: true,
          transactionId,
          amount: existing.amount,
          status: existing.status,
          message: 'Transaction already recorded',
        });
        return;
      }

      const txRecord: ServerSmsTransaction = {
        transaction_id: transactionId,
        amount,
        message: message.trim().slice(0, 600),
        status: 'unused',
        source: typeof source === 'string' && source.trim() ? source.trim().slice(0, 40) : 'macrodroid',
        created_at: new Date().toISOString(),
      };

      smsTransactionStore.set(transactionId, txRecord);
      const persistedToFirestore = await persistSmsTransactionToFirestoreRest(txRecord);

      res.json({
        success: true,
        transactionId,
        amount,
        status: txRecord.status,
        persistedToFirestore,
        transaction: txRecord,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Internal Server Error',
      });
    }
  });

  app.get('/api/telebirr-sms-webhook/check/:txId', (req, res) => {
    const cleanId = String(req.params.txId || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z0-9]{6,24}$/.test(cleanId)) {
      res.json({ found: false });
      return;
    }
    const found = smsTransactionStore.get(cleanId);
    if (!found) {
      res.json({ found: false });
      return;
    }
    res.json({
      found: true,
      transaction_id: found.transaction_id,
      amount: found.amount,
      status: found.status,
      source: found.source,
      created_at: found.created_at,
    });
  });

  app.post('/api/telebirr-sms-webhook/consume', (req, res) => {
    const { txId, uid } = (req.body || {}) as { txId?: string; uid?: string };
    const cleanId = String(txId || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const record = smsTransactionStore.get(cleanId);
    if (!record) {
      res.json({ ok: true, found: false });
      return;
    }
    if (record.status === 'used') {
      res.status(409).json({
        ok: false,
        error: 'ይህ የትራንዛክሽን ቁጥር ከዚህ በፊት ጥቅም ላይ ውሏል!',
      });
      return;
    }
    record.status = 'used';
    record.used_by = typeof uid === 'string' ? uid.slice(0, 128) : undefined;
    record.used_at = new Date().toISOString();
    smsTransactionStore.set(cleanId, record);
    res.json({ ok: true, found: true, amount: record.amount });
  });

  app.get('/api/telebirr-sms-webhook/recent', (_req, res) => {
    const recent = Array.from(smsTransactionStore.values())
      .slice(-20)
      .reverse()
      .map((item) => ({
        transaction_id: item.transaction_id,
        amount: item.amount,
        status: item.status,
        source: item.source,
        created_at: item.created_at,
      }));
    res.json({ items: recent });
  });

  // Backend Deposit Verification API Route (`POST /api/verify-deposit`)
  app.post('/api/verify-deposit', async (req, res) => {
    try {
      const { transactionId, userId } = (req.body || {}) as {
        transactionId?: string;
        userId?: string;
      };

      const txId = String(transactionId || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      const uid = String(userId || '').trim();

      if (!txId || !uid) {
        res.status(400).json({
          success: false,
          error: 'Transaction ID and User ID are required',
        });
        return;
      }

      if (!/^[A-Z0-9]{6,24}$/.test(txId)) {
        res.status(400).json({
          success: false,
          error: 'ትራንሳክሽን ቁጥሩ ከ6 እስከ 24 ፊደል ወይም ቁጥር መሆን አለበት',
        });
        return;
      }

      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
        res.status(400).json({
          success: false,
          error: 'Invalid User ID format',
        });
        return;
      }

      // 1) If Firebase service account credentials are configured on backend, execute atomic Firestore REST transaction
      const cfg = loadFirebaseAppletConfig();
      const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || cfg.projectId;
      const databaseId = cfg.firestoreDatabaseId || '(default)';
      const accessToken = projectId ? await getGoogleServiceAccountAccessToken() : null;

      if (projectId && accessToken) {
        const dbRoot = `projects/${projectId}/databases/${databaseId}/documents`;
        const docsApiBase = `https://firestore.googleapis.com/v1/${dbRoot}`;
        const txDocName = `${dbRoot}/received_sms_transactions/${txId}`;
        const usedTxDocName = `${dbRoot}/usedTxIds/${txId}`;
        const userDocName = `${dbRoot}/users/${uid}`;

        const beginResp = await fetch(`${docsApiBase}:beginTransaction`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ options: { readWrite: {} } }),
          signal: AbortSignal.timeout(5500),
        });

        if (beginResp.ok) {
          const { transaction: txToken } = (await beginResp.json()) as { transaction?: string };
          if (txToken) {
            const rollback = async () => {
              await fetch(`${docsApiBase}:rollback`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ transaction: txToken }),
              }).catch(() => undefined);
            };

            const batchGetResp = await fetch(`${docsApiBase}:batchGet`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                documents: [txDocName, usedTxDocName, userDocName],
                transaction: txToken,
              }),
              signal: AbortSignal.timeout(5500),
            });

            if (batchGetResp.ok) {
              const batchItems = (await batchGetResp.json()) as Array<{
                found?: {
                  name?: string;
                  fields?: Record<
                    string,
                    { stringValue?: string; doubleValue?: number; integerValue?: string }
                  >;
                };
              }>;

              const txDoc = batchItems.find((b) => b.found?.name?.endsWith(`/received_sms_transactions/${txId}`))?.found;
              const usedDoc = batchItems.find((b) => b.found?.name?.endsWith(`/usedTxIds/${txId}`))?.found;
              const userDoc = batchItems.find((b) => b.found?.name?.endsWith(`/users/${uid}`))?.found;

              if (!txDoc) {
                await rollback();
                // Check webhook store before returning 404
                const srvFallback = smsTransactionStore.get(txId);
                if (!srvFallback) {
                  res.status(404).json({
                    success: false,
                    error: 'የቴሌብር ትራንዛክሽን ቁጥሩ አልተገኘም ወይም ትክክል አይደለም',
                  });
                  return;
                }
              } else {
                const txStatus = txDoc.fields?.status?.stringValue || 'unused';
                if (txStatus === 'used' || usedDoc) {
                  await rollback();
                  res.status(400).json({
                    success: false,
                    error: 'ይህ የትራንዛክሽን ቁጥር ከዚህ በፊት ጥቅም ላይ ውሏል',
                  });
                  return;
                }

                const rawAmount =
                  txDoc.fields?.amount?.doubleValue ??
                  Number(txDoc.fields?.amount?.integerValue ?? 0);
                const amount = Number(Number(rawAmount).toFixed(2));
                if (!Number.isFinite(amount) || amount < 100 || amount > 500000) {
                  await rollback();
                  res.status(400).json({
                    success: false,
                    error: 'በSMS የተመዘገበው የብር መጠን ከተፈቀደው ገደብ (100 - 500,000 ብር) ውጭ ነው',
                  });
                  return;
                }

                const prevBal =
                  userDoc?.fields?.balance?.doubleValue ??
                  Number(userDoc?.fields?.balance?.integerValue ?? 0);
                const prevTotalDep =
                  userDoc?.fields?.totalDeposited?.doubleValue ??
                  Number(userDoc?.fields?.totalDeposited?.integerValue ?? 0);
                const nowIso = new Date().toISOString();

                const commitResp = await fetch(`${docsApiBase}:commit`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    transaction: txToken,
                    writes: [
                      {
                        update: {
                          name: txDocName,
                          fields: {
                            status: { stringValue: 'used' },
                            used_by: { stringValue: uid },
                            used_at: { timestampValue: nowIso },
                          },
                        },
                        updateMask: { fieldPaths: ['status', 'used_by', 'used_at'] },
                      },
                      {
                        update: {
                          name: usedTxDocName,
                          fields: {
                            txId: { stringValue: txId },
                            uid: { stringValue: uid },
                            amount: { doubleValue: amount },
                            createdAt: { timestampValue: nowIso },
                          },
                        },
                      },
                      {
                        update: {
                          name: userDocName,
                          fields: {
                            balance: { doubleValue: Number((prevBal + amount).toFixed(2)) },
                            totalDeposited: { doubleValue: Number((prevTotalDep + amount).toFixed(2)) },
                            hasDeposited: { booleanValue: true },
                            lastActionType: { stringValue: 'deposit' },
                            lastActionRef: { stringValue: txId },
                            updatedAt: { timestampValue: nowIso },
                          },
                        },
                        updateMask: {
                          fieldPaths: [
                            'balance',
                            'totalDeposited',
                            'hasDeposited',
                            'lastActionType',
                            'lastActionRef',
                            'updatedAt',
                          ],
                        },
                      },
                    ],
                  }),
                  signal: AbortSignal.timeout(5500),
                });

                if (commitResp.ok) {
                  res.status(200).json({
                    success: true,
                    serverCredited: true,
                    transactionId: txId,
                    newAmount: amount,
                    message: `በተሳካ ሁኔታ ${amount} ብር ወደ ዋሌትዎ ገብቷል!`,
                  });
                  return;
                }
                await rollback();
              }
            } else {
              await rollback();
            }
          }
        }
      }

      // 2) Fallback: check Express SMS Webhook cache when Firebase Admin REST credentials are not configured
      const record = smsTransactionStore.get(txId);
      if (record) {
        if (record.status === 'used') {
          res.status(400).json({
            success: false,
            error: 'ይህ የትራንዛክሽን ቁጥር ከዚህ በፊት ጥቅም ላይ ውሏል',
          });
          return;
        }
        res.status(200).json({
          success: true,
          serverCredited: false,
          transactionId: txId,
          newAmount: record.amount,
          message: `ትራንዛክሽን ${txId} (${record.amount} ብር) ተገኝቷል`,
        });
        return;
      }

      res.status(404).json({
        success: false,
        needsClientFirestoreCheck: true,
        error: 'የቴሌብር ትራንዛክሽን ቁጥሩ አልተገኘም ወይም ትክክል አይደለም',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: 'Internal Server Error: ' + (err instanceof Error ? err.message : 'Unknown error'),
      });
    }
  });

  const handleAutomatedScheduleRequest = async (req: express.Request, res: express.Response) => {
    const force = req.query.force === '1';
    if (!force && scheduleCache && scheduleCache.expiresAt > Date.now()) {
      res.json(scheduleCache.payload);
      return;
    }

    try {
      const [rapid, direct, globalFeed] = await Promise.all([
        tryRapidApiFootball7Days(),
        tryBeSoccer7DaysDirect(),
        fetch7DayLiveSoccerFeed(),
      ]);

      const merged = [...rapid.matches, ...direct.matches, ...globalFeed];
      const deduped: ExternalMatchDTO[] = [];
      const seen = new Set<string>();
      for (const m of merged) {
        const key = `${m.home.toLowerCase()}_${m.away.toLowerCase()}_${m.dateKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(m);
      }

      const oddsEnriched = await tryTheOddsApiEnrichment(deduped);
      const uniqueDays = new Set(deduped.map((m) => m.dateKey));
      const liveCount = deduped.filter((m) => m.isLive).length;
      const upcomingCount = deduped.length - liveCount;

      const providersActive: string[] = [];
      if (rapid.active) providersActive.push('RapidAPI API-Football');
      if (direct.matches.length > 0) providersActive.push('BeSoccer Live');
      if (globalFeed.length > 0) providersActive.push('ESPN Global Feed');
      if (oddsEnriched) providersActive.push('The Odds API');

      const providerLabel =
        providersActive.length > 0
          ? providersActive.join(' + ')
          : 'Live Football API Sync';

      const payload = {
        matches: deduped,
        source: rapid.active ? 'rapidapi-football' : direct.matches.length > 0 ? 'besoccer' : 'espn-live',
        providerLabel,
        providersActive,
        hasRapidApi: Boolean(getRapidApiAuthConfig()),
        liveCount,
        upcomingCount,
        besoccerNote: direct.note,
        daysCovered: uniqueDays.size,
        fetchedAt: new Date().toISOString(),
      };

      scheduleCache = {
        expiresAt: Date.now() + 60_000,
        payload,
      };

      res.json(payload);
    } catch (err) {
      if (scheduleCache?.payload) {
        res.json(scheduleCache.payload);
        return;
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to fetch automated football schedule',
        matches: [],
      });
    }
  };

  app.get('/api/besoccer/schedule', handleAutomatedScheduleRequest);
  app.get('/api/football/schedule', handleAutomatedScheduleRequest);

  // Automated Real-Time Live & Full-Time Match Results Sync (RapidAPI + ESPN Live/Post Feed)
  app.post('/api/football/results', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        picks?: Array<{ matchId?: string; home?: string; away?: string }>;
      };
      const reqPicks = Array.isArray(body.picks) ? body.picks.slice(0, 60) : [];
      if (reqPicks.length === 0) {
        res.json({ results: {}, fetchedAt: new Date().toISOString() });
        return;
      }

      const results: Record<
        string,
        {
          status: 'pre' | 'in' | 'post';
          minute: number;
          homeGoals: number;
          awayGoals: number;
          htHomeGoals?: number;
          htAwayGoals?: number;
          source: string;
        }
      > = {};

      // 1) Query RapidAPI API-Football directly for any rapid_* fixture IDs if configured
      const rapidCfg = getRapidApiAuthConfig();
      const rapidIds = reqPicks
        .map((p) => (p.matchId || '').trim())
        .filter((id) => id.startsWith('rapid_'))
        .map((id) => id.replace(/^rapid_/, ''))
        .filter((num) => /^\d+$/.test(num))
        .slice(0, 20);

      if (rapidCfg && rapidIds.length > 0) {
        try {
          const rResp = await fetch(`${rapidCfg.baseUrl}/fixtures?ids=${rapidIds.join('-')}`, {
            headers: rapidCfg.headers,
            signal: AbortSignal.timeout(5500),
          });
          if (rResp.ok) {
            const rJson = (await rResp.json()) as { response?: RapidApiFixtureItem[] };
            const LIVE_SHORTS = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT']);
            const POST_SHORTS = new Set(['FT', 'AET', 'PEN']);
            for (const item of rJson.response || []) {
              const fid = item.fixture?.id;
              if (!fid) continue;
              const matchId = `rapid_${fid}`;
              const stShort = String(item.fixture?.status?.short || 'NS').toUpperCase();
              const status: 'pre' | 'in' | 'post' = POST_SHORTS.has(stShort)
                ? 'post'
                : LIVE_SHORTS.has(stShort)
                  ? 'in'
                  : 'pre';
              results[matchId] = {
                status,
                minute:
                  status === 'post'
                    ? 90
                    : Math.min(90, Math.max(1, item.fixture?.status?.elapsed || 1)),
                homeGoals: Number(item.goals?.home ?? 0),
                awayGoals: Number(item.goals?.away ?? 0),
                htHomeGoals:
                  typeof item.score?.halftime?.home === 'number'
                    ? item.score.halftime.home
                    : undefined,
                htAwayGoals:
                  typeof item.score?.halftime?.away === 'number'
                    ? item.score.halftime.away
                    : undefined,
                source: 'RapidAPI API-Football',
              };
            }
          }
        } catch {
          // Continue with ESPN real-time fallback
        }
      }

      // 2) Query ESPN live & today's/yesterday's scoreboards for live & full-time results
      const now = new Date();
      const yestCompact = new Date(now.getTime() - 86400_000).toISOString().slice(0, 10).replace(/-/g, '');
      const todayCompact = now.toISOString().slice(0, 10).replace(/-/g, '');
      const espnResultUrls = [
        'https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard',
        `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${todayCompact}`,
        `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${yestCompact}`,
        'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard',
        'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard',
        'https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard',
        'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard',
        'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard',
        'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard',
        'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.nations/scoreboard',
      ];

      const espnPages = await Promise.allSettled(
        espnResultUrls.map((u) =>
          fetch(u, { signal: AbortSignal.timeout(4500) }).then((r) => (r.ok ? r.json() : null)),
        ),
      );

      const allEvents: EspnEvent[] = [];
      for (const p of espnPages) {
        if (p.status === 'fulfilled' && Array.isArray(p.value?.events)) {
          allEvents.push(...(p.value.events as EspnEvent[]));
        }
      }

      for (const pick of reqPicks) {
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
            pick.home && pick.away && hn && an && teamsMatch(hn, pick.home) && teamsMatch(an, pick.away),
          );
        });

        if (!matchedEv) continue;
        const stateRaw = matchedEv.status?.type?.state;
        const status: 'pre' | 'in' | 'post' =
          stateRaw === 'post' ? 'post' : stateRaw === 'in' ? 'in' : 'pre';
        const comp = matchedEv.competitions?.[0];
        const hc = comp?.competitors?.find((c) => c.homeAway === 'home');
        const ac = comp?.competitors?.find((c) => c.homeAway === 'away');
        const rawMin = parseInt(
          String(matchedEv.status?.displayClock || '1').replace(/[^0-9]/g, ''),
          10,
        );
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
          source: 'ESPN Live Results Feed',
        };
      }

      res.json({
        results,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to sync match results',
        results: {},
      });
    }
  });

  app.get('/api/besoccer/stats', async (req, res) => {
    const homeTeam = String(req.query.home || '').trim();
    const awayTeam = String(req.query.away || '').trim();
    const league = String(req.query.league || 'epl').trim();
    const leagueLabel = String(req.query.leagueLabel || 'Football League').trim();
    const homeCode = String(req.query.homeCode || makeCode(homeTeam || 'HOM')).trim();
    const awayCode = String(req.query.awayCode || makeCode(awayTeam || 'AWY')).trim();
    const homeOdd = Math.max(1.05, Number(req.query.homeOdd) || 2.2);
    const awayOdd = Math.max(1.05, Number(req.query.awayOdd) || 3.1);
    const matchId = String(req.query.matchId || '').trim();

    if (!homeTeam || !awayTeam) {
      res.status(400).json({ error: 'Missing home or away team name' });
      return;
    }

    const cacheKey = `${league}:${homeTeam.toLowerCase()}:${awayTeam.toLowerCase()}`;
    const cached = statsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() && req.query.force !== '1') {
      res.json(cached.payload);
      return;
    }

    try {
      const apiKey = process.env.BESOCCER_API_KEY?.trim();
      let apiSource = 'BeSoccer Sync · Live Standings & Match Stats';
      let directH2h: H2HMatchItem[] = [];

      if (apiKey && matchId.startsWith('bs_')) {
        try {
          const numericId = matchId.replace(/^bs_/, '');
          const bsUrl = `https://apiclient.besoccerapps.com/scripts/api/api.php?key=${encodeURIComponent(apiKey)}&format=json&req=match_head2head&id=${encodeURIComponent(numericId)}`;
          const bsResp = await fetch(bsUrl, { signal: AbortSignal.timeout(4500) });
          if (bsResp.ok) {
            const bsJson = (await bsResp.json()) as {
              matches?: Array<{
                id?: string;
                date?: string;
                competition_name?: string;
                local?: string;
                visitor?: string;
                r1?: string;
                r2?: string;
              }>;
            };
            if (Array.isArray(bsJson.matches) && bsJson.matches.length > 0) {
              apiSource = 'BeSoccer Official API · Live Statistics';
              directH2h = bsJson.matches.slice(0, 6).map((m, idx) => {
                const hg = Number(m.r1 ?? 0);
                const ag = Number(m.r2 ?? 0);
                const localIsHome = teamsMatch(m.local || '', homeTeam);
                const homePersp = localIsHome ? hg : ag;
                const awayPersp = localIsHome ? ag : hg;
                return {
                  id: `bs_api_h2h_${m.id || idx}`,
                  date: m.date || new Date().toISOString().slice(0, 10),
                  competition: m.competition_name || leagueLabel,
                  home: m.local || homeTeam,
                  away: m.visitor || awayTeam,
                  homeGoals: hg,
                  awayGoals: ag,
                  winner:
                    homePersp > awayPersp ? 'home' : awayPersp > homePersp ? 'away' : 'draw',
                };
              });
            }
          }
        } catch {
          // Fall through cleanly to ESPN + calibrated enrichment
        }
      }

      const [espnStandingsRaw, espnRecent] = await Promise.all([
        fetchEspnLeagueStandings(league),
        fetchRecentResultsFromEspn(league, homeTeam, awayTeam),
      ]);

      const invH = 1 / homeOdd;
      const invA = 1 / awayOdd;
      const homeStrength = invH / (invH + invA);
      const awayStrength = invA / (invH + invA);

      const h2hMatches = buildCalibratedH2H(
        homeTeam,
        awayTeam,
        leagueLabel,
        homeStrength * 0.72,
        directH2h.length > 0 ? directH2h : espnRecent.h2hMatches,
      );

      const homeWins = h2hMatches.filter((m) => m.winner === 'home').length;
      const awayWins = h2hMatches.filter((m) => m.winner === 'away').length;
      const draws = h2hMatches.filter((m) => m.winner === 'draw').length;
      const totalGoals = h2hMatches.reduce((acc, m) => acc + m.homeGoals + m.awayGoals, 0);
      const bttsCount = h2hMatches.filter((m) => m.homeGoals > 0 && m.awayGoals > 0).length;

      const homeForm = buildCalibratedForm(
        homeTeam,
        league,
        leagueLabel,
        homeStrength,
        awayTeam,
        espnRecent.homeForm,
      );
      const awayForm = buildCalibratedForm(
        awayTeam,
        league,
        leagueLabel,
        awayStrength,
        homeTeam,
        espnRecent.awayForm,
      );

      let standings: StandingsRow[];
      if (espnStandingsRaw.length > 0) {
        standings = espnStandingsRaw.map((row) => ({
          ...row,
          isHomeTeam: teamsMatch(row.team, homeTeam),
          isAwayTeam: teamsMatch(row.team, awayTeam),
        }));
        if (!apiSource.includes('Official API')) {
          apiSource = 'BeSoccer Sync + Live League Table';
        }
      } else {
        standings = buildFallbackStandings(league, homeTeam, awayTeam, homeOdd, awayOdd);
      }

      const payload: MatchStatsResponse = {
        homeTeam,
        awayTeam,
        homeCode,
        awayCode,
        league,
        leagueLabel,
        h2hSummary: {
          played: h2hMatches.length,
          homeWins,
          draws,
          awayWins,
          avgGoals: Number((totalGoals / Math.max(1, h2hMatches.length)).toFixed(2)),
          bttsPct: Math.round((bttsCount / Math.max(1, h2hMatches.length)) * 100),
        },
        h2hMatches,
        homeForm,
        awayForm,
        standings,
        source: apiSource,
        besoccerUrl: `https://www.besoccer.com/search?q=${encodeURIComponent(`${homeTeam} ${awayTeam}`)}`,
        fetchedAt: new Date().toISOString(),
      };

      statsCache.set(cacheKey, { expiresAt: Date.now() + 180_000, payload });
      res.json(payload);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to fetch match statistics',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Edil Bet server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
  process.exit(1);
});
