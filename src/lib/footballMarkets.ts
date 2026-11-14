import { FootballMarketKey, FootballTicketPick } from '../types';

export type MarketCategoryId =
  | 'all'
  | 'main'
  | 'first_half'
  | 'goals'
  | 'cards_corners'
  | 'combo'
  | 'team_specials'
  | 'correct_score';

export interface MarketCategoryTab {
  id: MarketCategoryId;
  label: string;
}

export const MARKET_CATEGORIES: MarketCategoryTab[] = [
  { id: 'all', label: 'ሁሉም (All Markets)' },
  { id: 'main', label: 'ዋና (Main)' },
  { id: 'first_half', label: '1ኛ አጋማሽ (1st Half)' },
  { id: 'goals', label: 'ጎሎች (Goals)' },
  { id: 'cards_corners', label: 'ካርዶች እና ኮርነር' },
  { id: 'combo', label: 'ኮምቦ (Combo & HT/FT)' },
  { id: 'team_specials', label: 'የቡድን ልዩ (Specials)' },
  { id: 'correct_score', label: 'ትክክለኛ ውጤት (Score)' },
];

export interface MarketOptionDef {
  key: FootballMarketKey;
  label: string;
}

export interface MarketGroupDef {
  id: string;
  category: Exclude<MarketCategoryId, 'all'>;
  title: string;
  howToBet: string;
  cols: 2 | 3 | 4;
  options: MarketOptionDef[];
}

