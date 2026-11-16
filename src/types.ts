import { Timestamp } from 'firebase/firestore';

export type GameCategory = 'dice' | 'coin' | 'lucky';
export type DiceSubMode = 'single' | 'double' | 'd100';
export type SingleDiceBetMode = 'low' | 'high' | 'exact';
export type DoubleDiceBetMode = 'low' | 'lucky7' | 'high' | 'exact';
export type D100Direction = 'under' | 'over';
export type CoinChoice = 'heads' | 'tails';
export type FootballMarketKey =
  | '1'
  | 'X'
  | '2'
  | '1X'
  | '12'
  | 'X2'
  | 'DNB_1'
  | 'DNB_2'
  | 'O05'
  | 'U05'
  | 'O15'
  | 'U15'
  | 'O25'
  | 'U25'
  | 'O35'
  | 'U35'
  | 'O45'
  | 'U45'
  | 'GG'
  | 'NG'
  | 'FH_1'
  | 'FH_X'
  | 'FH_2'
  | 'FH_1X'
  | 'FH_12'
  | 'FH_X2'
  | 'FH_O05'
  | 'FH_U05'
  | 'FH_O15'
  | 'FH_U15'
  | 'FH_O25'
  | 'FH_U25'
  | 'FH_GG'
  | 'FH_NG'
  | 'FH_HCP_H1'
  | 'FH_HCP_A1'
  | 'FH_HT_O05'
  | 'FH_HT_O15'
  | 'FH_AT_O05'
  | 'FH_AT_O15'
  | 'FH_EXG_0'
  | 'FH_EXG_1'
  | 'FH_EXG_2'
  | 'FH_EXG_3P'
  | 'FH_MG_1_2'
  | 'FH_MG_1_3'
  | 'FH_MG_2_3'
  | 'FH_1_GG'
  | 'FH_X_GG'
  | 'FH_2_GG'
  | 'FH_1_O15'
  | 'FH_2_O15'
  | 'FH_1X_GG'
  | 'FH_X2_GG'
  | 'FH_CS_0_0'
  | 'FH_CS_1_0'
  | 'FH_CS_0_1'
  | 'FH_CS_1_1'
  | 'FH_CS_2_0'
  | 'FH_CS_0_2'
  | 'FH_CS_2_1'
  | 'FH_CS_1_2'
  | 'MG_0'
  | 'MG_1_2'
  | 'MG_1_3'
  | 'MG_1_4'
  | 'MG_1_5'
  | 'MG_1_6'
  | 'MG_2_3'
  | 'MG_2_4'
  | 'MG_2_5'
  | 'MG_2_6'
  | 'MG_3_4'
  | 'MG_3_5'
  | 'MG_3_6'
  | 'MG_4_5'
  | 'MG_4_6'
  | 'MG_5_6'
  | 'MG_7P'
  | 'HT_O05'
  | 'HT_U05'
  | 'HT_O15'
  | 'HT_U15'
  | 'HT_O25'
  | 'HT_U25'
  | 'AT_O05'
  | 'AT_U05'
  | 'AT_O15'
  | 'AT_U15'
  | 'AT_O25'
  | 'AT_U25'
  | 'HMG_0'
  | 'HMG_1_2'
  | 'HMG_1_3'
  | 'HMG_2_3'
  | 'HMG_4P'
  | 'AMG_0'
  | 'AMG_1_2'
  | 'AMG_1_3'
  | 'AMG_2_3'
  | 'AMG_4P'
  | 'HCP_H1'
  | 'HCP_D1'
  | 'HCP_A1'
  | 'HCP_HP1'
  | 'HCP_AP1'
  | 'WM_H1'
  | 'WM_H2P'
  | 'WM_D'
  | 'WM_A1'
  | 'WM_A2P'
  | 'EXG_0'
  | 'EXG_1'
  | 'EXG_2'
  | 'EXG_3'
  | 'EXG_4'
  | 'EXG_5P'
  | 'HEX_0'
  | 'HEX_1'
  | 'HEX_2'
  | 'HEX_3P'
  | 'AEX_0'
  | 'AEX_1'
  | 'AEX_2'
  | 'AEX_3P'
  | 'H_CS_YES'
  | 'H_CS_NO'
  | 'A_CS_YES'
  | 'A_CS_NO'
  | 'H_WTN_YES'
  | 'H_WTN_NO'
  | 'A_WTN_YES'
  | 'A_WTN_NO'
  | 'C_1_GG'
  | 'C_1_NG'
  | 'C_X_GG'
  | 'C_X_NG'
  | 'C_2_GG'
  | 'C_2_NG'
  | 'C_O25_GG'
  | 'C_O25_NG'
  | 'C_U25_GG'
  | 'C_U25_NG'
  | 'C_1_O25'
  | 'C_1_U25'
  | 'C_X_O25'
  | 'C_X_U25'
  | 'C_2_O25'
  | 'C_2_U25'
  | 'C_1X_GG'
  | 'C_1X_NG'
  | 'C_X2_GG'
  | 'C_X2_NG'
  | 'C_12_GG'
  | 'C_12_NG'
  | 'C_1X_O25'
  | 'C_1X_U25'
  | 'C_X2_O25'
  | 'C_X2_U25'
  | 'HTFT_1_1'
  | 'HTFT_1_X'
  | 'HTFT_1_2'
  | 'HTFT_X_1'
  | 'HTFT_X_X'
  | 'HTFT_X_2'
  | 'HTFT_2_1'
  | 'HTFT_2_X'
  | 'HTFT_2_2'
  | 'HTFT_11_O25'
  | 'HTFT_XX_U25'
  | 'HTFT_22_O25'
  | 'H_WBH'
  | 'A_WBH'
  | 'H_WEH'
  | 'A_WEH'
  | 'BOTH_H_GG'
  | 'H_SBH'
  | 'A_SBH'
  | 'BH_O15'
  | 'BH_U15'
  | 'CS_0_0'
  | 'CS_1_0'
  | 'CS_0_1'
  | 'CS_1_1'
  | 'CS_2_0'
  | 'CS_0_2'
  | 'CS_2_1'
  | 'CS_1_2'
  | 'CS_2_2'
  | 'CS_3_0'
  | 'CS_0_3'
  | 'CS_3_1'
  | 'CS_1_3'
  | 'CS_3_2'
  | 'CS_2_3'
  | 'CS_OTHER'
  | 'CRD_O25'
  | 'CRD_U25'
  | 'CRD_O35'
  | 'CRD_U35'
  | 'CRD_O45'
  | 'CRD_U45'
  | 'CRD_O55'
  | 'CRD_U55'
  | 'RED_YES'
  | 'RED_NO'
  | 'CRN_O75'
  | 'CRN_U75'
  | 'CRN_O85'
  | 'CRN_U85'
  | 'CRN_O95'
  | 'CRN_U95'
  | 'CRN_O105'
  | 'CRN_U105'
  | 'CRN_1'
  | 'CRN_X'
  | 'CRN_2';

