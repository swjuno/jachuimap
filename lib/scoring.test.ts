/**
 * lib/scoring.test.ts
 * Standalone deterministic test/verification runner for the scoring domain logic.
 */

import { calculateTotalScore, getTierResult } from './scoring';
import type { InfrastructureData } from '../types/score';

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

function baseData(overrides: Partial<InfrastructureData> = {}): InfrastructureData {
  return {
    subway: { exists: false, distanceMetres: null, stationName: null, lines: [], hasExpress: false },
    cvs: { gs25: 0, cu: 0, seven: 0, emart24: 0, nearestDist: null },
    laundromat: { count: 0, nearestDist: null },
    mart: { daisoCount: 0, daisoDist: null, emartCount: 0, homeplusCount: 0, lotteMartCount: 0, mediumSuperCount: 0, nearestDist: null },
    deptStore: { name: null, nearestDist: null },
    cinema: { name: null, nearestDist: null },
    cafe: { hasStarbucks: false, nearestDist: null },
    care: { hasOliveYoung: false, hasGym: false, nearestDist: null },
    medical: { nearestDist: null },
    ...overrides,
  };
}

section('Tier Boundary Tests');

function tierFor(score: number): string {
  const bd = calculateTotalScore(baseData());
  return getTierResult(score, bd).tier;
}

assert('100 pts → S', tierFor(100) === 'S');
assert('90 pts → S',  tierFor(90)  === 'S');
assert('89 pts → A',  tierFor(89)  === 'A');
assert('75 pts → A',  tierFor(75)  === 'A');
assert('74 pts → B',  tierFor(74)  === 'B');
assert('60 pts → B',  tierFor(60)  === 'B');
assert('59 pts → C',  tierFor(59)  === 'C');
assert('45 pts → C',  tierFor(45)  === 'C');
assert('44 pts → F',  tierFor(44)  === 'F');
assert('0 pts → F',   tierFor(0)   === 'F');

section('Subway Tests');
assert('Subway 300m, 1 line → 20', calculateTotalScore(baseData({ subway: { exists: true, distanceMetres: 300, stationName: 'A', lines: ['1'], hasExpress: false } })).subway.score === 20);
assert('Subway 300m, 2 lines → 22', calculateTotalScore(baseData({ subway: { exists: true, distanceMetres: 300, stationName: 'A', lines: ['1', '2'], hasExpress: false } })).subway.score === 22);

section('CVS Tests');
assert('CVS 100m, 2 brands → 12', calculateTotalScore(baseData({ cvs: { gs25: 1, cu: 1, seven: 0, emart24: 0, nearestDist: 100 } })).convenience.score === 12);
assert('CVS 100m, laundry → 12', calculateTotalScore(baseData({ cvs: { gs25: 1, cu: 0, seven: 0, emart24: 0, nearestDist: 100 }, laundromat: { count: 1, nearestDist: 100 } })).convenience.score === 12);
assert('CVS 100m, 2 brands, laundry → 14', calculateTotalScore(baseData({ cvs: { gs25: 1, cu: 1, seven: 0, emart24: 0, nearestDist: 100 }, laundromat: { count: 1, nearestDist: 100 } })).convenience.score === 14);

console.log(`\n══ Result: ${passed} passed, ${failed} failed ══\n`);
if (failed > 0) process.exit(1);
