import {
  CoinChoice,
  D100Direction,
  DiceSubMode,
  DoubleDiceBetMode,
  FootballMarketKey,
  FootballTicketPick,
  GameConfig,
  SingleDiceBetMode,
} from '../types';
import {
  estimateFootballLegLiveWinProb,
  evaluateFootballPickOutcome,
} from './footballMarkets';

export type GameConfigValues = Omit<GameConfig, 'updatedBy' | 'updatedAt'>;

export const DEFAULT_GAME_CONFIG: GameConfigValues = {
  minBet: 10,
  maxBet: 50000,
  houseWinRate: 0.28,
  singleDiceRangeOdds: 2,
  singleDiceExactOdds: 5.5,
  doubleDiceRangeOdds: 2.2,
  doubleDiceLucky7Odds: 5,
  coinOdds: 2,
  luckyOdds: 18,
  footballOddsScale: 1,
  footballMaxOdds: 500,
};

export const DOUBLE_SUM_MULTIPLIERS: Record<number, number> = {
  2: 30,
  3: 15,
  4: 10,
  5: 8,
  6: 6,
  7: 5,
  8: 6,
  9: 8,
  10: 10,
  11: 15,
  12: 30,
};

export function formatETB(amount: number): string {
  return (
    Number(amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' ብር'
  );
}

export function getD100Stats(direction: D100Direction, target: number) {
  const safeTarget = Math.min(99, Math.max(2, target));
  const winCount =
    direction === 'under' ? Math.max(1, safeTarget - 1) : Math.max(1, 100 - safeTarget);
  const rangeText =
    direction === 'under'
      ? `ከ ${safeTarget} በታች (1 - ${safeTarget - 1})`
      : `ከ ${safeTarget} በላይ (${safeTarget + 1} - 100)`;
  const multiplier = Number((95 / winCount).toFixed(2));
  return { winCount, rangeText, multiplier };
}

function randomChoice<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Reduced win chance probability engine ("የመብላት ቻንሳቸዉን ቀንስ"):
 * Scales natural probability by (houseWinRate / 0.5).
 * Example: with default houseWinRate = 0.28, a 50/50 bet wins 28% of the time,
 * a 1-in-6 exact die wins ~9.3% instead of 16.7%, and a 1-in-20 lucky number wins ~2.8% instead of 5%.
 */
function rollWithHouseEdge(fairWinProbability: number, houseWinRate: number): boolean {
  const clampedBase = Math.min(0.5, Math.max(0.05, houseWinRate));
  const scaleFactor = clampedBase / 0.5;
  const adjustedProbability = Math.min(0.85, Math.max(0.015, fairWinProbability * scaleFactor));
  return Math.random() < adjustedProbability;
}

export interface SingleDiceOutcome {
  rolled: number;
  won: boolean;
  multiplier: number;
  choiceText: string;
  resultText: string;
  payout: number;
}

export function evaluateSingleDice(
  mode: SingleDiceBetMode,
  exactNum: number,
  betAmount: number,
  houseWinRate: number,
  customRangeOdds = DEFAULT_GAME_CONFIG.singleDiceRangeOdds,
  customExactOdds = DEFAULT_GAME_CONFIG.singleDiceExactOdds,
): SingleDiceOutcome {
  const all = [1, 2, 3, 4, 5, 6];
  let winningValues: number[];
  let multiplier: number;
  let choiceText: string;

  if (mode === 'low') {
    winningValues = [1, 2, 3];
    multiplier = customRangeOdds;
    choiceText = 'ዝቅተኛ (1-3)';
  } else if (mode === 'high') {
    winningValues = [4, 5, 6];
    multiplier = customRangeOdds;
    choiceText = 'ከፍተኛ (4-6)';
  } else {
    winningValues = [exactNum];
    multiplier = customExactOdds;
    choiceText = `ቁጥር ${exactNum}`;
  }

  const losingValues = all.filter((v) => !winningValues.includes(v));
  const won = rollWithHouseEdge(winningValues.length / 6, houseWinRate);
  const rolled = won ? randomChoice(winningValues) : randomChoice(losingValues);
  const payout = won ? Number((betAmount * multiplier).toFixed(2)) : 0;

  return {
    rolled,
    won,
    multiplier,
    choiceText,
    resultText: `ቁጥር ${rolled} ወጣ • ምርጫ: ${choiceText}`,
    payout,
  };
}

export interface DoubleDiceOutcome {
  die1: number;
  die2: number;
  sum: number;
  won: boolean;
  multiplier: number;
  choiceText: string;
  resultText: string;
  payout: number;
}

export function evaluateDoubleDice(
  mode: DoubleDiceBetMode,
  exactSum: number,
  betAmount: number,
  houseWinRate: number,
  customRangeOdds = DEFAULT_GAME_CONFIG.doubleDiceRangeOdds,
  customLucky7Odds = DEFAULT_GAME_CONFIG.doubleDiceLucky7Odds,
): DoubleDiceOutcome {
  const pairs: Array<[number, number, number]> = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      pairs.push([a, b, a + b]);
    }
  }

  let isWinSum: (s: number) => boolean;
  let multiplier: number;
  let choiceText: string;

  if (mode === 'low') {
    isWinSum = (s) => s >= 2 && s <= 6;
    multiplier = customRangeOdds;
    choiceText = 'ዝቅተኛ (2-6)';
  } else if (mode === 'lucky7') {
    isWinSum = (s) => s === 7;
    multiplier = customLucky7Odds;
    choiceText = 'እድለኛ 7';
  } else if (mode === 'high') {
    isWinSum = (s) => s >= 8 && s <= 12;
    multiplier = customRangeOdds;
    choiceText = 'ከፍተኛ (8-12)';
  } else {
    isWinSum = (s) => s === exactSum;
    multiplier = DOUBLE_SUM_MULTIPLIERS[exactSum] || customLucky7Odds;
    choiceText = `ድምር ${exactSum}`;
  }

  const winPairs = pairs.filter(([, , s]) => isWinSum(s));
  const losePairs = pairs.filter(([, , s]) => !isWinSum(s));
  const won = rollWithHouseEdge(winPairs.length / 36, houseWinRate);
  const [die1, die2, sum] = won ? randomChoice(winPairs) : randomChoice(losePairs);
  const payout = won ? Number((betAmount * multiplier).toFixed(2)) : 0;

  return {
    die1,
    die2,
    sum,
    won,
    multiplier,
    choiceText,
    resultText: `ድምር ${sum} (${die1}+${die2}) • ምርጫ: ${choiceText}`,
    payout,
  };
}

