import { ScheduledMatch } from './footballSchedule';

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

export async function fetchMatchStats(
  match: ScheduledMatch,
  forceRefresh = false,
): Promise<MatchStatsResponse> {
  const params = new URLSearchParams({
    home: match.home,
    away: match.away,
    homeCode: match.homeCode,
    awayCode: match.awayCode,
    league: match.league,
    leagueLabel: match.leagueLabel,
    homeOdd: String(match.odds['1'] ?? 2.2),
    awayOdd: String(match.odds['2'] ?? 3.1),
    matchId: match.id,
  });
  if (match.besoccerUrl) {
    params.set('besoccerUrl', match.besoccerUrl);
  }
  if (forceRefresh) {
    params.set('force', '1');
  }

  const resp = await fetch(`/api/besoccer/stats?${params.toString()}`);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  return (await resp.json()) as MatchStatsResponse;
}
