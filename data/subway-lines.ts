/**
 * data/subway-lines.ts
 * Static mapping: normalised Seoul metro station name (without "역" suffix)
 *   → station metadata used by lib/transit.ts.
 *
 * Tier definitions:
 *   1 — Line 2, Line 9, Shinbundang Line (most critical, high frequency / reach)
 *   2 — Line 3, 5, 7, Suin-Bundang Line
 *   3 — Line 1, 4, 6, 8
 *   4 — Light rails: Ui-Sinseol, Sillim, Gimpo Gold Line
 *
 * isExpress: true for confirmed express (급행) stops.
 * isTransfer: true when ≥ 2 independent lines cross.
 *
 * This file is IMMUTABLE at runtime — no I/O, no mutations.
 */

export interface StationMeta {
  /** Line-tier (1 = best, 4 = light rail) */
  tier: 1 | 2 | 3 | 4;
  /** All lines serving this station */
  lines: string[];
  /** Express service available at this station */
  isExpress: boolean;
  /** Two or more distinct lines intersect here */
  isTransfer: boolean;
}

// ---------------------------------------------------------------------------
// Station dictionary  (key = name WITHOUT "역")
// ---------------------------------------------------------------------------

export const STATION_META: Readonly<Record<string, StationMeta>> = {
  // ── Tier 1 · Line 2 ────────────────────────────────────────────────────────
  강남: { tier: 1, lines: ['2호선'], isExpress: false, isTransfer: false },
  홍대입구: {
    tier: 1,
    lines: ['2호선', '경의중앙선', 'AREX'],
    isExpress: false,
    isTransfer: true,
  },
  신촌: { tier: 1, lines: ['2호선'], isExpress: false, isTransfer: false },
  합정: { tier: 1, lines: ['2호선', '6호선'], isExpress: false, isTransfer: true },
  당산: { tier: 1, lines: ['2호선', '9호선'], isExpress: false, isTransfer: true },
  건대입구: { tier: 1, lines: ['2호선', '7호선'], isExpress: false, isTransfer: true },
  잠실: {
    tier: 1,
    lines: ['2호선', '8호선'],
    isExpress: false,
    isTransfer: true,
  },
  신림: { tier: 1, lines: ['2호선', '신림선'], isExpress: false, isTransfer: true },
  봉천: { tier: 1, lines: ['2호선'], isExpress: false, isTransfer: false },
  낙성대: { tier: 1, lines: ['2호선'], isExpress: false, isTransfer: false },
  사당: {
    tier: 1,
    lines: ['2호선', '4호선'],
    isExpress: false,
    isTransfer: true,
  },
  교대: {
    tier: 1,
    lines: ['2호선', '3호선'],
    isExpress: false,
    isTransfer: true,
  },
  서울대입구: { tier: 1, lines: ['2호선'], isExpress: false, isTransfer: false },
  왕십리: {
    tier: 1,
    lines: ['2호선', '5호선', '경의중앙선', '수인분당선'],
    isExpress: false,
    isTransfer: true,
  },
  성수: { tier: 1, lines: ['2호선'], isExpress: false, isTransfer: false },
  뚝섬: { tier: 1, lines: ['2호선'], isExpress: false, isTransfer: false },
  구로디지털단지: {
    tier: 1,
    lines: ['2호선'],
    isExpress: false,
    isTransfer: false,
  },
  가산디지털단지: {
    tier: 1,
    lines: ['2호선', '7호선'],
    isExpress: false,
    isTransfer: true,
  },

  // ── Tier 1 · Line 9 (express stations) ─────────────────────────────────────
  신논현: { tier: 1, lines: ['9호선', '신분당선'], isExpress: true, isTransfer: true },
  언주: { tier: 1, lines: ['9호선'], isExpress: false, isTransfer: false },
  선정릉: {
    tier: 1,
    lines: ['9호선', '수인분당선'],
    isExpress: false,
    isTransfer: true,
  },
  여의도: {
    tier: 1,
    lines: ['5호선', '9호선'],
    isExpress: true,
    isTransfer: true,
  },
  노량진: {
    tier: 1,
    lines: ['1호선', '9호선'],
    isExpress: true,
    isTransfer: true,
  },
  동작: {
    tier: 1,
    lines: ['4호선', '9호선'],
    isExpress: true,
    isTransfer: true,
  },
  고속터미널: {
    tier: 1,
    lines: ['3호선', '7호선', '9호선'],
    isExpress: true,
    isTransfer: true,
  },
  봉은사: { tier: 1, lines: ['9호선'], isExpress: true, isTransfer: false },
  종합운동장: {
    tier: 1,
    lines: ['2호선', '9호선'],
    isExpress: true,
    isTransfer: true,
  },

  // ── Tier 1 · Shinbundang Line ────────────────────────────────────────────
  강남역신분당: { tier: 1, lines: ['신분당선', '2호선'], isExpress: false, isTransfer: true },
  양재: {
    tier: 1,
    lines: ['신분당선', '3호선'],
    isExpress: false,
    isTransfer: true,
  },
  판교: { tier: 1, lines: ['신분당선'], isExpress: false, isTransfer: false },

  // ── Tier 2 · Line 3 ─────────────────────────────────────────────────────────
  압구정: { tier: 2, lines: ['3호선'], isExpress: false, isTransfer: false },
  옥수: {
    tier: 2,
    lines: ['3호선', '경의중앙선'],
    isExpress: false,
    isTransfer: true,
  },
  충무로: {
    tier: 2,
    lines: ['3호선', '4호선'],
    isExpress: false,
    isTransfer: true,
  },
  을지로3가: {
    tier: 2,
    lines: ['2호선', '3호선'],
    isExpress: false,
    isTransfer: true,
  },
  종로3가: {
    tier: 2,
    lines: ['1호선', '3호선', '5호선'],
    isExpress: false,
    isTransfer: true,
  },
  동대입구: { tier: 2, lines: ['3호선'], isExpress: false, isTransfer: false },
  약수: {
    tier: 2,
    lines: ['3호선', '6호선'],
    isExpress: false,
    isTransfer: true,
  },

  // ── Tier 2 · Line 5 ─────────────────────────────────────────────────────────
  광화문: { tier: 2, lines: ['5호선'], isExpress: false, isTransfer: false },
  마포: { tier: 2, lines: ['5호선'], isExpress: false, isTransfer: false },
  공덕: {
    tier: 2,
    lines: ['5호선', '6호선', '경의중앙선', 'AREX'],
    isExpress: false,
    isTransfer: true,
  },
  영등포구청: {
    tier: 2,
    lines: ['2호선', '5호선'],
    isExpress: false,
    isTransfer: true,
  },

  // ── Tier 2 · Line 7 ─────────────────────────────────────────────────────────
  이수: {
    tier: 2,
    lines: ['4호선', '7호선'],
    isExpress: false,
    isTransfer: true,
  },
  논현: { tier: 2, lines: ['7호선'], isExpress: false, isTransfer: false },
  학동: { tier: 2, lines: ['7호선'], isExpress: false, isTransfer: false },
  강남구청: {
    tier: 2,
    lines: ['7호선', '수인분당선'],
    isExpress: false,
    isTransfer: true,
  },
  청담: { tier: 2, lines: ['7호선'], isExpress: false, isTransfer: false },

  // ── Tier 2 · Suin-Bundang Line ───────────────────────────────────────────────
  수서: {
    tier: 2,
    lines: ['수인분당선', 'SRT'],
    isExpress: false,
    isTransfer: true,
  },
  복정: {
    tier: 2,
    lines: ['수인분당선', '8호선'],
    isExpress: false,
    isTransfer: true,
  },

  // ── Tier 3 · Line 1 ─────────────────────────────────────────────────────────
  서울역: {
    tier: 3,
    lines: ['1호선', '4호선', 'AREX', '경의중앙선'],
    isExpress: true,
    isTransfer: true,
  },
  용산: {
    tier: 3,
    lines: ['1호선', '경의중앙선'],
    isExpress: true,
    isTransfer: true,
  },
  영등포: {
    tier: 3,
    lines: ['1호선', '경의중앙선'],
    isExpress: true,
    isTransfer: true,
  },
  수원: { tier: 3, lines: ['1호선'], isExpress: true, isTransfer: false },
  청량리: {
    tier: 3,
    lines: ['1호선', '수인분당선', '경의중앙선', 'KTX'],
    isExpress: true,
    isTransfer: true,
  },

  // ── Tier 3 · Line 4 ─────────────────────────────────────────────────────────
  혜화: { tier: 3, lines: ['4호선'], isExpress: false, isTransfer: false },
  미아사거리: { tier: 3, lines: ['4호선'], isExpress: false, isTransfer: false },
  쌍문: { tier: 3, lines: ['4호선'], isExpress: false, isTransfer: false },
  노원: {
    tier: 3,
    lines: ['4호선', '7호선'],
    isExpress: false,
    isTransfer: true,
  },
  창동: {
    tier: 3,
    lines: ['1호선', '4호선'],
    isExpress: false,
    isTransfer: true,
  },

  // ── Tier 3 · Line 6 ─────────────────────────────────────────────────────────
  상수: { tier: 3, lines: ['6호선'], isExpress: false, isTransfer: false },
  망원: { tier: 3, lines: ['6호선'], isExpress: false, isTransfer: false },
  응암: { tier: 3, lines: ['6호선'], isExpress: false, isTransfer: false },
  불광: {
    tier: 3,
    lines: ['3호선', '6호선'],
    isExpress: false,
    isTransfer: true,
  },

  // ── Tier 3 · Line 8 ─────────────────────────────────────────────────────────
  문정: { tier: 3, lines: ['8호선'], isExpress: false, isTransfer: false },
  장지: { tier: 3, lines: ['8호선'], isExpress: false, isTransfer: false },
  암사: { tier: 3, lines: ['8호선'], isExpress: false, isTransfer: false },

  // ── Tier 4 · Sillim Line (신림선) ────────────────────────────────────────
  서원: { tier: 4, lines: ['신림선'], isExpress: false, isTransfer: false },
  보라매공원: { tier: 4, lines: ['신림선'], isExpress: false, isTransfer: false },
  당곡: { tier: 4, lines: ['신림선'], isExpress: false, isTransfer: false },

  // ── Tier 4 · Ui-Sinseol Line (우이신설선) ────────────────────────────────
  북한산보국문: {
    tier: 4,
    lines: ['우이신설선'],
    isExpress: false,
    isTransfer: false,
  },
  솔밭공원: { tier: 4, lines: ['우이신설선'], isExpress: false, isTransfer: false },
  화계: { tier: 4, lines: ['우이신설선'], isExpress: false, isTransfer: false },

  // ── Tier 4 · Gimpo Gold Line (김포골드라인) ───────────────────────────────
  장기: { tier: 4, lines: ['김포골드라인'], isExpress: false, isTransfer: false },
  마산: { tier: 4, lines: ['김포골드라인'], isExpress: false, isTransfer: false },
  걸포북변: {
    tier: 4,
    lines: ['김포골드라인'],
    isExpress: false,
    isTransfer: false,
  },
} as const;

// ---------------------------------------------------------------------------
// Fallback for stations not listed above
// ---------------------------------------------------------------------------

/** Default metadata for any unlisted station — treated as Tier 3, no express, no transfer. */
export const UNLISTED_STATION_FALLBACK: StationMeta = {
  tier: 3,
  lines: [],
  isExpress: false,
  isTransfer: false,
};

/**
 * Look up a station by name (with or without "역" suffix, trimmed).
 * Returns the fallback for unlisted stations.
 */
export function getStationMeta(rawName: string): StationMeta {
  const normalized = rawName.trim().replace(/역$/, '');
  return STATION_META[normalized] ?? UNLISTED_STATION_FALLBACK;
}