export function buildMarketGroups(
  homeName: string,
  awayName: string,
  homeCode: string,
  awayCode: string,
): MarketGroupDef[] {
  return [
    // ================= MAIN =================
    {
      id: '1x2',
      category: 'main',
      title: '1X2 (የሙሉ ጨዋታ ውጤት)',
      howToBet: `1 = ${homeName} ያሸንፋል · X = አቻ ይወጣሉ · 2 = ${awayName} ያሸንፋል (90' FT)`,
      cols: 3,
      options: [
        { key: '1', label: `1 (${homeCode})` },
        { key: 'X', label: 'X (አቻ)' },
        { key: '2', label: `2 (${awayCode})` },
      ],
    },
    {
      id: 'gg_ng',
      category: 'main',
      title: 'Both Teams To Score (GG / NG)',
      howToBet: 'Yes (GG) = ሁለቱም ቡድኖች ቢያንስ 1-1 ጎል ሲያገቡ · No (NG) = አንዱ ወይም ሁለቱም 0 ከሆኑ',
      cols: 2,
      options: [
        { key: 'GG', label: 'Yes (GG · ሁለቱም)' },
        { key: 'NG', label: 'No (NG · አይገባም)' },
      ],
    },
    {
      id: 'double_chance',
      category: 'main',
      title: 'Double Chance (ሁለት ዕድል)',
      howToBet: '1/X = ባለሜዳ ካሸነፈ ወይም አቻ · X/2 = አቻ ወይም እንግዳ · 1/2 = አንዱ ካሸነፈ',
      cols: 3,
      options: [
        { key: '1X', label: '1/X' },
        { key: 'X2', label: 'X/2' },
        { key: '12', label: '1/2' },
      ],
    },
    {
      id: 'dnb',
      category: 'main',
      title: 'Who Will Win? (If Draw, Money Back)',
      howToBet: 'የመረጥከው ቡድን ካሸነፈ ትበላለህ፤ ጨዋታው አቻ ካለቀ የቆረጥከው ብር ይመለስልሃል።',
      cols: 2,
      options: [
        { key: 'DNB_1', label: `1 (${homeCode} · DNB)` },
        { key: 'DNB_2', label: `2 (${awayCode} · DNB)` },
      ],
    },
    {
      id: 'handicap_1x2',
      category: 'main',
      title: 'Handicap (1X2)',
      howToBet: `${homeCode} (-1) = በ2+ ጎል ልዩነት ማሸነፍ · Draw (-1) = በትክክል በ1 ጎል ልዩነት ማሸነፍ`,
      cols: 3,
      options: [
        { key: 'HCP_H1', label: `${homeCode} (-1)` },
        { key: 'HCP_D1', label: 'አቻ (-1/+1)' },
        { key: 'HCP_A1', label: `${awayCode} (+1)` },
        { key: 'HCP_HP1', label: `${homeCode} (+1)` },
        { key: 'HCP_AP1', label: `${awayCode} (-1)` },
      ],
    },
    {
      id: 'winning_margin',
      category: 'main',
      title: 'Winning Margin (የድል ልዩነት)',
      howToBet: 'አሸናፊው ቡድን በስንት ጎል ልዩነት እንደሚያሸንፍ ወይም አቻ እንደሚወጡ ይገምቱ።',
      cols: 3,
      options: [
        { key: 'WM_H1', label: `${homeCode} በ1 ጎል` },
        { key: 'WM_H2P', label: `${homeCode} በ2+ ጎል` },
        { key: 'WM_D', label: 'አቻ (Draw)' },
        { key: 'WM_A1', label: `${awayCode} በ1 ጎል` },
        { key: 'WM_A2P', label: `${awayCode} በ2+ ጎል` },
      ],
    },

    // ================= GOALS =================
    {
      id: 'total_goals',
      category: 'goals',
      title: 'Total Goals (Over / Under · ኦቨር / አንደር)',
      howToBet: 'የሁለቱም ቡድኖች ድምር ጎል ከተጠቀሰው ቁጥር በላይ (Over) ወይም በታች (Under)',
      cols: 2,
      options: [
        { key: 'O05', label: 'Over 0.5' },
        { key: 'U05', label: 'Under 0.5' },
        { key: 'O15', label: 'Over 1.5' },
        { key: 'U15', label: 'Under 1.5' },
        { key: 'O25', label: 'Over 2.5' },
        { key: 'U25', label: 'Under 2.5' },
        { key: 'O35', label: 'Over 3.5' },
        { key: 'U35', label: 'Under 3.5' },
        { key: 'O45', label: 'Over 4.5' },
        { key: 'U45', label: 'Under 4.5' },
      ],
    },
    {
      id: 'multigoals',
      category: 'goals',
      title: 'Multigoals (የጎል ክልል)',
      howToBet: 'በጨዋታው የሚቆጠረው ጠቅላላ ጎል በተመረጠው ክልል ውስጥ ሲሆን ያሸንፋል (ለምሳሌ 1-3 = 1, 2 ወይም 3 ጎል)',
      cols: 4,
      options: [
        { key: 'MG_1_2', label: '1-2' },
        { key: 'MG_1_3', label: '1-3' },
        { key: 'MG_1_4', label: '1-4' },
        { key: 'MG_1_5', label: '1-5' },
        { key: 'MG_1_6', label: '1-6' },
        { key: 'MG_2_3', label: '2-3' },
        { key: 'MG_2_4', label: '2-4' },
        { key: 'MG_2_5', label: '2-5' },
        { key: 'MG_2_6', label: '2-6' },
        { key: 'MG_3_4', label: '3-4' },
        { key: 'MG_3_5', label: '3-5' },
        { key: 'MG_3_6', label: '3-6' },
        { key: 'MG_4_5', label: '4-5' },
        { key: 'MG_4_6', label: '4-6' },
        { key: 'MG_5_6', label: '5-6' },
        { key: 'MG_7P', label: '7+' },
        { key: 'MG_0', label: 'No Goal (0)' },
      ],
    },
    {
      id: 'home_total',
      category: 'goals',
      title: `${homeName} Total Goals`,
      howToBet: `${homeName} ብቻውን የሚያገባው የጎል ብዛት (Over / Under)`,
      cols: 2,
      options: [
        { key: 'HT_O05', label: 'Over 0.5' },
        { key: 'HT_U05', label: 'Under 0.5' },
        { key: 'HT_O15', label: 'Over 1.5' },
        { key: 'HT_U15', label: 'Under 1.5' },
        { key: 'HT_O25', label: 'Over 2.5' },
        { key: 'HT_U25', label: 'Under 2.5' },
      ],
    },
    {
      id: 'away_total',
      category: 'goals',
      title: `${awayName} Total Goals`,
      howToBet: `${awayName} ብቻውን የሚያገባው የጎል ብዛት (Over / Under)`,
      cols: 2,
      options: [
        { key: 'AT_O05', label: 'Over 0.5' },
        { key: 'AT_U05', label: 'Under 0.5' },
        { key: 'AT_O15', label: 'Over 1.5' },
        { key: 'AT_U15', label: 'Under 1.5' },
        { key: 'AT_O25', label: 'Over 2.5' },
        { key: 'AT_U25', label: 'Under 2.5' },
      ],
    },
    {
      id: 'home_multigoals',
      category: 'goals',
      title: `${homeName} Multigoals`,
      howToBet: `${homeName} የሚያስቆጥረው የጎል ክልል (1-2, 1-3, 2-3, 4+ ወይም No Goal)`,
      cols: 3,
      options: [
        { key: 'HMG_1_2', label: '1-2' },
        { key: 'HMG_1_3', label: '1-3' },
        { key: 'HMG_2_3', label: '2-3' },
        { key: 'HMG_4P', label: '4+' },
        { key: 'HMG_0', label: 'No Goal' },
      ],
    },
    {
      id: 'away_multigoals',
      category: 'goals',
      title: `${awayName} Multigoals`,
      howToBet: `${awayName} የሚያስቆጥረው የጎል ክልል (1-2, 1-3, 2-3, 4+ ወይም No Goal)`,
      cols: 3,
      options: [
        { key: 'AMG_1_2', label: '1-2' },
        { key: 'AMG_1_3', label: '1-3' },
        { key: 'AMG_2_3', label: '2-3' },
        { key: 'AMG_4P', label: '4+' },
        { key: 'AMG_0', label: 'No Goal' },
      ],
    },
    {
      id: 'exact_goals',
      category: 'goals',
      title: 'Exact Goals (ትክክለኛ የጎል ብዛት)',
      howToBet: 'በጨዋታው የሚቆጠረውን ትክክለኛ ድምር ጎል ብዛት ይምረጡ (0, 1, 2, 3, 4 ወይም 5+)።',
      cols: 3,
      options: [
        { key: 'EXG_0', label: '0 ጎል' },
        { key: 'EXG_1', label: '1 ጎል' },
        { key: 'EXG_2', label: '2 ጎል' },
        { key: 'EXG_3', label: '3 ጎል' },
        { key: 'EXG_4', label: '4 ጎል' },
        { key: 'EXG_5P', label: '5+ ጎል' },
      ],
    },
    {
      id: 'team_exact_goals',
      category: 'goals',
      title: `${homeCode} & ${awayCode} Exact Goals`,
      howToBet: 'የእያንዳንዱ ቡድን ትክክለኛ የጎል ብዛት በ90 ደቂቃ',
      cols: 4,
      options: [
        { key: 'HEX_0', label: `${homeCode} 0` },
        { key: 'HEX_1', label: `${homeCode} 1` },
        { key: 'HEX_2', label: `${homeCode} 2` },
        { key: 'HEX_3P', label: `${homeCode} 3+` },
        { key: 'AEX_0', label: `${awayCode} 0` },
        { key: 'AEX_1', label: `${awayCode} 1` },
        { key: 'AEX_2', label: `${awayCode} 2` },
        { key: 'AEX_3P', label: `${awayCode} 3+` },
      ],
    },

    // ================= FIRST HALF =================
    {
      id: 'fh_1x2',
      category: 'first_half',
      title: '1st Half - 1X2 (የ1ኛ አጋማሽ ውጤት)',
      howToBet: "እስከ 45' እረፍት ድረስ ብቻ ያለው ውጤት (1, X ወይም 2)",
      cols: 3,
      options: [
        { key: 'FH_1', label: `1 (${homeCode})` },
        { key: 'FH_X', label: 'X (አቻ)' },
        { key: 'FH_2', label: `2 (${awayCode})` },
      ],
    },
    {
      id: 'fh_dc',
      category: 'first_half',
      title: '1st Half - Double Chance',
      howToBet: 'የ1ኛ አጋማሽ ሁለት ዕድል (1/X, X/2, 1/2)',
      cols: 3,
      options: [
        { key: 'FH_1X', label: '1/X' },
        { key: 'FH_X2', label: 'X/2' },
        { key: 'FH_12', label: '1/2' },
      ],
    },
    {
      id: 'fh_total',
      category: 'first_half',
      title: '1st Half - Total Goals',
      howToBet: 'በመጀመሪያዎቹ 45 ደቂቃዎች የሚቆጠር ድምር ጎል Over / Under',
      cols: 2,
      options: [
        { key: 'FH_O05', label: 'Over 0.5' },
        { key: 'FH_U05', label: 'Under 0.5' },
        { key: 'FH_O15', label: 'Over 1.5' },
        { key: 'FH_U15', label: 'Under 1.5' },
        { key: 'FH_O25', label: 'Over 2.5' },
        { key: 'FH_U25', label: 'Under 2.5' },
      ],
    },
    {
      id: 'fh_gg',
      category: 'first_half',
      title: '1st Half - Both Teams To Score & Handicap',
      howToBet: 'በ1ኛ አጋማሽ ሁለቱም ቡድኖች ያገባሉ ወይም ሀንዲካፕ (-1)',
      cols: 2,
      options: [
        { key: 'FH_GG', label: '1st Half GG (Yes)' },
        { key: 'FH_NG', label: '1st Half NG (No)' },
        { key: 'FH_HCP_H1', label: `1H ${homeCode} (-1)` },
        { key: 'FH_HCP_A1', label: `1H ${awayCode} (+1)` },
      ],
    },
    {
      id: 'fh_team_totals_exact',
      category: 'first_half',
      title: '1st Half - Team Totals, Exact Goals & Multigoals',
      howToBet: 'በ1ኛ አጋማሽ የቡድን ጎል እና ትክክለኛ የጎል ብዛት',
      cols: 4,
      options: [
        { key: 'FH_HT_O05', label: `${homeCode} O 0.5` },
        { key: 'FH_HT_O15', label: `${homeCode} O 1.5` },
        { key: 'FH_AT_O05', label: `${awayCode} O 0.5` },
        { key: 'FH_AT_O15', label: `${awayCode} O 1.5` },
        { key: 'FH_EXG_0', label: '1H 0 ጎል' },
        { key: 'FH_EXG_1', label: '1H 1 ጎል' },
        { key: 'FH_EXG_2', label: '1H 2 ጎል' },
        { key: 'FH_EXG_3P', label: '1H 3+ ጎል' },
        { key: 'FH_MG_1_2', label: '1H 1-2' },
        { key: 'FH_MG_1_3', label: '1H 1-3' },
        { key: 'FH_MG_2_3', label: '1H 2-3' },
      ],
    },
    {
      id: 'fh_combos_cs',
      category: 'first_half',
      title: '1st Half - Combo & Correct Score',
      howToBet: 'የ1ኛ አጋማሽ ጥምር ምርጫዎች እና ትክክለኛ የእረፍት ውጤት (1st Half Correct Score)',
      cols: 4,
      options: [
        { key: 'FH_1_GG', label: '1H 1 & GG' },
        { key: 'FH_X_GG', label: '1H X & GG' },
        { key: 'FH_2_GG', label: '1H 2 & GG' },
        { key: 'FH_1_O15', label: '1H 1 & O1.5' },
        { key: 'FH_2_O15', label: '1H 2 & O1.5' },
        { key: 'FH_1X_GG', label: '1H 1X & GG' },
        { key: 'FH_X2_GG', label: '1H X2 & GG' },
        { key: 'FH_CS_0_0', label: '1H 0:0' },
        { key: 'FH_CS_1_0', label: '1H 1:0' },
        { key: 'FH_CS_0_1', label: '1H 0:1' },
        { key: 'FH_CS_1_1', label: '1H 1:1' },
        { key: 'FH_CS_2_0', label: '1H 2:0' },
        { key: 'FH_CS_0_2', label: '1H 0:2' },
        { key: 'FH_CS_2_1', label: '1H 2:1' },
        { key: 'FH_CS_1_2', label: '1H 1:2' },
      ],
    },

    // ================= CARDS AND CORNERS =================
    {
      id: 'total_cards',
      category: 'cards_corners',
      title: 'Total Cards (የቢጫ/ቀይ ካርድ ብዛት Over/Under)',
      howToBet: 'በዳኛው የሚሰጠው ጠቅላላ የካርድ ብዛት ከተጠቀሰው ቁጥር በላይ (Over) ወይም በታች (Under)',
      cols: 2,
      options: [
        { key: 'CRD_O25', label: 'Over 2.5 ካርድ' },
        { key: 'CRD_U25', label: 'Under 2.5 ካርድ' },
        { key: 'CRD_O35', label: 'Over 3.5 ካርድ' },
        { key: 'CRD_U35', label: 'Under 3.5 ካርድ' },
        { key: 'CRD_O45', label: 'Over 4.5 ካርድ' },
        { key: 'CRD_U45', label: 'Under 4.5 ካርድ' },
        { key: 'CRD_O55', label: 'Over 5.5 ካርድ' },
        { key: 'CRD_U55', label: 'Under 5.5 ካርድ' },
        { key: 'RED_YES', label: 'ቀይ ካርድ (Yes)' },
        { key: 'RED_NO', label: 'ቀይ ካርድ (No)' },
      ],
    },
    {
      id: 'total_corners',
      category: 'cards_corners',
      title: 'Corners (የማዕዘን ምት · Over/Under & 1X2)',
      howToBet: 'በጨዋታው የሚመታው የኮርነር ብዛት Over/Under ወይም ብዙ ኮርነር የሚያገኘው ቡድን',
      cols: 2,
      options: [
        { key: 'CRN_O75', label: 'Over 7.5 ኮርነር' },
        { key: 'CRN_U75', label: 'Under 7.5 ኮርነር' },
        { key: 'CRN_O85', label: 'Over 8.5 ኮርነር' },
        { key: 'CRN_U85', label: 'Under 8.5 ኮርነር' },
        { key: 'CRN_O95', label: 'Over 9.5 ኮርነር' },
        { key: 'CRN_U95', label: 'Under 9.5 ኮርነር' },
        { key: 'CRN_O105', label: 'Over 10.5 ኮርነር' },
        { key: 'CRN_U105', label: 'Under 10.5 ኮርነር' },
        { key: 'CRN_1', label: `${homeCode} Most Corners` },
        { key: 'CRN_X', label: 'Draw Corners (X)' },
        { key: 'CRN_2', label: `${awayCode} Most Corners` },
      ],
    },

    // ================= COMBO & HT/FT =================
    {
      id: 'combo_1x2_gg',
      category: 'combo',
      title: '1X2 & Both Teams To Score (ውጤት + GG/NG)',
      howToBet: 'ሁለቱም ሁኔታዎች በአንድ ጊዜ መሳካት አለባቸው (ለምሳሌ 1 & Yes = ባለሜዳ ያሸንፋል እና ሁለቱም ያገባሉ)',
      cols: 2,
      options: [
        { key: 'C_1_GG', label: `1 (${homeCode}) & GG` },
        { key: 'C_1_NG', label: `1 (${homeCode}) & NG` },
        { key: 'C_X_GG', label: 'X (አቻ) & GG' },
        { key: 'C_X_NG', label: 'X (አቻ) & NG' },
        { key: 'C_2_GG', label: `2 (${awayCode}) & GG` },
        { key: 'C_2_NG', label: `2 (${awayCode}) & NG` },
      ],
    },
    {
      id: 'combo_1x2_total',
      category: 'combo',
      title: '1X2 & Total 2.5 (ውጤት + Over/Under)',
      howToBet: 'አሸናፊውንና ከ2.5 ጎል በላይ/በታች መሆኑን በአንድ ላይ መገመት',
      cols: 2,
      options: [
        { key: 'C_1_O25', label: '1 & Over 2.5' },
        { key: 'C_1_U25', label: '1 & Under 2.5' },
        { key: 'C_X_O25', label: 'X & Over 2.5' },
        { key: 'C_X_U25', label: 'X & Under 2.5' },
        { key: 'C_2_O25', label: '2 & Over 2.5' },
        { key: 'C_2_U25', label: '2 & Under 2.5' },
      ],
    },
    {
      id: 'combo_total_gg_dc',
      category: 'combo',
      title: 'Total / Double Chance & GG/NG Combos',
      howToBet: 'Double Chance ወይም Over/Under 2.5 ከ GG/NG ጋር በአንድ ላይ',
      cols: 2,
      options: [
        { key: 'C_O25_GG', label: 'Over 2.5 & GG' },
        { key: 'C_O25_NG', label: 'Over 2.5 & NG' },
        { key: 'C_U25_GG', label: 'Under 2.5 & GG' },
        { key: 'C_U25_NG', label: 'Under 2.5 & NG' },
        { key: 'C_1X_GG', label: '1X & GG' },
        { key: 'C_1X_NG', label: '1X & NG' },
        { key: 'C_X2_GG', label: 'X2 & GG' },
        { key: 'C_X2_NG', label: 'X2 & NG' },
        { key: 'C_12_GG', label: '12 & GG' },
        { key: 'C_12_NG', label: '12 & NG' },
        { key: 'C_1X_O25', label: '1X & Over 2.5' },
        { key: 'C_1X_U25', label: '1X & Under 2.5' },
        { key: 'C_X2_O25', label: 'X2 & Over 2.5' },
        { key: 'C_X2_U25', label: 'X2 & Under 2.5' },
      ],
    },
    {
      id: 'ht_ft',
      category: 'combo',
      title: 'Halftime / Fulltime (HT/FT · እረፍት / መጨረሻ)',
      howToBet: 'የ1ኛ አጋማሽ መሪ እና የ90 ደቂቃ አሸናፊ (ለምሳሌ X/1 = እረፍት አቻ ሆነው መጨረሻ ባለሜዳ ያሸንፋል)',
      cols: 3,
      options: [
        { key: 'HTFT_1_1', label: '1/1' },
        { key: 'HTFT_1_X', label: '1/X' },
        { key: 'HTFT_1_2', label: '1/2' },
        { key: 'HTFT_X_1', label: 'X/1' },
        { key: 'HTFT_X_X', label: 'X/X' },
        { key: 'HTFT_X_2', label: 'X/2' },
        { key: 'HTFT_2_1', label: '2/1' },
        { key: 'HTFT_2_X', label: '2/X' },
        { key: 'HTFT_2_2', label: '2/2' },
        { key: 'HTFT_11_O25', label: '1/1 & O2.5' },
        { key: 'HTFT_XX_U25', label: 'X/X & U2.5' },
        { key: 'HTFT_22_O25', label: '2/2 & O2.5' },
      ],
    },

    // ================= TEAM SPECIALS =================
    {
      id: 'clean_sheet_win_nil',
      category: 'team_specials',
      title: 'Clean Sheet & Win To Nil (ጎል ሳይገባበት)',
      howToBet: 'Clean Sheet = ጎል አይቆጠርበትም · Win To Nil = ጎል ሳያስተናግድ ያሸንፋል',
      cols: 2,
      options: [
        { key: 'H_CS_YES', label: `${homeCode} Clean Sheet Yes` },
        { key: 'H_CS_NO', label: `${homeCode} Clean Sheet No` },
        { key: 'A_CS_YES', label: `${awayCode} Clean Sheet Yes` },
        { key: 'A_CS_NO', label: `${awayCode} Clean Sheet No` },
        { key: 'H_WTN_YES', label: `${homeCode} Win To Nil Yes` },
        { key: 'H_WTN_NO', label: `${homeCode} Win To Nil No` },
        { key: 'A_WTN_YES', label: `${awayCode} Win To Nil Yes` },
        { key: 'A_WTN_NO', label: `${awayCode} Win To Nil No` },
      ],
    },
    {
      id: 'halves_specials',
      category: 'team_specials',
      title: 'Halves Specials (በሁለቱም አጋማሾች)',
      howToBet: 'ሁለቱንም አጋማሽ ማሸነፍ፣ ቢያንስ አንዱን አጋማሽ ማሸነፍ፣ በሁለቱም አጋማሽ ማግባት እና ጎል ብዛት',
      cols: 2,
      options: [
        { key: 'H_WBH', label: `${homeCode} Win Both Halves` },
        { key: 'A_WBH', label: `${awayCode} Win Both Halves` },
        { key: 'H_WEH', label: `${homeCode} Win Either Half` },
        { key: 'A_WEH', label: `${awayCode} Win Either Half` },
        { key: 'H_SBH', label: `${homeCode} Score Both Halves` },
        { key: 'A_SBH', label: `${awayCode} Score Both Halves` },
        { key: 'BOTH_H_GG', label: '1st & 2nd Half GG' },
        { key: 'BH_O15', label: 'Both Halves Over 1.5' },
        { key: 'BH_U15', label: 'Both Halves Under 1.5' },
      ],
    },

    // ================= CORRECT SCORE =================
    {
      id: 'correct_score',
      category: 'correct_score',
      title: 'Correct Score (ትክክለኛ የሙሉ ጨዋታ ውጤት)',
      howToBet: 'ጨዋታው በ90 ደቂቃ የሚጠናቀቅበትን ትክክለኛ የጎል ውጤት (ለምሳሌ 2:1) ይገምቱ።',
      cols: 4,
      options: [
        { key: 'CS_0_0', label: '0 : 0' },
        { key: 'CS_1_0', label: '1 : 0' },
        { key: 'CS_0_1', label: '0 : 1' },
        { key: 'CS_1_1', label: '1 : 1' },
        { key: 'CS_2_0', label: '2 : 0' },
        { key: 'CS_0_2', label: '0 : 2' },
        { key: 'CS_2_1', label: '2 : 1' },
        { key: 'CS_1_2', label: '1 : 2' },
        { key: 'CS_2_2', label: '2 : 2' },
        { key: 'CS_3_0', label: '3 : 0' },
        { key: 'CS_0_3', label: '0 : 3' },
        { key: 'CS_3_1', label: '3 : 1' },
        { key: 'CS_1_3', label: '1 : 3' },
        { key: 'CS_3_2', label: '3 : 2' },
        { key: 'CS_2_3', label: '2 : 3' },
        { key: 'CS_OTHER', label: 'ሌላ ውጤት (4+)' },
      ],
    },
  ];
}