export interface D100Outcome {
  rolled: number;
  won: boolean;
  multiplier: number;
  choiceText: string;
  resultText: string;
  payout: number;
}

export function evaluateD100(
  direction: D100Direction,
  target: number,
  betAmount: number,
  houseWinRate: number,
): D100Outcome {
  const stats = getD100Stats(direction, target);
  const winNums: number[] = [];
  const loseNums: number[] = [];
  for (let n = 1; n <= 100; n++) {
    const match = direction === 'under' ? n < target : n > target;
    if (match) winNums.push(n);
    else loseNums.push(n);
  }

  const won = rollWithHouseEdge(winNums.length / 100, houseWinRate);
  const rolled = won ? randomChoice(winNums) : randomChoice(loseNums);
  const payout = won ? Number((betAmount * stats.multiplier).toFixed(2)) : 0;

  return {
    rolled,
    won,
    multiplier: stats.multiplier,
    choiceText: stats.rangeText,
    resultText: `ቁጥር ${rolled} • ${stats.rangeText}`,
    payout,
  };
}

export interface CoinOutcome {
  outcome: CoinChoice;
  won: boolean;
  multiplier: number;
  choiceText: string;
  resultText: string;
  payout: number;
}

export function evaluateCoin(
  choice: CoinChoice,
  betAmount: number,
  houseWinRate: number,
  customCoinOdds = DEFAULT_GAME_CONFIG.coinOdds,
): CoinOutcome {
  const won = rollWithHouseEdge(0.5, houseWinRate);
  const outcome: CoinChoice = won ? choice : choice === 'heads' ? 'tails' : 'heads';
  const multiplier = customCoinOdds;
  const payout = won ? Number((betAmount * multiplier).toFixed(2)) : 0;
  const choiceText = choice === 'heads' ? 'ዘውድ (Heads)' : 'ጎራዴ (Tails)';
  const resultText = `${outcome === 'heads' ? 'ዘውድ' : 'ጎራዴ'} ወጣ • ምርጫ: ${choiceText}`;

  return {
    outcome,
    won,
    multiplier,
    choiceText,
    resultText,
    payout,
  };
}

export interface LuckyOutcome {
  winningNum: number;
  won: boolean;
  multiplier: number;
  choiceText: string;
  resultText: string;
  payout: number;
}

