export interface WeekStat {
  gsis: string;
  week: number;
  position: string;
  team: string;
  opp: string;
  // passing
  att: number; cmp: number; passYd: number; passTd: number; int: number; pass2pt: number; sacks: number;
  // rushing
  car: number; rushYd: number; rushTd: number; rush2pt: number; rushFd: number;
  // receiving
  tgt: number; rec: number; recYd: number; recTd: number; rec2pt: number; recFd: number; tgtShare: number; airShare: number;
  fumLost: number;
  // kicking
  fgm0_19: number; fgm20_29: number; fgm30_39: number; fgm40_49: number; fgm50p: number; fgMiss: number; xpm: number; xpMiss: number;
  // individual defense
  tklSolo: number; tklAst: number; tfl: number; sack: number; qbHit: number; defInt: number; pd: number; ff: number; fr: number; defTd: number; safety: number;
  pprPoints: number;
}

export interface Game {
  week: number;
  home: string;
  away: string;
  kickoff: string | null; // ISO-ish local Eastern time "2026-11-25T20:00"
  homeScore: number | null;
  awayScore: number | null;
}

export interface NflPlayerInfo {
  gsis: string;
  pfr: string | null;
  birthDate: string | null;
  draftRound: number | null; // null = undrafted or unknown
  draftPick: number | null;
  rookieSeason: number | null;
  otc: string | null;
  height: string | null;
  weight: number | null;
  college: string | null;
}

export interface SnapRow { pfr: string; week: number; pct: number; snaps: number }

export interface Contract {
  otc: string;
  team: string;
  yearSigned: number;
  years: number;
  endYear: number; // last season covered
  apy: number; // average per year, $
  guaranteed: number;
  capPct: number; // APY as share of the cap
}

export interface InjuryReport { gsis: string; season: number; week: number; status: string; injury: string }