// Poisson helper to generate mathematically coherent sportsbook odds across all markets
function poissonPmf(lambda: number, k: number): number {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fact;
}

function probToOdd(prob: number, margin = 0.93, minOdd = 1.03, maxOdd = 45): number {
  const safeP = Math.min(0.96, Math.max(0.018, prob));
  return Number(Math.min(maxOdd, Math.max(minOdd, margin / safeP)).toFixed(2));
}

export function generateAllMatchOdds(
  home1: number,
  drawX: number,
  away2: number,
  o25: number,
  u25: number,
  gg: number,
  ng: number,
): Record<FootballMarketKey, number> {
  const p1Raw = 1 / home1;
  const pxRaw = 1 / drawX;
  const p2Raw = 1 / away2;
  const pSum = p1Raw + pxRaw + p2Raw;
  const p1 = p1Raw / pSum;
  const px = pxRaw / pSum;
  const p2 = p2Raw / pSum;

  const po25Raw = 1 / o25;
  const pu25Raw = 1 / u25;
  const po25 = po25Raw / (po25Raw + pu25Raw);

  // Estimate expected total goals & per-team lambdas
  const totalLambda = Math.min(3.6, Math.max(1.8, 1.55 + po25 * 1.95));
  const homeShare = Math.min(0.76, Math.max(0.24, 0.5 + (p1 - p2) * 0.42));
  const lamH = Number((totalLambda * homeShare).toFixed(3));
  const lamA = Number((totalLambda * (1 - homeShare)).toFixed(3));

  // Full-time Poisson matrix 0..7 goals each side
  const ftGrid: number[][] = [];
  for (let h = 0; h <= 7; h++) {
    ftGrid[h] = [];
    for (let a = 0; a <= 7; a++) {
      ftGrid[h][a] = poissonPmf(lamH, h) * poissonPmf(lamA, a);
    }
  }

  const sumGrid = (pred: (h: number, a: number) => boolean): number => {
    let s = 0;
    for (let h = 0; h <= 7; h++) {
      for (let a = 0; a <= 7; a++) {
        if (pred(h, a)) s += ftGrid[h][a];
      }
    }
    return s;
  };

  // First-half Poisson matrix (approx 43% of match goals occur in 1st Half)
  const lamH1 = lamH * 0.43;
  const lamA1 = lamA * 0.43;
  const fhGrid: number[][] = [];
  for (let h = 0; h <= 5; h++) {
    fhGrid[h] = [];
    for (let a = 0; a <= 5; a++) {
      fhGrid[h][a] = poissonPmf(lamH1, h) * poissonPmf(lamA1, a);
    }
  }

  const sumFh = (pred: (h: number, a: number) => boolean): number => {
    let s = 0;
    for (let h = 0; h <= 5; h++) {
      for (let a = 0; a <= 5; a++) {
        if (pred(h, a)) s += fhGrid[h][a];
      }
    }
    return s;
  };

  // Second-half Poisson matrix (~57% of match goals)
  const lamH2 = lamH * 0.57;
  const lamA2 = lamA * 0.57;
  const pH_score1 = 1 - Math.exp(-lamH1);
  const pH_score2 = 1 - Math.exp(-lamH2);
  const pA_score1 = 1 - Math.exp(-lamA1);
  const pA_score2 = 1 - Math.exp(-lamA2);

  const pFh1 = sumFh((h, a) => h > a);
  const pFhX = sumFh((h, a) => h === a);
  const pFh2 = sumFh((h, a) => a > h);

  // Second-half win probs
  const shGrid: number[][] = [];
  for (let h = 0; h <= 5; h++) {
    shGrid[h] = [];
    for (let a = 0; a <= 5; a++) {
      shGrid[h][a] = poissonPmf(lamH2, h) * poissonPmf(lamA2, a);
    }
  }
  const sumSh = (pred: (h: number, a: number) => boolean): number => {
    let s = 0;
    for (let h = 0; h <= 5; h++) {
      for (let a = 0; a <= 5; a++) {
        if (pred(h, a)) s += shGrid[h][a];
      }
    }
    return s;
  };
  const pSh1 = sumSh((h, a) => h > a);
  const pShX = sumSh((h, a) => h === a);
  const pSh2 = sumSh((h, a) => a > h);

  const pGG = sumGrid((h, a) => h >= 1 && a >= 1);
  const pH_0 = Math.exp(-lamH);
  const pA_0 = Math.exp(-lamA);

  return {
    '1': home1,
    X: drawX,
    '2': away2,
    '1X': Math.max(1.06, Number((0.94 / (p1 + px)).toFixed(2))),
    '12': Math.max(1.08, Number((0.94 / (p1 + p2)).toFixed(2))),
    X2: Math.max(1.06, Number((0.94 / (px + p2)).toFixed(2))),
    DNB_1: probToOdd(p1 / (p1 + p2), 0.94, 1.05, 18),
    DNB_2: probToOdd(p2 / (p1 + p2), 0.94, 1.05, 18),
    O05: probToOdd(sumGrid((h, a) => h + a >= 1), 0.96, 1.03, 5),
    U05: probToOdd(ftGrid[0][0], 0.92, 2.5, 22),
    O15: probToOdd(sumGrid((h, a) => h + a >= 2), 0.94, 1.08, 6),
    U15: probToOdd(sumGrid((h, a) => h + a <= 1), 0.93, 1.5, 10),
    O25: o25,
    U25: u25,
    O35: probToOdd(sumGrid((h, a) => h + a >= 4), 0.92, 1.4, 12),
    U35: probToOdd(sumGrid((h, a) => h + a <= 3), 0.94, 1.08, 4.5),
    O45: probToOdd(sumGrid((h, a) => h + a >= 5), 0.92, 2.1, 25),
    U45: probToOdd(sumGrid((h, a) => h + a <= 4), 0.95, 1.04, 2.8),
    GG: gg,
    NG: ng,

    // First Half
    FH_1: probToOdd(pFh1, 0.93, 1.25, 12),
    FH_X: probToOdd(pFhX, 0.93, 1.75, 4.5),
    FH_2: probToOdd(pFh2, 0.93, 1.35, 15),
    FH_1X: probToOdd(pFh1 + pFhX, 0.94, 1.06, 3.2),
    FH_12: probToOdd(pFh1 + pFh2, 0.94, 1.18, 3.5),
    FH_X2: probToOdd(pFhX + pFh2, 0.94, 1.08, 3.8),
    FH_O05: probToOdd(sumFh((h, a) => h + a >= 1), 0.94, 1.15, 2.8),
    FH_U05: probToOdd(fhGrid[0][0], 0.93, 1.85, 6),
    FH_O15: probToOdd(sumFh((h, a) => h + a >= 2), 0.92, 1.55, 6.5),
    FH_U15: probToOdd(sumFh((h, a) => h + a <= 1), 0.94, 1.12, 3.5),
    FH_O25: probToOdd(sumFh((h, a) => h + a >= 3), 0.91, 2.8, 16),
    FH_U25: probToOdd(sumFh((h, a) => h + a <= 2), 0.95, 1.05, 2.2),
    FH_GG: probToOdd(sumFh((h, a) => h >= 1 && a >= 1), 0.92, 2.3, 9),
    FH_NG: probToOdd(sumFh((h, a) => h === 0 || a === 0), 0.94, 1.08, 2.1),
    FH_HCP_H1: probToOdd(sumFh((h, a) => h - 1 > a), 0.91, 2.6, 22),
    FH_HCP_A1: probToOdd(sumFh((h, a) => a + 1 > h), 0.94, 1.08, 2.4),
    FH_HT_O05: probToOdd(pH_score1, 0.93, 1.35, 4.2),
    FH_HT_O15: probToOdd(sumFh((h) => h >= 2), 0.91, 2.6, 15),
    FH_AT_O05: probToOdd(pA_score1, 0.93, 1.45, 5.5),
    FH_AT_O15: probToOdd(sumFh((_h, a) => a >= 2), 0.91, 3.2, 20),
    FH_EXG_0: probToOdd(fhGrid[0][0], 0.93, 1.85, 6),
    FH_EXG_1: probToOdd(sumFh((h, a) => h + a === 1), 0.92, 2.1, 4),
    FH_EXG_2: probToOdd(sumFh((h, a) => h + a === 2), 0.92, 2.9, 6.5),
    FH_EXG_3P: probToOdd(sumFh((h, a) => h + a >= 3), 0.91, 2.8, 16),
    FH_MG_1_2: probToOdd(sumFh((h, a) => h + a >= 1 && h + a <= 2), 0.93, 1.4, 3),
    FH_MG_1_3: probToOdd(sumFh((h, a) => h + a >= 1 && h + a <= 3), 0.94, 1.22, 2.4),
    FH_MG_2_3: probToOdd(sumFh((h, a) => h + a >= 2 && h + a <= 3), 0.92, 2.1, 5.5),
    FH_1_GG: probToOdd(sumFh((h, a) => h > a && h >= 1 && a >= 1), 0.9, 4.5, 28),
    FH_X_GG: probToOdd(sumFh((h, a) => h === a && h >= 1), 0.9, 4.8, 18),
    FH_2_GG: probToOdd(sumFh((h, a) => a > h && h >= 1 && a >= 1), 0.9, 5.5, 32),
    FH_1_O15: probToOdd(sumFh((h, a) => h > a && h + a >= 2), 0.91, 2.8, 15),
    FH_2_O15: probToOdd(sumFh((h, a) => a > h && h + a >= 2), 0.91, 3.6, 22),
    FH_1X_GG: probToOdd(sumFh((h, a) => h >= a && h >= 1 && a >= 1), 0.91, 3.1, 14),
    FH_X2_GG: probToOdd(sumFh((h, a) => a >= h && h >= 1 && a >= 1), 0.91, 3.4, 16),
    FH_CS_0_0: probToOdd(fhGrid[0][0], 0.93, 1.85, 6),
    FH_CS_1_0: probToOdd(fhGrid[1][0], 0.92, 2.7, 8),
    FH_CS_0_1: probToOdd(fhGrid[0][1], 0.92, 3.1, 12),
    FH_CS_1_1: probToOdd(fhGrid[1][1], 0.91, 4.8, 16),
    FH_CS_2_0: probToOdd(fhGrid[2][0], 0.9, 5.5, 24),
    FH_CS_0_2: probToOdd(fhGrid[0][2], 0.9, 6.8, 32),
    FH_CS_2_1: probToOdd(fhGrid[2][1], 0.89, 9.0, 35),
    FH_CS_1_2: probToOdd(fhGrid[1][2], 0.89, 10.5, 40),

    // Multigoals
    MG_0: probToOdd(ftGrid[0][0], 0.92, 3.5, 24),
    MG_1_2: probToOdd(sumGrid((h, a) => h + a >= 1 && h + a <= 2), 0.93, 1.55, 3.8),
    MG_1_3: probToOdd(sumGrid((h, a) => h + a >= 1 && h + a <= 3), 0.94, 1.24, 2.2),
    MG_1_4: probToOdd(sumGrid((h, a) => h + a >= 1 && h + a <= 4), 0.95, 1.12, 1.75),
    MG_1_5: probToOdd(sumGrid((h, a) => h + a >= 1 && h + a <= 5), 0.96, 1.07, 1.45),
    MG_1_6: probToOdd(sumGrid((h, a) => h + a >= 1 && h + a <= 6), 0.96, 1.04, 1.3),
    MG_2_3: probToOdd(sumGrid((h, a) => h + a >= 2 && h + a <= 3), 0.93, 1.55, 2.8),
    MG_2_4: probToOdd(sumGrid((h, a) => h + a >= 2 && h + a <= 4), 0.94, 1.28, 2.1),
    MG_2_5: probToOdd(sumGrid((h, a) => h + a >= 2 && h + a <= 5), 0.95, 1.18, 1.85),
    MG_2_6: probToOdd(sumGrid((h, a) => h + a >= 2 && h + a <= 6), 0.95, 1.13, 1.7),
    MG_3_4: probToOdd(sumGrid((h, a) => h + a >= 3 && h + a <= 4), 0.92, 1.75, 3.5),
    MG_3_5: probToOdd(sumGrid((h, a) => h + a >= 3 && h + a <= 5), 0.93, 1.5, 2.8),
    MG_3_6: probToOdd(sumGrid((h, a) => h + a >= 3 && h + a <= 6), 0.93, 1.42, 2.6),
    MG_4_5: probToOdd(sumGrid((h, a) => h + a >= 4 && h + a <= 5), 0.91, 2.2, 6),
    MG_4_6: probToOdd(sumGrid((h, a) => h + a >= 4 && h + a <= 6), 0.91, 2.0, 5),
    MG_5_6: probToOdd(sumGrid((h, a) => h + a >= 5 && h + a <= 6), 0.9, 3.5, 14),
    MG_7P: probToOdd(sumGrid((h, a) => h + a >= 7), 0.88, 9.0, 42),

    // Team Totals
    HT_O05: probToOdd(1 - pH_0, 0.94, 1.07, 3.2),
    HT_U05: probToOdd(pH_0, 0.93, 2.1, 8.5),
    HT_O15: probToOdd(sumGrid((h) => h >= 2), 0.93, 1.3, 6.5),
    HT_U15: probToOdd(sumGrid((h) => h <= 1), 0.94, 1.15, 3.6),
    HT_O25: probToOdd(sumGrid((h) => h >= 3), 0.91, 2.1, 16),
    HT_U25: probToOdd(sumGrid((h) => h <= 2), 0.95, 1.04, 2.2),

    AT_O05: probToOdd(1 - pA_0, 0.94, 1.09, 3.8),
    AT_U05: probToOdd(pA_0, 0.93, 1.8, 7.5),
    AT_O15: probToOdd(sumGrid((_h, a) => a >= 2), 0.93, 1.45, 9),
    AT_U15: probToOdd(sumGrid((_h, a) => a <= 1), 0.94, 1.1, 3.1),
    AT_O25: probToOdd(sumGrid((_h, a) => a >= 3), 0.91, 2.5, 22),
    AT_U25: probToOdd(sumGrid((_h, a) => a <= 2), 0.95, 1.03, 1.9),

    // Team Multigoals
    HMG_0: probToOdd(pH_0, 0.93, 2.1, 8.5),
    HMG_1_2: probToOdd(sumGrid((h) => h >= 1 && h <= 2), 0.93, 1.42, 2.8),
    HMG_1_3: probToOdd(sumGrid((h) => h >= 1 && h <= 3), 0.94, 1.2, 2.4),
    HMG_2_3: probToOdd(sumGrid((h) => h >= 2 && h <= 3), 0.92, 1.65, 4.5),
    HMG_4P: probToOdd(sumGrid((h) => h >= 4), 0.89, 3.6, 25),

    AMG_0: probToOdd(pA_0, 0.93, 1.8, 7.5),
    AMG_1_2: probToOdd(sumGrid((_h, a) => a >= 1 && a <= 2), 0.93, 1.45, 3.2),
    AMG_1_3: probToOdd(sumGrid((_h, a) => a >= 1 && a <= 3), 0.94, 1.24, 2.8),
    AMG_2_3: probToOdd(sumGrid((_h, a) => a >= 2 && a <= 3), 0.92, 1.95, 6.5),
    AMG_4P: probToOdd(sumGrid((_h, a) => a >= 4), 0.89, 4.8, 34),

    // Handicap 1X2
    HCP_H1: probToOdd(sumGrid((h, a) => h - 1 > a), 0.92, 1.65, 16),
    HCP_D1: probToOdd(sumGrid((h, a) => h - 1 === a), 0.91, 2.8, 7.5),
    HCP_A1: probToOdd(sumGrid((h, a) => a + 1 > h), 0.94, 1.12, 4.5),
    HCP_HP1: probToOdd(sumGrid((h, a) => h + 1 > a), 0.94, 1.07, 3.4),
    HCP_AP1: probToOdd(sumGrid((h, a) => a - 1 > h), 0.92, 2.1, 22),

    // Winning Margin
    WM_H1: probToOdd(sumGrid((h, a) => h - a === 1), 0.92, 2.8, 6.5),
    WM_H2P: probToOdd(sumGrid((h, a) => h - a >= 2), 0.92, 1.65, 16),
    WM_D: drawX,
    WM_A1: probToOdd(sumGrid((h, a) => a - h === 1), 0.92, 3.1, 8.5),
    WM_A2P: probToOdd(sumGrid((h, a) => a - h >= 2), 0.92, 2.1, 22),

    // Exact Goals
    EXG_0: probToOdd(ftGrid[0][0], 0.92, 3.5, 24),
    EXG_1: probToOdd(sumGrid((h, a) => h + a === 1), 0.92, 3.1, 7.5),
    EXG_2: probToOdd(sumGrid((h, a) => h + a === 2), 0.92, 2.8, 5.2),
    EXG_3: probToOdd(sumGrid((h, a) => h + a === 3), 0.92, 3.2, 6.2),
    EXG_4: probToOdd(sumGrid((h, a) => h + a === 4), 0.91, 4.2, 10.5),
    EXG_5P: probToOdd(sumGrid((h, a) => h + a >= 5), 0.91, 2.1, 25),

    HEX_0: probToOdd(pH_0, 0.93, 2.1, 8.5),
    HEX_1: probToOdd(sumGrid((h) => h === 1), 0.92, 2.25, 4.2),
    HEX_2: probToOdd(sumGrid((h) => h === 2), 0.92, 2.8, 6.5),
    HEX_3P: probToOdd(sumGrid((h) => h >= 3), 0.91, 2.1, 16),

    AEX_0: probToOdd(pA_0, 0.93, 1.8, 7.5),
    AEX_1: probToOdd(sumGrid((_h, a) => a === 1), 0.92, 2.25, 4.5),
    AEX_2: probToOdd(sumGrid((_h, a) => a === 2), 0.92, 3.1, 8.5),
    AEX_3P: probToOdd(sumGrid((_h, a) => a >= 3), 0.91, 2.5, 22),

    // Clean Sheet & Win To Nil
    H_CS_YES: probToOdd(pA_0, 0.93, 1.65, 6.5),
    H_CS_NO: probToOdd(1 - pA_0, 0.94, 1.09, 3.8),
    A_CS_YES: probToOdd(pH_0, 0.93, 2.0, 8.5),
    A_CS_NO: probToOdd(1 - pH_0, 0.94, 1.07, 3.2),
    H_WTN_YES: probToOdd(sumGrid((h, a) => h >= 1 && a === 0), 0.92, 1.9, 10),
    H_WTN_NO: probToOdd(1 - sumGrid((h, a) => h >= 1 && a === 0), 0.94, 1.06, 2.5),
    A_WTN_YES: probToOdd(sumGrid((h, a) => a >= 1 && h === 0), 0.92, 2.4, 16),
    A_WTN_NO: probToOdd(1 - sumGrid((h, a) => a >= 1 && h === 0), 0.94, 1.04, 2.1),

    // Combos
    C_1_GG: probToOdd(p1 * pGG * 0.98, 0.91, 2.2, 12),
    C_1_NG: probToOdd(p1 * (1 - pGG) * 1.04, 0.91, 1.9, 10),
    C_X_GG: probToOdd(px * pGG * 1.12, 0.91, 3.2, 9),
    C_X_NG: probToOdd(ftGrid[0][0], 0.92, 4.5, 22),
    C_2_GG: probToOdd(p2 * pGG * 0.98, 0.91, 2.6, 16),
    C_2_NG: probToOdd(p2 * (1 - pGG) * 1.04, 0.91, 2.4, 16),

    C_O25_GG: probToOdd(sumGrid((h, a) => h + a >= 3 && h >= 1 && a >= 1), 0.92, 1.65, 4.5),
    C_O25_NG: probToOdd(sumGrid((h, a) => h + a >= 3 && (h === 0 || a === 0)), 0.91, 3.2, 14),
    C_U25_GG: probToOdd(ftGrid[1][1], 0.91, 4.2, 12),
    C_U25_NG: probToOdd(sumGrid((h, a) => h + a <= 2 && (h === 0 || a === 0)), 0.93, 1.5, 5.2),

    C_1_O25: probToOdd(p1 * po25 * 1.02, 0.91, 1.9, 12),
    C_1_U25: probToOdd(p1 * (1 - po25) * 0.98, 0.91, 2.3, 10),
    C_X_O25: probToOdd(sumGrid((h, a) => h === a && h >= 2), 0.9, 5.5, 24),
    C_X_U25: probToOdd(ftGrid[0][0] + ftGrid[1][1], 0.92, 2.8, 7.5),
    C_2_O25: probToOdd(p2 * po25 * 1.02, 0.91, 2.2, 16),
    C_2_U25: probToOdd(p2 * (1 - po25) * 0.98, 0.91, 2.6, 14),

    C_1X_GG: probToOdd((p1 + px) * pGG * 0.96, 0.92, 1.65, 4.8),
    C_1X_NG: probToOdd((p1 + px) * (1 - pGG) * 1.04, 0.92, 1.65, 5.5),
    C_X2_GG: probToOdd((px + p2) * pGG * 0.96, 0.92, 1.85, 6.2),
    C_X2_NG: probToOdd((px + p2) * (1 - pGG) * 1.04, 0.92, 1.85, 7.5),
    C_12_GG: probToOdd((p1 + p2) * pGG * 0.95, 0.92, 1.85, 5.2),
    C_12_NG: probToOdd((p1 + p2) * (1 - pGG) * 1.02, 0.92, 1.75, 5.8),

    C_1X_O25: probToOdd((p1 + px) * po25, 0.92, 1.6, 5.5),
    C_1X_U25: probToOdd((p1 + px) * (1 - po25), 0.92, 1.55, 5.2),
    C_X2_O25: probToOdd((px + p2) * po25, 0.92, 1.8, 6.8),
    C_X2_U25: probToOdd((px + p2) * (1 - po25), 0.92, 1.65, 6.2),

    // HT / FT
    HTFT_1_1: probToOdd(pFh1 * p1 * 1.45, 0.91, 1.8, 12),
    HTFT_1_X: probToOdd(pFh1 * px * 0.9, 0.89, 8.5, 28),
    HTFT_1_2: probToOdd(pFh1 * p2 * 0.45, 0.88, 14, 42),
    HTFT_X_1: probToOdd(pFhX * p1 * 1.1, 0.91, 3.2, 14),
    HTFT_X_X: probToOdd(pFhX * px * 1.4, 0.91, 3.6, 12),
    HTFT_X_2: probToOdd(pFhX * p2 * 1.1, 0.91, 3.8, 18),
    HTFT_2_1: probToOdd(pFh2 * p1 * 0.45, 0.88, 12, 38),
    HTFT_2_X: probToOdd(pFh2 * px * 0.9, 0.89, 8.5, 28),
    HTFT_2_2: probToOdd(pFh2 * p2 * 1.45, 0.91, 2.2, 18),
    HTFT_11_O25: probToOdd(pFh1 * p1 * po25 * 1.4, 0.9, 2.4, 18),
    HTFT_XX_U25: probToOdd(ftGrid[0][0] + fhGrid[0][0] * ftGrid[1][1] * 0.9, 0.9, 4.0, 14),
    HTFT_22_O25: probToOdd(pFh2 * p2 * po25 * 1.4, 0.9, 3.1, 26),

    // Halves Specials
    H_WBH: probToOdd(pFh1 * pSh1, 0.9, 2.5, 18),
    A_WBH: probToOdd(pFh2 * pSh2, 0.9, 3.2, 28),
    H_WEH: probToOdd(1 - (1 - pFh1) * (1 - pSh1), 0.93, 1.22, 3.8),
    A_WEH: probToOdd(1 - (1 - pFh2) * (1 - pSh2), 0.93, 1.35, 5.2),
    BOTH_H_GG: probToOdd(pH_score1 * pA_score1 * pH_score2 * pA_score2, 0.88, 5.5, 32),
    H_SBH: probToOdd(pH_score1 * pH_score2, 0.91, 1.9, 9.5),
    A_SBH: probToOdd(pA_score1 * pA_score2, 0.91, 2.4, 14),
    BH_O15: probToOdd(
      sumFh((h, a) => h + a >= 2) * sumSh((h, a) => h + a >= 2),
      0.9,
      3.1,
      16,
    ),
    BH_U15: probToOdd(
      sumFh((h, a) => h + a <= 1) * sumSh((h, a) => h + a <= 1),
      0.92,
      1.55,
      4.5,
    ),

    // Correct Score (FT)
    CS_0_0: probToOdd(ftGrid[0][0], 0.91, 4.5, 24),
    CS_1_0: probToOdd(ftGrid[1][0], 0.91, 4.2, 16),
    CS_0_1: probToOdd(ftGrid[0][1], 0.91, 4.8, 20),
    CS_1_1: probToOdd(ftGrid[1][1], 0.91, 4.6, 12),
    CS_2_0: probToOdd(ftGrid[2][0], 0.9, 5.2, 22),
    CS_0_2: probToOdd(ftGrid[0][2], 0.9, 6.5, 32),
    CS_2_1: probToOdd(ftGrid[2][1], 0.9, 6.0, 18),
    CS_1_2: probToOdd(ftGrid[1][2], 0.9, 6.8, 26),
    CS_2_2: probToOdd(ftGrid[2][2], 0.89, 8.5, 28),
    CS_3_0: probToOdd(ftGrid[3][0], 0.89, 8.0, 34),
    CS_0_3: probToOdd(ftGrid[0][3], 0.89, 10.5, 42),
    CS_3_1: probToOdd(ftGrid[3][1], 0.89, 8.5, 32),
    CS_1_3: probToOdd(ftGrid[1][3], 0.89, 11.0, 42),
    CS_3_2: probToOdd(ftGrid[3][2], 0.88, 13.0, 42),
    CS_2_3: probToOdd(ftGrid[2][3], 0.88, 15.0, 44),
    CS_OTHER: probToOdd(sumGrid((h, a) => h >= 4 || a >= 4), 0.9, 4.5, 24),

    // Cards & Corners
    CRD_O25: 1.32,
    CRD_U25: 3.05,
    CRD_O35: 1.72,
    CRD_U35: 2.02,
    CRD_O45: 2.38,
    CRD_U45: 1.52,
    CRD_O55: 3.45,
    CRD_U55: 1.26,
    RED_YES: 4.15,
    RED_NO: 1.19,
    CRN_O75: 1.34,
    CRN_U75: 2.95,
    CRN_O85: 1.62,
    CRN_U85: 2.15,
    CRN_O95: 2.04,
    CRN_U95: 1.7,
    CRN_O105: 2.65,
    CRN_U105: 1.42,
    CRN_1: probToOdd(Math.min(0.75, Math.max(0.25, homeShare + 0.04)), 0.92, 1.28, 4.8),
    CRN_X: 6.2,
    CRN_2: probToOdd(Math.min(0.75, Math.max(0.25, 1 - homeShare + 0.04)), 0.92, 1.35, 5.4),
  };
}