export function evaluateLucky(
  choice: number,
  betAmount: number,
  houseWinRate: number,
  customLuckyOdds = DEFAULT_GAME_CONFIG.luckyOdds,
): LuckyOutcome {
  const all = Array.from({ length: 20 }, (_, i) => i + 1);
  const loseNums = all.filter((n) => n !== choice);
  const won = rollWithHouseEdge(1 / 20, houseWinRate);
  const winningNum = won ? choice : randomChoice(loseNums);
  const multiplier = customLuckyOdds;
  const payout = won ? Number((betAmount * multiplier).toFixed(2)) : 0;

  return {
    winningNum,
    won,
    multiplier,
    choiceText: `ቁጥር ${choice}`,
    resultText: `ቁጥር ${winningNum} (ምርጫ: ${choice})`,
    payout,
  };
}

export function getDiceGameLabel(subMode: DiceSubMode): string {
  if (subMode === 'single') return 'ባለ 1 ዳይስ (1-6)';
  if (subMode === 'double') return 'ባለ 2 ዳይስ (2-12)';
  return 'ባለ 100 ዳይስ (1-100)';
}

export const CASHOUT_MIN_MINUTE = 5;
export const CASHOUT_MAX_MINUTE = 80;
export const CASHOUT_FEE_RATE = 0.12;
export const CASHOUT_MIN_STAKE_RATIO = 0.2;
export const CASHOUT_MAX_PAYOUT_RATIO = 0.88;
export const CASHOUT_MIN_AMOUNT = 5;

export function checkFootballMarketHit(
  market: FootballMarketKey,
  hg: number,
  ag: number,
  pick?: Partial<FootballTicketPick>,
): boolean {
  const fullPick: FootballTicketPick = {
    matchId: pick?.matchId || '',
    home: pick?.home || '',
    away: pick?.away || '',
    homeCode: pick?.homeCode || '',
    awayCode: pick?.awayCode || '',
    market,
    odd: pick?.odd ?? 1.5,
    homeGoals: hg,
    awayGoals: ag,
    htHomeGoals: pick?.htHomeGoals,
    htAwayGoals: pick?.htAwayGoals,
    homeCards: pick?.homeCards,
    awayCards: pick?.awayCards,
    homeCorners: pick?.homeCorners,
    awayCorners: pick?.awayCorners,
    homeRedCards: pick?.homeRedCards,
    awayRedCards: pick?.awayRedCards,
    hit: false,
  };
  return evaluateFootballPickOutcome(fullPick, false) === 'win';
}

export interface CashoutQuote {
  eligible: boolean;
  offer: number;
  reason: string;
}

export function computeFootballCashout(
  picks: import('../types').FootballTicketPick[],
  betAmount: number,
  potentialPayout: number,
  minute: number,
): CashoutQuote {
  if (picks.length === 0) {
    return { eligible: false, offer: 0, reason: 'ምንም የተመረጠ ጨዋታ የለም' };
  }

  if (minute < CASHOUT_MIN_MINUTE) {
    return {
      eligible: false,
      offer: 0,
      reason: `ካሽአውት ከ ${CASHOUT_MIN_MINUTE}' ደቂቃ በኋላ ይከፈታል`,
    };
  }

  if (minute > CASHOUT_MAX_MINUTE) {
    return {
      eligible: false,
      offer: 0,
      reason: `ከ ${CASHOUT_MAX_MINUTE}' ደቂቃ በኋላ የመጨረሻ ደቂቃ እገዳ ስለሆነ ካሽአውት ተዘግቷል`,
    };
  }

  let combinedProb = 1;
  let bustedCount = 0;
  let losingLegs = 0;

  for (const p of picks) {
    const prob = estimateFootballLegLiveWinProb(p, minute);
    if (prob <= 0) bustedCount += 1;
    if (evaluateFootballPickOutcome(p, false) === 'loss') {
      losingLegs += 1;
    }
    combinedProb *= prob;
  }

  if (bustedCount > 0) {
    return {
      eligible: false,
      offer: 0,
      reason: 'አንድ ወይም ከዚያ በላይ ምርጫዎች ቀድሞ ስለተበላሹ ካሽአውት ተዘግቷል',
    };
  }

  if (picks.length > 1 && minute >= 60 && losingLegs > picks.length / 2) {
    return {
      eligible: false,
      offer: 0,
      reason: "ከ 60' በኋላ ከግማሽ በላይ ጨዋታዎች እየተሸነፉ ስለሆነ ካሽአውት ታግዷል",
    };
  }

  const rawOffer = potentialPayout * combinedProb * (1 - CASHOUT_FEE_RATE);
  const maxAllowed = Number((potentialPayout * CASHOUT_MAX_PAYOUT_RATIO).toFixed(2));
  const offer = Math.min(maxAllowed, Number(rawOffer.toFixed(2)));
  const minAllowed = Math.max(
    CASHOUT_MIN_AMOUNT,
    Number((betAmount * CASHOUT_MIN_STAKE_RATIO).toFixed(2)),
  );

  if (offer < minAllowed) {
    return {
      eligible: false,
      offer: 0,
      reason: `የካሽአውት ዋጋ ከዝቅተኛው ገደብ (${formatETB(minAllowed)}) በታች ስለወረደ ተዘግቷል`,
    };
  }

  return {
    eligible: true,
    offer,
    reason: 'ካሽአውት ክፍት ነው — አሁን ከወሰዱ ወዲያውኑ ወደ ቦርሳዎ ይገባል',
  };
}