export interface TelebirrSettings {
  depositPhone: string;
  withdrawalPhone?: string;
  accountName: string;
  minDeposit: number;
  minWithdraw: number;
  houseWinRate: number;
  updatedBy: string;
  updatedAt: Timestamp;
}

export interface GameBranding {
  logoDataUrl: string;
  updatedBy: string;
  updatedAt: Timestamp;
}

export interface GameConfig {
  minBet: number;
  maxBet: number;
  houseWinRate: number;
  singleDiceRangeOdds: number;
  singleDiceExactOdds: number;
  doubleDiceRangeOdds: number;
  doubleDiceLucky7Odds: number;
  coinOdds: number;
  luckyOdds: number;
  footballOddsScale: number;
  footballMaxOdds: number;
  updatedBy: string;
  updatedAt: Timestamp;
}

export interface UserWallet {
  uid: string;
  displayName: string;
  username?: string;
  primaryUid?: string;
  mustChangePassword?: boolean;
  passwordVersion?: number;
  passwordUpdatedAt?: Timestamp;
  balance: number;
  hasDeposited: boolean;
  totalDeposited: number;
  totalWithdrawn: number;
  lastActionType: 'init' | 'deposit' | 'bet' | 'withdraw' | 'refund' | 'bonus' | 'football_place' | 'football_settle';
  lastActionRef: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserPrivateInfo {
  uid: string;
  email: string;
  username?: string;
  telebirrPhone?: string;
  updatedAt: Timestamp;
}

export interface DepositRecord {
  id: string;
  uid: string;
  playerName: string;
  playerPhone: string;
  systemPhone: string;
  txId: string;
  amount: number;
  status: 'verified';
  verifiedMessage: string;
  createdAt: Timestamp;
}

export interface WithdrawalRecord {
  id: string;
  uid: string;
  playerName: string;
  playerPhone: string;
  sourceSystemPhone: string;
  amount: number;
  status: 'pending' | 'completed' | 'rejected';
  systemVerified: boolean;
  systemVerifiedText: string;
  adminPinConfirmed: boolean;
  processedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BetRecord {
  id: string;
  uid: string;
  ownerPhone?: string;
  gameType: 'dice_single' | 'dice_double' | 'dice_d100' | 'coin' | 'lucky' | 'football';
  gameName: string;
  betAmount: number;
  multiplier: number;
  choiceText: string;
  resultText: string;
  won: boolean;
  payout: number;
  createdAt: Timestamp;
}

export interface LedgerEntry {
  id: string;
  uid: string;
  playerName: string;
  playerPhone: string;
  type: 'income' | 'expense';
  category: 'deposit' | 'withdrawal';
  amount: number;
  referenceId: string;
  description: string;
  createdAt: Timestamp;
}

export interface DailyBonusRecord {
  id: string;
  uid: string;
  dayKey: string;
  amount: number;
  createdAt: Timestamp;
}

export interface RecentWinnerRecord {
  id: string;
  uid: string;
  playerMask: string;
  gameType: BetRecord['gameType'];
  gameName: string;
  multiplier: number;
  payout: number;
  createdAt: Timestamp;
}

export interface FootballTicketPick {
  matchId: string;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  market: FootballMarketKey;
  marketLabel?: string;
  odd: number;
  homeGoals: number;
  awayGoals: number;
  htHomeGoals?: number;
  htAwayGoals?: number;
  homeCards?: number;
  awayCards?: number;
  homeCorners?: number;
  awayCorners?: number;
  homeRedCards?: number;
  awayRedCards?: number;
  hit: boolean;
}

export interface FootballTicket {
  id: string;
  uid: string;
  ownerPhone?: string;
  betAmount: number;
  totalOdds: number;
  potentialPayout: number;
  picksCount: number;
  choiceText: string;
  picks: FootballTicketPick[];
  currentMinute: number;
  cashoutOffer: number;
  cashoutEligible: boolean;
  status: 'live' | 'cashed_out' | 'won' | 'lost';
  payout: number;
  resultText: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FootballPopularityRecord {
  matchId: string;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  leagueLabel: string;
  homeBets: number;
  drawBets: number;
  awayBets: number;
  totalBets: number;
  updatedAt: Timestamp;
}

export interface WeeklyLeaderboardEntry {
  id: string;
  uid: string;
  weekKey: string;
  playerMask: string;
  totalWinnings: number;
  winsCount: number;
  biggestWin: number;
  lastGameName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ReceivedSmsTransaction {
  transaction_id: string;
  amount: number;
  message: string;
  status: 'unused' | 'used';
  source?: string;
  created_at: Timestamp;
  used_by?: string;
  used_at?: Timestamp;
}