const STATIC_LABELS: Partial<Record<FootballMarketKey, string>> = {
  '1': '1 (ባለሜዳ ያሸንፋል)',
  X: 'X (አቻ)',
  '2': '2 (እንግዳ ያሸንፋል)',
  '1X': '1/X (ባለሜዳ ወይም አቻ)',
  '12': '1/2 (አንዱ ያሸንፋል)',
  X2: 'X/2 (አቻ ወይም እንግዳ)',
  DNB_1: '1 (Draw No Bet)',
  DNB_2: '2 (Draw No Bet)',
  O05: 'Over 0.5',
  U05: 'Under 0.5',
  O15: 'Over 1.5',
  U15: 'Under 1.5',
  O25: 'Over 2.5',
  U25: 'Under 2.5',
  O35: 'Over 3.5',
  U35: 'Under 3.5',
  O45: 'Over 4.5',
  U45: 'Under 4.5',
  GG: 'GG (ሁለቱም ያገባሉ)',
  NG: 'NG (አይገባም)',
  FH_1: '1st Half 1',
  FH_X: '1st Half X',
  FH_2: '1st Half 2',
  FH_1X: '1st Half 1/X',
  FH_12: '1st Half 1/2',
  FH_X2: '1st Half X/2',
  FH_O05: '1st Half Over 0.5',
  FH_U05: '1st Half Under 0.5',
  FH_O15: '1st Half Over 1.5',
  FH_U15: '1st Half Under 1.5',
  FH_O25: '1st Half Over 2.5',
  FH_U25: '1st Half Under 2.5',
  FH_GG: '1st Half GG',
  FH_NG: '1st Half NG',
  FH_HCP_H1: '1st Half Home (-1)',
  FH_HCP_A1: '1st Half Away (+1)',
  FH_HT_O05: '1H Home Over 0.5',
  FH_HT_O15: '1H Home Over 1.5',
  FH_AT_O05: '1H Away Over 0.5',
  FH_AT_O15: '1H Away Over 1.5',
  FH_EXG_0: '1H Exact 0 Goals',
  FH_EXG_1: '1H Exact 1 Goal',
  FH_EXG_2: '1H Exact 2 Goals',
  FH_EXG_3P: '1H 3+ Goals',
  FH_MG_1_2: '1H Multigoals 1-2',
  FH_MG_1_3: '1H Multigoals 1-3',
  FH_MG_2_3: '1H Multigoals 2-3',
  FH_1_GG: '1H 1 & GG',
  FH_X_GG: '1H X & GG',
  FH_2_GG: '1H 2 & GG',
  FH_1_O15: '1H 1 & Over 1.5',
  FH_2_O15: '1H 2 & Over 1.5',
  FH_1X_GG: '1H 1X & GG',
  FH_X2_GG: '1H X2 & GG',
  FH_CS_0_0: '1H Score 0:0',
  FH_CS_1_0: '1H Score 1:0',
  FH_CS_0_1: '1H Score 0:1',
  FH_CS_1_1: '1H Score 1:1',
  FH_CS_2_0: '1H Score 2:0',
  FH_CS_0_2: '1H Score 0:2',
  FH_CS_2_1: '1H Score 2:1',
  FH_CS_1_2: '1H Score 1:2',
  MG_0: 'Multigoals No Goal (0)',
  MG_1_2: 'Multigoals 1-2',
  MG_1_3: 'Multigoals 1-3',
  MG_1_4: 'Multigoals 1-4',
  MG_1_5: 'Multigoals 1-5',
  MG_1_6: 'Multigoals 1-6',
  MG_2_3: 'Multigoals 2-3',
  MG_2_4: 'Multigoals 2-4',
  MG_2_5: 'Multigoals 2-5',
  MG_2_6: 'Multigoals 2-6',
  MG_3_4: 'Multigoals 3-4',
  MG_3_5: 'Multigoals 3-5',
  MG_3_6: 'Multigoals 3-6',
  MG_4_5: 'Multigoals 4-5',
  MG_4_6: 'Multigoals 4-6',
  MG_5_6: 'Multigoals 5-6',
  MG_7P: 'Multigoals 7+',
  HT_O05: 'Home Over 0.5',
  HT_U05: 'Home Under 0.5',
  HT_O15: 'Home Over 1.5',
  HT_U15: 'Home Under 1.5',
  HT_O25: 'Home Over 2.5',
  HT_U25: 'Home Under 2.5',
  AT_O05: 'Away Over 0.5',
  AT_U05: 'Away Under 0.5',
  AT_O15: 'Away Over 1.5',
  AT_U15: 'Away Under 1.5',
  AT_O25: 'Away Over 2.5',
  AT_U25: 'Away Under 2.5',
  HMG_0: 'Home Multigoals 0',
  HMG_1_2: 'Home Multigoals 1-2',
  HMG_1_3: 'Home Multigoals 1-3',
  HMG_2_3: 'Home Multigoals 2-3',
  HMG_4P: 'Home Multigoals 4+',
  AMG_0: 'Away Multigoals 0',
  AMG_1_2: 'Away Multigoals 1-2',
  AMG_1_3: 'Away Multigoals 1-3',
  AMG_2_3: 'Away Multigoals 2-3',
  AMG_4P: 'Away Multigoals 4+',
  HCP_H1: 'Handicap Home (-1)',
  HCP_D1: 'Handicap Draw (-1/+1)',
  HCP_A1: 'Handicap Away (+1)',
  HCP_HP1: 'Handicap Home (+1)',
  HCP_AP1: 'Handicap Away (-1)',
  WM_H1: 'Win Margin Home by 1',
  WM_H2P: 'Win Margin Home by 2+',
  WM_D: 'Win Margin Draw',
  WM_A1: 'Win Margin Away by 1',
  WM_A2P: 'Win Margin Away by 2+',
  EXG_0: 'Exact 0 Goals',
  EXG_1: 'Exact 1 Goal',
  EXG_2: 'Exact 2 Goals',
  EXG_3: 'Exact 3 Goals',
  EXG_4: 'Exact 4 Goals',
  EXG_5P: '5+ Goals',
  HEX_0: 'Home Exact 0 Goals',
  HEX_1: 'Home Exact 1 Goal',
  HEX_2: 'Home Exact 2 Goals',
  HEX_3P: 'Home 3+ Goals',
  AEX_0: 'Away Exact 0 Goals',
  AEX_1: 'Away Exact 1 Goal',
  AEX_2: 'Away Exact 2 Goals',
  AEX_3P: 'Away 3+ Goals',
  H_CS_YES: 'Home Clean Sheet Yes',
  H_CS_NO: 'Home Clean Sheet No',
  A_CS_YES: 'Away Clean Sheet Yes',
  A_CS_NO: 'Away Clean Sheet No',
  H_WTN_YES: 'Home Win To Nil Yes',
  H_WTN_NO: 'Home Win To Nil No',
  A_WTN_YES: 'Away Win To Nil Yes',
  A_WTN_NO: 'Away Win To Nil No',
  C_1_GG: '1 & GG',
  C_1_NG: '1 & NG',
  C_X_GG: 'X & GG',
  C_X_NG: 'X & NG',
  C_2_GG: '2 & GG',
  C_2_NG: '2 & NG',
  C_O25_GG: 'Over 2.5 & GG',
  C_O25_NG: 'Over 2.5 & NG',
  C_U25_GG: 'Under 2.5 & GG',
  C_U25_NG: 'Under 2.5 & NG',
  C_1_O25: '1 & Over 2.5',
  C_1_U25: '1 & Under 2.5',
  C_X_O25: 'X & Over 2.5',
  C_X_U25: 'X & Under 2.5',
  C_2_O25: '2 & Over 2.5',
  C_2_U25: '2 & Under 2.5',
  C_1X_GG: '1X & GG',
  C_1X_NG: '1X & NG',
  C_X2_GG: 'X2 & GG',
  C_X2_NG: 'X2 & NG',
  C_12_GG: '12 & GG',
  C_12_NG: '12 & NG',
  C_1X_O25: '1X & Over 2.5',
  C_1X_U25: '1X & Under 2.5',
  C_X2_O25: 'X2 & Over 2.5',
  C_X2_U25: 'X2 & Under 2.5',
  HTFT_1_1: 'HT/FT 1/1',
  HTFT_1_X: 'HT/FT 1/X',
  HTFT_1_2: 'HT/FT 1/2',
  HTFT_X_1: 'HT/FT X/1',
  HTFT_X_X: 'HT/FT X/X',
  HTFT_X_2: 'HT/FT X/2',
  HTFT_2_1: 'HT/FT 2/1',
  HTFT_2_X: 'HT/FT 2/X',
  HTFT_2_2: 'HT/FT 2/2',
  HTFT_11_O25: 'HT/FT 1/1 & O2.5',
  HTFT_XX_U25: 'HT/FT X/X & U2.5',
  HTFT_22_O25: 'HT/FT 2/2 & O2.5',
  H_WBH: 'Home Win Both Halves',
  A_WBH: 'Away Win Both Halves',
  H_WEH: 'Home Win Either Half',
  A_WEH: 'Away Win Either Half',
  BOTH_H_GG: '1st & 2nd Half GG',
  H_SBH: 'Home Score Both Halves',
  A_SBH: 'Away Score Both Halves',
  BH_O15: 'Both Halves Over 1.5',
  BH_U15: 'Both Halves Under 1.5',
  CS_0_0: 'Correct Score 0:0',
  CS_1_0: 'Correct Score 1:0',
  CS_0_1: 'Correct Score 0:1',
  CS_1_1: 'Correct Score 1:1',
  CS_2_0: 'Correct Score 2:0',
  CS_0_2: 'Correct Score 0:2',
  CS_2_1: 'Correct Score 2:1',
  CS_1_2: 'Correct Score 1:2',
  CS_2_2: 'Correct Score 2:2',
  CS_3_0: 'Correct Score 3:0',
  CS_0_3: 'Correct Score 0:3',
  CS_3_1: 'Correct Score 3:1',
  CS_1_3: 'Correct Score 1:3',
  CS_3_2: 'Correct Score 3:2',
  CS_2_3: 'Correct Score 2:3',
  CS_OTHER: 'Correct Score Other (4+)',
  CRD_O25: 'Cards Over 2.5',
  CRD_U25: 'Cards Under 2.5',
  CRD_O35: 'Cards Over 3.5',
  CRD_U35: 'Cards Under 3.5',
  CRD_O45: 'Cards Over 4.5',
  CRD_U45: 'Cards Under 4.5',
  CRD_O55: 'Cards Over 5.5',
  CRD_U55: 'Cards Under 5.5',
  RED_YES: 'Red Card Yes',
  RED_NO: 'Red Card No',
  CRN_O75: 'Corners Over 7.5',
  CRN_U75: 'Corners Under 7.5',
  CRN_O85: 'Corners Over 8.5',
  CRN_U85: 'Corners Under 8.5',
  CRN_O95: 'Corners Over 9.5',
  CRN_U95: 'Corners Under 9.5',
  CRN_O105: 'Corners Over 10.5',
  CRN_U105: 'Corners Under 10.5',
  CRN_1: 'Most Corners 1',
  CRN_X: 'Most Corners Draw',
  CRN_2: 'Most Corners 2',
};

