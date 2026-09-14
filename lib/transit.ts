/**
 * lib/transit.ts
 * Pure transit scoring logic — no API calls, no side-effects.
 *
 * Scoring rules:
 *
 * ── Case 1: Subway within 500 m (직선거리) ──────────────────────────────────
 *   Base: 18 pts
 *   + Tier 1 station: +3 pts
 *   + Tier 2 station: +2 pts
 *   + Tier 3 station: +1 pt
 *   + Tier 4 / unknown: +0 pts
 *   + Express stop: +2 pts
 *   + Transfer hub (≥2 lines): +2 pts
 *   Cap: 25 pts
 *
 * ── Case 2: Feeder bus → subway within 1.5 km ───────────────────────────────
 *   Base: 10 pts
 *   + Bus connects to Tier 1/2 station: +4 pts
 *   Cap: 14 pts
 *
 * ── Case 3: No transit ───────────────────────────────────────────────────────
 *   0 pts
 */

import { getStationMeta } from '@/data/subway-lines';
import type { SubwayInfo } from '@/types/score';

export interface TransitScore {
  /** Transit points (0–25) */
  score: number;
  /** Human-readable summary for UI display */
  description: string;
}

const MAX_SUBWAY_SCORE = 25;
const MAX_BUS_SCORE = 14;

const TIER_BONUS: Record<1 | 2 | 3 | 4, number> = {
  1: 3,
  2: 2,
  3: 1,
  4: 0,
};

/**
 * Calculate a deterministic transit score (0–25).
 *
 * @param subway   - Subway info from InfrastructureData (Kakao API result).
 * @param busNearby           - True when a feeder bus exists within walking range.
 * @param busDirectToHighTier - True when the bus connects to a Tier 1/2 station.
 */
export function evaluateTransitScore(
  subway: SubwayInfo,
  busNearby = false,
  busDirectToHighTier = false,
): TransitScore {
  // ── Case 1: Subway reachable within 500 m ──────────────────────────────────
  if (subway.exists && subway.stationName !== null) {
    const meta = getStationMeta(subway.stationName);

    let pts = 18;
    pts += TIER_BONUS[meta.tier];
    if (meta.isExpress) pts += 2;
    if (meta.isTransfer) pts += 2;

    const capped = Math.min(pts, MAX_SUBWAY_SCORE);

    const bonuses: string[] = [];
    if (TIER_BONUS[meta.tier] > 0) bonuses.push(`${meta.tier}티어 노선 +${TIER_BONUS[meta.tier]}`);
    if (meta.isExpress) bonuses.push('급행 +2');
    if (meta.isTransfer) bonuses.push('환승 +2');

    const description =
      `지하철 도보 500m 이내 (${subway.stationName}역)` +
      (bonuses.length > 0 ? ` · ${bonuses.join(', ')}` : '') +
      (capped < pts ? ' · 상한 25점 적용' : '');

    return { score: capped, description };
  }

  // ── Case 2: No subway, but feeder bus available ─────────────────────────────
  if (busNearby) {
    let pts = 10;
    if (busDirectToHighTier) pts += 4;
    const capped = Math.min(pts, MAX_BUS_SCORE);
    const description =
      '대중교통 버스 환승 (지하철 1.5km 이내)' +
      (busDirectToHighTier ? ' · 고급 노선 연결 +4' : '');
    return { score: capped, description };
  }

  // ── Case 3: Isolated ─────────────────────────────────────────────────────────
  return { score: 0, description: '대중교통 접근 불가' };
}