export function advanceLiveMatchTick(
  picks: FootballTicketPick[],
  houseWinRate: number,
  currentMinute = 1,
): FootballTicketPick[] {
  const rateScale = Math.min(0.5, Math.max(0.05, houseWinRate)) / 0.28;
  const isFirstHalf = currentMinute <= 45;

  return picks.map((p) => {
    let hg = p.homeGoals;
    let ag = p.awayGoals;
    let hth = p.htHomeGoals ?? Math.min(hg, Math.floor(hg * 0.5));
    let hta = p.htAwayGoals ?? Math.min(ag, Math.floor(ag * 0.5));
    let hCards = p.homeCards ?? 0;
    let aCards = p.awayCards ?? 0;
    let hRed = p.homeRedCards ?? 0;
    let aRed = p.awayRedCards ?? 0;
    let hCorners = p.homeCorners ?? 0;
    let aCorners = p.awayCorners ?? 0;

    const total = hg + ag;
    if (total < 6) {
      let homeGoalChance = 0.044;
      let awayGoalChance = 0.04;

      if (p.market === '1' || p.market === 'DNB_1') {
        homeGoalChance *= Math.min(1.25, 0.88 * rateScale);
        awayGoalChance *= 1.08;
      } else if (p.market === '2' || p.market === 'DNB_2') {
        awayGoalChance *= Math.min(1.25, 0.88 * rateScale);
        homeGoalChance *= 1.08;
      } else if (p.market === 'O25' || p.market === 'GG' || p.market === 'O15') {
        homeGoalChance *= 0.92 * Math.min(1.15, rateScale);
        awayGoalChance *= 0.92 * Math.min(1.15, rateScale);
      } else if (p.market === 'U25' || p.market === 'NG' || p.market === 'U15') {
        homeGoalChance *= 1.08;
        awayGoalChance *= 1.08;
      }

      if (Math.random() < homeGoalChance) {
        hg += 1;
        if (isFirstHalf) hth += 1;
      }
      if (Math.random() < awayGoalChance && hg + ag < 6) {
        ag += 1;
        if (isFirstHalf) hta += 1;
      }
    }

    // Cards progression (~3.8 cards/match avg across ~45 ticks)
    if (hCards + aCards < 9) {
      if (Math.random() < 0.055) hCards += 1;
      if (Math.random() < 0.055) aCards += 1;
    }
    if (hRed + aRed < 2 && Math.random() < 0.0055) {
      if (Math.random() < 0.5) {
        hRed += 1;
        hCards += 1;
      } else {
        aRed += 1;
        aCards += 1;
      }
    }

    // Corners progression (~9.2 corners/match avg across ~45 ticks)
    if (hCorners + aCorners < 18) {
      if (Math.random() < 0.13) hCorners += 1;
      if (Math.random() < 0.12) aCorners += 1;
    }

    const updatedPick: FootballTicketPick = {
      ...p,
      homeGoals: hg,
      awayGoals: ag,
      htHomeGoals: hth,
      htAwayGoals: hta,
      homeCards: hCards,
      awayCards: aCards,
      homeRedCards: hRed,
      awayRedCards: aRed,
      homeCorners: hCorners,
      awayCorners: aCorners,
      hit: false,
    };

    return {
      ...updatedPick,
      hit: evaluateFootballPickOutcome(updatedPick, false) === 'win',
    };
  });
}