export function getMarketLabel(market: FootballMarketKey): string {
  return STATIC_LABELS[market] || market;
}

export function evaluateFootballPickOutcome(
  pick: FootballTicketPick,
  isFinal = false,
): 'win' | 'loss' | 'void' {
  const hg = pick.homeGoals;
  const ag = pick.awayGoals;
  const tot = hg + ag;
  const hth = pick.htHomeGoals ?? Math.min(hg, Math.floor(hg * 0.5));
  const hta = pick.htAwayGoals ?? Math.min(ag, Math.floor(ag * 0.5));
  const htTot = hth + hta;
  const shh = Math.max(0, hg - hth);
  const sha = Math.max(0, ag - hta);
  const shTot = shh + sha;
  const cards = (pick.homeCards ?? 0) + (pick.awayCards ?? 0);
  const redCards = (pick.homeRedCards ?? 0) + (pick.awayRedCards ?? 0);
  const hCrn = pick.homeCorners ?? 0;
  const aCrn = pick.awayCorners ?? 0;
  const corners = hCrn + aCrn;

  switch (pick.market) {
    case '1':
      return hg > ag ? 'win' : 'loss';
    case 'X':
      return hg === ag ? 'win' : 'loss';
    case '2':
      return ag > hg ? 'win' : 'loss';
    case '1X':
      return hg >= ag ? 'win' : 'loss';
    case '12':
      return hg !== ag ? 'win' : 'loss';
    case 'X2':
      return ag >= hg ? 'win' : 'loss';
    case 'DNB_1':
      if (isFinal && hg === ag) return 'void';
      return hg > ag ? 'win' : 'loss';
    case 'DNB_2':
      if (isFinal && hg === ag) return 'void';
      return ag > hg ? 'win' : 'loss';

    case 'O05':
      return tot >= 1 ? 'win' : 'loss';
    case 'U05':
      return tot === 0 ? 'win' : 'loss';
    case 'O15':
      return tot >= 2 ? 'win' : 'loss';
    case 'U15':
      return tot <= 1 ? 'win' : 'loss';
    case 'O25':
      return tot >= 3 ? 'win' : 'loss';
    case 'U25':
      return tot <= 2 ? 'win' : 'loss';
    case 'O35':
      return tot >= 4 ? 'win' : 'loss';
    case 'U35':
      return tot <= 3 ? 'win' : 'loss';
    case 'O45':
      return tot >= 5 ? 'win' : 'loss';
    case 'U45':
      return tot <= 4 ? 'win' : 'loss';
    case 'GG':
      return hg >= 1 && ag >= 1 ? 'win' : 'loss';
    case 'NG':
      return hg === 0 || ag === 0 ? 'win' : 'loss';

    // First Half
    case 'FH_1':
      return hth > hta ? 'win' : 'loss';
    case 'FH_X':
      return hth === hta ? 'win' : 'loss';
    case 'FH_2':
      return hta > hth ? 'win' : 'loss';
    case 'FH_1X':
      return hth >= hta ? 'win' : 'loss';
    case 'FH_12':
      return hth !== hta ? 'win' : 'loss';
    case 'FH_X2':
      return hta >= hth ? 'win' : 'loss';
    case 'FH_O05':
      return htTot >= 1 ? 'win' : 'loss';
    case 'FH_U05':
      return htTot === 0 ? 'win' : 'loss';
    case 'FH_O15':
      return htTot >= 2 ? 'win' : 'loss';
    case 'FH_U15':
      return htTot <= 1 ? 'win' : 'loss';
    case 'FH_O25':
      return htTot >= 3 ? 'win' : 'loss';
    case 'FH_U25':
      return htTot <= 2 ? 'win' : 'loss';
    case 'FH_GG':
      return hth >= 1 && hta >= 1 ? 'win' : 'loss';
    case 'FH_NG':
      return hth === 0 || hta === 0 ? 'win' : 'loss';
    case 'FH_HCP_H1':
      return hth - 1 > hta ? 'win' : 'loss';
    case 'FH_HCP_A1':
      return hta + 1 > hth ? 'win' : 'loss';
    case 'FH_HT_O05':
      return hth >= 1 ? 'win' : 'loss';
    case 'FH_HT_O15':
      return hth >= 2 ? 'win' : 'loss';
    case 'FH_AT_O05':
      return hta >= 1 ? 'win' : 'loss';
    case 'FH_AT_O15':
      return hta >= 2 ? 'win' : 'loss';
    case 'FH_EXG_0':
      return htTot === 0 ? 'win' : 'loss';
    case 'FH_EXG_1':
      return htTot === 1 ? 'win' : 'loss';
    case 'FH_EXG_2':
      return htTot === 2 ? 'win' : 'loss';
    case 'FH_EXG_3P':
      return htTot >= 3 ? 'win' : 'loss';
    case 'FH_MG_1_2':
      return htTot >= 1 && htTot <= 2 ? 'win' : 'loss';
    case 'FH_MG_1_3':
      return htTot >= 1 && htTot <= 3 ? 'win' : 'loss';
    case 'FH_MG_2_3':
      return htTot >= 2 && htTot <= 3 ? 'win' : 'loss';
    case 'FH_1_GG':
      return hth > hta && hth >= 1 && hta >= 1 ? 'win' : 'loss';
    case 'FH_X_GG':
      return hth === hta && hth >= 1 ? 'win' : 'loss';
    case 'FH_2_GG':
      return hta > hth && hth >= 1 && hta >= 1 ? 'win' : 'loss';
    case 'FH_1_O15':
      return hth > hta && htTot >= 2 ? 'win' : 'loss';
    case 'FH_2_O15':
      return hta > hth && htTot >= 2 ? 'win' : 'loss';
    case 'FH_1X_GG':
      return hth >= hta && hth >= 1 && hta >= 1 ? 'win' : 'loss';
    case 'FH_X2_GG':
      return hta >= hth && hth >= 1 && hta >= 1 ? 'win' : 'loss';
    case 'FH_CS_0_0':
      return hth === 0 && hta === 0 ? 'win' : 'loss';
    case 'FH_CS_1_0':
      return hth === 1 && hta === 0 ? 'win' : 'loss';
    case 'FH_CS_0_1':
      return hth === 0 && hta === 1 ? 'win' : 'loss';
    case 'FH_CS_1_1':
      return hth === 1 && hta === 1 ? 'win' : 'loss';
    case 'FH_CS_2_0':
      return hth === 2 && hta === 0 ? 'win' : 'loss';
    case 'FH_CS_0_2':
      return hth === 0 && hta === 2 ? 'win' : 'loss';
    case 'FH_CS_2_1':
      return hth === 2 && hta === 1 ? 'win' : 'loss';
    case 'FH_CS_1_2':
      return hth === 1 && hta === 2 ? 'win' : 'loss';

    // Multigoals
    case 'MG_0':
      return tot === 0 ? 'win' : 'loss';
    case 'MG_1_2':
      return tot >= 1 && tot <= 2 ? 'win' : 'loss';
    case 'MG_1_3':
      return tot >= 1 && tot <= 3 ? 'win' : 'loss';
    case 'MG_1_4':
      return tot >= 1 && tot <= 4 ? 'win' : 'loss';
    case 'MG_1_5':
      return tot >= 1 && tot <= 5 ? 'win' : 'loss';
    case 'MG_1_6':
      return tot >= 1 && tot <= 6 ? 'win' : 'loss';
    case 'MG_2_3':
      return tot >= 2 && tot <= 3 ? 'win' : 'loss';
    case 'MG_2_4':
      return tot >= 2 && tot <= 4 ? 'win' : 'loss';
    case 'MG_2_5':
      return tot >= 2 && tot <= 5 ? 'win' : 'loss';
    case 'MG_2_6':
      return tot >= 2 && tot <= 6 ? 'win' : 'loss';
    case 'MG_3_4':
      return tot >= 3 && tot <= 4 ? 'win' : 'loss';
    case 'MG_3_5':
      return tot >= 3 && tot <= 5 ? 'win' : 'loss';
    case 'MG_3_6':
      return tot >= 3 && tot <= 6 ? 'win' : 'loss';
    case 'MG_4_5':
      return tot >= 4 && tot <= 5 ? 'win' : 'loss';
    case 'MG_4_6':
      return tot >= 4 && tot <= 6 ? 'win' : 'loss';
    case 'MG_5_6':
      return tot >= 5 && tot <= 6 ? 'win' : 'loss';
    case 'MG_7P':
      return tot >= 7 ? 'win' : 'loss';

    // Team Totals
    case 'HT_O05':
      return hg >= 1 ? 'win' : 'loss';
    case 'HT_U05':
      return hg === 0 ? 'win' : 'loss';
    case 'HT_O15':
      return hg >= 2 ? 'win' : 'loss';
    case 'HT_U15':
      return hg <= 1 ? 'win' : 'loss';
    case 'HT_O25':
      return hg >= 3 ? 'win' : 'loss';
    case 'HT_U25':
      return hg <= 2 ? 'win' : 'loss';
    case 'AT_O05':
      return ag >= 1 ? 'win' : 'loss';
    case 'AT_U05':
      return ag === 0 ? 'win' : 'loss';
    case 'AT_O15':
      return ag >= 2 ? 'win' : 'loss';
    case 'AT_U15':
      return ag <= 1 ? 'win' : 'loss';
    case 'AT_O25':
      return ag >= 3 ? 'win' : 'loss';
    case 'AT_U25':
      return ag <= 2 ? 'win' : 'loss';

    case 'HMG_0':
      return hg === 0 ? 'win' : 'loss';
    case 'HMG_1_2':
      return hg >= 1 && hg <= 2 ? 'win' : 'loss';
    case 'HMG_1_3':
      return hg >= 1 && hg <= 3 ? 'win' : 'loss';
    case 'HMG_2_3':
      return hg >= 2 && hg <= 3 ? 'win' : 'loss';
    case 'HMG_4P':
      return hg >= 4 ? 'win' : 'loss';
    case 'AMG_0':
      return ag === 0 ? 'win' : 'loss';
    case 'AMG_1_2':
      return ag >= 1 && ag <= 2 ? 'win' : 'loss';
    case 'AMG_1_3':
      return ag >= 1 && ag <= 3 ? 'win' : 'loss';
    case 'AMG_2_3':
      return ag >= 2 && ag <= 3 ? 'win' : 'loss';
    case 'AMG_4P':
      return ag >= 4 ? 'win' : 'loss';

    // Handicap & Winning Margin
    case 'HCP_H1':
      return hg - 1 > ag ? 'win' : 'loss';
    case 'HCP_D1':
      return hg - 1 === ag ? 'win' : 'loss';
    case 'HCP_A1':
      return ag + 1 > hg ? 'win' : 'loss';
    case 'HCP_HP1':
      return hg + 1 > ag ? 'win' : 'loss';
    case 'HCP_AP1':
      return ag - 1 > hg ? 'win' : 'loss';

    case 'WM_H1':
      return hg - ag === 1 ? 'win' : 'loss';
    case 'WM_H2P':
      return hg - ag >= 2 ? 'win' : 'loss';
    case 'WM_D':
      return hg === ag ? 'win' : 'loss';
    case 'WM_A1':
      return ag - hg === 1 ? 'win' : 'loss';
    case 'WM_A2P':
      return ag - hg >= 2 ? 'win' : 'loss';

    // Exact Goals
    case 'EXG_0':
      return tot === 0 ? 'win' : 'loss';
    case 'EXG_1':
      return tot === 1 ? 'win' : 'loss';
    case 'EXG_2':
      return tot === 2 ? 'win' : 'loss';
    case 'EXG_3':
      return tot === 3 ? 'win' : 'loss';
    case 'EXG_4':
      return tot === 4 ? 'win' : 'loss';
    case 'EXG_5P':
      return tot >= 5 ? 'win' : 'loss';
    case 'HEX_0':
      return hg === 0 ? 'win' : 'loss';
    case 'HEX_1':
      return hg === 1 ? 'win' : 'loss';
    case 'HEX_2':
      return hg === 2 ? 'win' : 'loss';
    case 'HEX_3P':
      return hg >= 3 ? 'win' : 'loss';
    case 'AEX_0':
      return ag === 0 ? 'win' : 'loss';
    case 'AEX_1':
      return ag === 1 ? 'win' : 'loss';
    case 'AEX_2':
      return ag === 2 ? 'win' : 'loss';
    case 'AEX_3P':
      return ag >= 3 ? 'win' : 'loss';

    // Clean Sheet & Win To Nil
    case 'H_CS_YES':
      return ag === 0 ? 'win' : 'loss';
    case 'H_CS_NO':
      return ag >= 1 ? 'win' : 'loss';
    case 'A_CS_YES':
      return hg === 0 ? 'win' : 'loss';
    case 'A_CS_NO':
      return hg >= 1 ? 'win' : 'loss';
    case 'H_WTN_YES':
      return hg > ag && ag === 0 ? 'win' : 'loss';
    case 'H_WTN_NO':
      return !(hg > ag && ag === 0) ? 'win' : 'loss';
    case 'A_WTN_YES':
      return ag > hg && hg === 0 ? 'win' : 'loss';
    case 'A_WTN_NO':
      return !(ag > hg && hg === 0) ? 'win' : 'loss';

    // Combos
    case 'C_1_GG':
      return hg > ag && hg >= 1 && ag >= 1 ? 'win' : 'loss';
    case 'C_1_NG':
      return hg > ag && ag === 0 ? 'win' : 'loss';
    case 'C_X_GG':
      return hg === ag && hg >= 1 ? 'win' : 'loss';
    case 'C_X_NG':
      return hg === 0 && ag === 0 ? 'win' : 'loss';
    case 'C_2_GG':
      return ag > hg && hg >= 1 && ag >= 1 ? 'win' : 'loss';
    case 'C_2_NG':
      return ag > hg && hg === 0 ? 'win' : 'loss';

    case 'C_O25_GG':
      return tot >= 3 && hg >= 1 && ag >= 1 ? 'win' : 'loss';
    case 'C_O25_NG':
      return tot >= 3 && (hg === 0 || ag === 0) ? 'win' : 'loss';
    case 'C_U25_GG':
      return tot <= 2 && hg >= 1 && ag >= 1 ? 'win' : 'loss';
    case 'C_U25_NG':
      return tot <= 2 && (hg === 0 || ag === 0) ? 'win' : 'loss';

    case 'C_1_O25':
      return hg > ag && tot >= 3 ? 'win' : 'loss';
    case 'C_1_U25':
      return hg > ag && tot <= 2 ? 'win' : 'loss';
    case 'C_X_O25':
      return hg === ag && tot >= 3 ? 'win' : 'loss';
    case 'C_X_U25':
      return hg === ag && tot <= 2 ? 'win' : 'loss';
    case 'C_2_O25':
      return ag > hg && tot >= 3 ? 'win' : 'loss';
    case 'C_2_U25':
      return ag > hg && tot <= 2 ? 'win' : 'loss';

    case 'C_1X_GG':
      return hg >= ag && hg >= 1 && ag >= 1 ? 'win' : 'loss';
    case 'C_1X_NG':
      return hg >= ag && (hg === 0 || ag === 0) ? 'win' : 'loss';
    case 'C_X2_GG':
      return ag >= hg && hg >= 1 && ag >= 1 ? 'win' : 'loss';
    case 'C_X2_NG':
      return ag >= hg && (hg === 0 || ag === 0) ? 'win' : 'loss';
    case 'C_12_GG':
      return hg !== ag && hg >= 1 && ag >= 1 ? 'win' : 'loss';
    case 'C_12_NG':
      return hg !== ag && (hg === 0 || ag === 0) ? 'win' : 'loss';

    case 'C_1X_O25':
      return hg >= ag && tot >= 3 ? 'win' : 'loss';
    case 'C_1X_U25':
      return hg >= ag && tot <= 2 ? 'win' : 'loss';
    case 'C_X2_O25':
      return ag >= hg && tot >= 3 ? 'win' : 'loss';
    case 'C_X2_U25':
      return ag >= hg && tot <= 2 ? 'win' : 'loss';

    // HT / FT
    case 'HTFT_1_1':
      return hth > hta && hg > ag ? 'win' : 'loss';
    case 'HTFT_1_X':
      return hth > hta && hg === ag ? 'win' : 'loss';
    case 'HTFT_1_2':
      return hth > hta && ag > hg ? 'win' : 'loss';
    case 'HTFT_X_1':
      return hth === hta && hg > ag ? 'win' : 'loss';
    case 'HTFT_X_X':
      return hth === hta && hg === ag ? 'win' : 'loss';
    case 'HTFT_X_2':
      return hth === hta && ag > hg ? 'win' : 'loss';
    case 'HTFT_2_1':
      return hta > hth && hg > ag ? 'win' : 'loss';
    case 'HTFT_2_X':
      return hta > hth && hg === ag ? 'win' : 'loss';
    case 'HTFT_2_2':
      return hta > hth && ag > hg ? 'win' : 'loss';
    case 'HTFT_11_O25':
      return hth > hta && hg > ag && tot >= 3 ? 'win' : 'loss';
    case 'HTFT_XX_U25':
      return hth === hta && hg === ag && tot <= 2 ? 'win' : 'loss';
    case 'HTFT_22_O25':
      return hta > hth && ag > hg && tot >= 3 ? 'win' : 'loss';

    // Halves Specials
    case 'H_WBH':
      return hth > hta && shh > sha ? 'win' : 'loss';
    case 'A_WBH':
      return hta > hth && sha > shh ? 'win' : 'loss';
    case 'H_WEH':
      return hth > hta || shh > sha ? 'win' : 'loss';
    case 'A_WEH':
      return hta > hth || sha > shh ? 'win' : 'loss';
    case 'BOTH_H_GG':
      return hth >= 1 && hta >= 1 && shh >= 1 && sha >= 1 ? 'win' : 'loss';
    case 'H_SBH':
      return hth >= 1 && shh >= 1 ? 'win' : 'loss';
    case 'A_SBH':
      return hta >= 1 && sha >= 1 ? 'win' : 'loss';
    case 'BH_O15':
      return htTot >= 2 && shTot >= 2 ? 'win' : 'loss';
    case 'BH_U15':
      return htTot <= 1 && shTot <= 1 ? 'win' : 'loss';

    // Correct Score
    case 'CS_0_0':
      return hg === 0 && ag === 0 ? 'win' : 'loss';
    case 'CS_1_0':
      return hg === 1 && ag === 0 ? 'win' : 'loss';
    case 'CS_0_1':
      return hg === 0 && ag === 1 ? 'win' : 'loss';
    case 'CS_1_1':
      return hg === 1 && ag === 1 ? 'win' : 'loss';
    case 'CS_2_0':
      return hg === 2 && ag === 0 ? 'win' : 'loss';
    case 'CS_0_2':
      return hg === 0 && ag === 2 ? 'win' : 'loss';
    case 'CS_2_1':
      return hg === 2 && ag === 1 ? 'win' : 'loss';
    case 'CS_1_2':
      return hg === 1 && ag === 2 ? 'win' : 'loss';
    case 'CS_2_2':
      return hg === 2 && ag === 2 ? 'win' : 'loss';
    case 'CS_3_0':
      return hg === 3 && ag === 0 ? 'win' : 'loss';
    case 'CS_0_3':
      return hg === 0 && ag === 3 ? 'win' : 'loss';
    case 'CS_3_1':
      return hg === 3 && ag === 1 ? 'win' : 'loss';
    case 'CS_1_3':
      return hg === 1 && ag === 3 ? 'win' : 'loss';
    case 'CS_3_2':
      return hg === 3 && ag === 2 ? 'win' : 'loss';
    case 'CS_2_3':
      return hg === 2 && ag === 3 ? 'win' : 'loss';
    case 'CS_OTHER':
      return hg >= 4 || ag >= 4 ? 'win' : 'loss';

    // Cards & Corners
    case 'CRD_O25':
      return cards >= 3 ? 'win' : 'loss';
    case 'CRD_U25':
      return cards <= 2 ? 'win' : 'loss';
    case 'CRD_O35':
      return cards >= 4 ? 'win' : 'loss';
    case 'CRD_U35':
      return cards <= 3 ? 'win' : 'loss';
    case 'CRD_O45':
      return cards >= 5 ? 'win' : 'loss';
    case 'CRD_U45':
      return cards <= 4 ? 'win' : 'loss';
    case 'CRD_O55':
      return cards >= 6 ? 'win' : 'loss';
    case 'CRD_U55':
      return cards <= 5 ? 'win' : 'loss';
    case 'RED_YES':
      return redCards >= 1 ? 'win' : 'loss';
    case 'RED_NO':
      return redCards === 0 ? 'win' : 'loss';
    case 'CRN_O75':
      return corners >= 8 ? 'win' : 'loss';
    case 'CRN_U75':
      return corners <= 7 ? 'win' : 'loss';
    case 'CRN_O85':
      return corners >= 9 ? 'win' : 'loss';
    case 'CRN_U85':
      return corners <= 8 ? 'win' : 'loss';
    case 'CRN_O95':
      return corners >= 10 ? 'win' : 'loss';
    case 'CRN_U95':
      return corners <= 9 ? 'win' : 'loss';
    case 'CRN_O105':
      return corners >= 11 ? 'win' : 'loss';
    case 'CRN_U105':
      return corners <= 10 ? 'win' : 'loss';
    case 'CRN_1':
      return hCrn > aCrn ? 'win' : 'loss';
    case 'CRN_X':
      return hCrn === aCrn ? 'win' : 'loss';
    case 'CRN_2':
      return aCrn > hCrn ? 'win' : 'loss';
  }
}

