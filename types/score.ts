/**
 * types/score.ts
 * Shared TypeScript interfaces for the K-Survival Map scoring system.
 */

// ---------------------------------------------------------------------------
// Final Response & Breakdown shape
// ---------------------------------------------------------------------------

export type Tier = 'S' | 'A' | 'B' | 'C' | 'F';

export interface SubwayScoreInfo {
  nearestDist: number; // 9999 means none found
  name: string;
  score: number;
}

export interface ConvenienceScoreInfo {
  score: number;
  nearestDist: number;
  counts: {
    gs25: number;
    cu: number;
    seven: number;
    emart24: number;
    laundry: number;
  };
}

export interface MartDaisoScoreInfo {
  score: number;
  nearestDist: number;
  counts: {
    daiso: number;
    emart: number;
    homeplus: number;
    lotteMart: number;
    mediumSuper: number; // MT1 excluding the big 3
  };
}

export interface LifestyleScoreInfo {
  deptStore: { nearestDist: number; name: string; score: number };
  cinema: { nearestDist: number; name: string; score: number };
  cafe: { nearestDist: number; hasStarbucks: boolean; score: number };
  care: { nearestDist: number; hasOliveYoung: boolean; hasGym: boolean; score: number };
  medical: { nearestDist: number; score: number };
}

export interface ScoreBreakdown {
  totalScore: number;
  tier: Tier;
  tierTitle: string;
  subway: SubwayScoreInfo;
  convenience: ConvenienceScoreInfo;
  martDaiso: MartDaisoScoreInfo;
  lifestyle: LifestyleScoreInfo;
  steepHillPenalty: number;
  dynamicMessage: string;
  weakestCategory: string;
}

// ---------------------------------------------------------------------------
// Intermediate Raw API Data shape (used in lib/kakao.ts before scoring)
// ---------------------------------------------------------------------------

export interface SubwayInfo {
  exists: boolean;
  distanceMetres: number | null;
  stationName: string | null;
  lines: string[];
  hasExpress: boolean;
}

export interface PlaceDoc {
  id: string;
  place_name: string;
  distance: string | number;
  x: string;
  y: string;
  category_name?: string;
  road_address_name?: string;
}

export interface RawDebugData {
  daisoRaw: PlaceDoc[];
  daisoDedup: PlaceDoc[];
  martRaw: PlaceDoc[];
  martDedup: PlaceDoc[];
  cvsRaw: PlaceDoc[];
  cvsDedup: PlaceDoc[];
}

export interface InfrastructureData {
  rawDebugData?: RawDebugData;
  subway: SubwayInfo;
  cvs: {
    gs25: number;
    cu: number;
    seven: number;
    emart24: number;
    nearestDist: number | null;
  };
  laundromat: {
    count: number;
    nearestDist: number | null;
  };
  mart: {
    daisoCount: number;
    daisoDist: number | null;
    emartCount: number;
    homeplusCount: number;
    lotteMartCount: number;
    mediumSuperCount: number;
    nearestDist: number | null;
  };
  deptStore: {
    name: string | null;
    nearestDist: number | null;
  };
  cinema: {
    name: string | null;
    nearestDist: number | null;
  };
  cafe: {
    hasStarbucks: boolean;
    nearestDist: number | null; // Nearest CE7
  };
  care: {
    hasOliveYoung: boolean;
    hasGym: boolean;
    nearestDist: number | null; // min(oliveYoung, gym)
  };
  medical: {
    nearestDist: number | null; // min(PM9, HP8)
  };
}

export interface TierResult {
  tier: Tier;
  title: string;
  quote: string;
  score: number;
  breakdown: ScoreBreakdown;
}
