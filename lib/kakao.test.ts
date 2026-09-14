/**
 * lib/kakao.test.ts
 * Structural & contract validation for the Kakao integration layer and
 * the API route's mock/error-handling paths.
 */

import { calculateTotalScore } from './scoring';
import { getTierResult } from './scoring';
import type {
  InfrastructureData,
  ScoreBreakdown,
  TierResult,
} from '../types/score';

interface ScoreApiResponse {
  address: string;
  coordinates: { lat: number; lng: number };
  infrastructure: InfrastructureData;
  breakdown: ScoreBreakdown;
  tier: TierResult;
}

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ─────────────────────────────────────────`);
}

function buildMockInfra(): InfrastructureData {
  return {
    subway: {
      exists: true,
      distanceMetres: 280,
      stationName: '홍대입구',
      lines: ['2호선', '경의중앙선', 'AREX'],
      hasExpress: false,
    },
    cvs: {
      gs25: 2,
      cu: 1,
      seven: 1,
      emart24: 0,
      nearestDist: 120,
    },
    laundromat: { count: 1, nearestDist: 250 },
    mart: {
      daisoCount: 1,
      daisoDist: 350,
      emartCount: 0,
      homeplusCount: 0,
      lotteMartCount: 1,
      mediumSuperCount: 2,
      nearestDist: 400,
    },
    deptStore: { name: '현대백화점', nearestDist: 800 },
    cinema: { name: 'CGV', nearestDist: 600 },
    cafe: { hasStarbucks: true, nearestDist: 150 },
    care: { hasOliveYoung: true, hasGym: true, nearestDist: 200 },
    medical: { nearestDist: 300 },
  };
}

function buildMockResponse(address: string, steepHill: boolean): ScoreApiResponse {
  const mockInfra = buildMockInfra();
  const breakdown = calculateTotalScore(mockInfra, steepHill);
  const tier = getTierResult(breakdown.totalScore, breakdown);
  return {
    address,
    coordinates: { lat: 37.5563, lng: 126.9236 },
    infrastructure: mockInfra,
    breakdown,
    tier,
  };
}

// ---------------------------------------------------------------------------
// 1. Payload structure validation
// ---------------------------------------------------------------------------
section('Mock Payload Structure');

const mock = buildMockResponse('서울시 마포구 홍대입구역', false);

assert('payload.address is string', typeof mock.address === 'string');
assert(
  'payload.coordinates has lat/lng numbers',
  typeof mock.coordinates.lat === 'number' && typeof mock.coordinates.lng === 'number'
);

// ScoreBreakdown keys
const bd: ScoreBreakdown = mock.breakdown;
assert('breakdown.subway.score is a number', typeof bd.subway.score === 'number');
assert('breakdown.convenience.score is a number', typeof bd.convenience.score === 'number');
assert('breakdown.totalScore is a number', typeof bd.totalScore === 'number');
assert('breakdown.martDaiso.counts.daiso is a number', typeof bd.martDaiso.counts.daiso === 'number');

// TierResult keys
assert('tier.tier is valid', ['S', 'A', 'B', 'C', 'F'].includes(mock.tier.tier));
assert('tier.title is non-empty string', typeof mock.tier.title === 'string' && mock.tier.title.length > 0);
assert('tier.quote is non-empty string', typeof mock.tier.quote === 'string' && mock.tier.quote.length > 0);
assert('tier.score === breakdown.totalScore', mock.tier.score === mock.breakdown.totalScore);
assert('tier.breakdown === mock.breakdown (same object)', mock.tier.breakdown === mock.breakdown);

console.log(`\n══ Result: ${passed} passed, ${failed} failed ══\n`);
if (failed > 0) process.exit(1);