export function estimateFootballLegLiveWinProb(
  pick: FootballTicketPick,
  minute: number,
): number {
  const t = Math.min(1, Math.max(0, minute / 90));
  const baseProb = Math.min(0.88, Math.max(0.08, 0.91 / Math.max(1.03, pick.odd)));
  const currentlyHitting = evaluateFootballPickOutcome(pick, false) === 'win';

  const m = pick.market;
  const tot = pick.homeGoals + pick.awayGoals;
  const hth = pick.htHomeGoals ?? 0;
  const hta = pick.htAwayGoals ?? 0;
  const htTot = hth + hta;
  const cards = (pick.homeCards ?? 0) + (pick.awayCards ?? 0);
  const corners = (pick.homeCorners ?? 0) + (pick.awayCorners ?? 0);
  const redCards = (pick.homeRedCards ?? 0) + (pick.awayRedCards ?? 0);

  // Hard busted conditions (monotone bets that cannot recover once broken)
  if ((m === 'U05' || m === 'MG_0' || m === 'EXG_0' || m === 'CS_0_0') && tot >= 1) return 0;
  if ((m === 'U15' || m === 'EXG_1') && tot >= 2) return 0;
  if ((m === 'U25' || m === 'EXG_2' || m === 'C_U25_GG' || m === 'C_U25_NG' || m === 'C_1_U25' || m === 'C_X_U25' || m === 'C_2_U25' || m === 'C_1X_U25' || m === 'C_X2_U25' || m === 'HTFT_XX_U25') && tot >= 3) return 0;
  if ((m === 'U35' || m === 'EXG_3' || m === 'MG_1_2' || m === 'MG_1_3' || m === 'MG_2_3') && tot > (m === 'MG_1_2' ? 2 : 3)) return 0;
  if ((m === 'U45' || m === 'EXG_4' || m === 'MG_1_4' || m === 'MG_2_4' || m === 'MG_3_4') && tot > 4) return 0;
  if ((m === 'NG' || m === 'C_1_NG' || m === 'C_X_NG' || m === 'C_2_NG' || m === 'C_O25_NG' || m === 'C_1X_NG' || m === 'C_X2_NG' || m === 'C_12_NG') && pick.homeGoals >= 1 && pick.awayGoals >= 1) return 0;
  if ((m === 'H_CS_YES' || m === 'H_WTN_YES') && pick.awayGoals >= 1) return 0;
  if ((m === 'A_CS_YES' || m === 'A_WTN_YES') && pick.homeGoals >= 1) return 0;
  if ((m === 'HT_U05' || m === 'HMG_0' || m === 'HEX_0') && pick.homeGoals >= 1) return 0;
  if ((m === 'AT_U05' || m === 'AMG_0' || m === 'AEX_0') && pick.awayGoals >= 1) return 0;
  if (m === 'CRD_U25' && cards >= 3) return 0;
  if (m === 'CRD_U35' && cards >= 4) return 0;
  if (m === 'CRD_U45' && cards >= 5) return 0;
  if (m === 'CRD_U55' && cards >= 6) return 0;
  if (m === 'RED_NO' && redCards >= 1) return 0;
  if (m === 'CRN_U75' && corners >= 8) return 0;
  if (m === 'CRN_U85' && corners >= 9) return 0;
  if (m === 'CRN_U95' && corners >= 10) return 0;
  if (m === 'CRN_U105' && corners >= 11) return 0;

  // Already resolved 1st Half markets after 45'
  if (m.startsWith('FH_') && minute >= 45) {
    return currentlyHitting ? 1 : 0;
  }
  if (m.startsWith('FH_') && (m === 'FH_U05' || m === 'FH_EXG_0' || m === 'FH_CS_0_0') && htTot >= 1) return 0;
  if (m === 'FH_U15' && htTot >= 2) return 0;
  if (m === 'FH_U25' && htTot >= 3) return 0;
  if (m === 'FH_NG' && hth >= 1 && hta >= 1) return 0;

  // Monotone already-guaranteed bets
  if (
    (m === 'O05' && tot >= 1) ||
    (m === 'O15' && tot >= 2) ||
    (m === 'O25' && tot >= 3) ||
    (m === 'O35' && tot >= 4) ||
    (m === 'O45' && tot >= 5) ||
    (m === 'GG' && pick.homeGoals >= 1 && pick.awayGoals >= 1) ||
    (m === 'HT_O05' && pick.homeGoals >= 1) ||
    (m === 'HT_O15' && pick.homeGoals >= 2) ||
    (m === 'HT_O25' && pick.homeGoals >= 3) ||
    (m === 'AT_O05' && pick.awayGoals >= 1) ||
    (m === 'AT_O15' && pick.awayGoals >= 2) ||
    (m === 'AT_O25' && pick.awayGoals >= 3) ||
    (m === 'MG_7P' && tot >= 7) ||
    (m === 'EXG_5P' && tot >= 5) ||
    (m === 'CS_OTHER' && (pick.homeGoals >= 4 || pick.awayGoals >= 4)) ||
    (m === 'RED_YES' && redCards >= 1) ||
    (m === 'CRD_O25' && cards >= 3) ||
    (m === 'CRD_O35' && cards >= 4) ||
    (m === 'CRD_O45' && cards >= 5) ||
    (m === 'CRD_O55' && cards >= 6) ||
    (m === 'CRN_O75' && corners >= 8) ||
    (m === 'CRN_O85' && corners >= 9) ||
    (m === 'CRN_O95' && corners >= 10) ||
    (m === 'CRN_O105' && corners >= 11) ||
    (m === 'C_O25_GG' && tot >= 3 && pick.homeGoals >= 1 && pick.awayGoals >= 1)
  ) {
    return 1;
  }

  // Dynamic interpolation based on whether leg is currently hitting
  if (currentlyHitting) {
    return Math.min(0.95, baseProb + (0.94 - baseProb) * (0.25 + 0.75 * t));
  }
  return Math.max(0.03, baseProb * (1 - 0.85 * t));
}
