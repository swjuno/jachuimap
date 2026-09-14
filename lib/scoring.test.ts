/**
 * lib/scoring.test.ts
 * Standalone deterministic test/verification runner for the scoring domain logic.
 */

import { calculateTotalScore, getTierResult, SCORE_MAX, LIFESTYLE_MAX, TOTAL_SCORE_MAX } from './scoring';
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

section('100-point scoring and medical boundaries');

const fullData: InfrastructureData = baseData({
  subway: { exists: true, distanceMetres: 350, stationName: 'A', lines: ['1', '2'], hasExpress: false },
  cvs: { gs25: 1, cu: 1, seven: 0, emart24: 0, nearestDist: 150 },
  laundromat: { count: 1, nearestDist: 300 },
  mart: { daisoCount: 1, daisoDist: 400, emartCount: 1, homeplusCount: 0, lotteMartCount: 0, mediumSuperCount: 0, nearestDist: 400 },
  deptStore: { name: '백화점', nearestDist: 600 },
  cinema: { name: '영화관', nearestDist: 500 },
  cafe: { hasStarbucks: true, nearestDist: 150 },
  care: { hasOliveYoung: true, hasGym: true, nearestDist: 250 },
  medical: { nearestDist: 250 },
});
const full = calculateTotalScore(fullData);
const lifestyleSum = Object.values(full.lifestyle).reduce((sum, item) => sum + item.score, 0);
assert('Medical maximum is 8', SCORE_MAX.medical === 8);
assert('Lifestyle adds up to 50', lifestyleSum === 50 && LIFESTYLE_MAX === 50);
assert('Raw item sum and displayed maximum are exactly 100',
  full.subway.score + full.convenience.score + full.martDaiso.score + lifestyleSum === 100
  && full.totalScore === 100 && TOTAL_SCORE_MAX === 100);
assert('Fully equipped location is S / allGood', getTierResult(full.totalScore, full).tier === 'S' && full.weakestCategory === 'allGood');
assert('No infrastructure remains zero', calculateTotalScore(baseData()).totalScore === 0);

const medicalCases: readonly [number | null, number][] = [
  [0, 8], [249, 8], [250, 8], [251, 6], [499, 6], [500, 6], [501, 0], [null, 0],
];
for (const [distance, expected] of medicalCases) {
  const result = calculateTotalScore(baseData({ medical: { nearestDist: distance } }));
  assert(`Medical ${distance}m gives ${expected}`, result.lifestyle.medical.score === expected && result.totalScore === expected);
}
const fartherMedical = calculateTotalScore({ ...fullData, medical: { nearestDist: 500 } });
assert('Medical 6/8 is a weakness, not full credit', fartherMedical.weakestCategory === 'medical');

section('Non-medical regression and transfer bonus');

function nonMedicalScores(data: InfrastructureData): number[] {
  const bd = calculateTotalScore(data);
  return [bd.subway.score, bd.convenience.score, bd.martDaiso.score,
    bd.lifestyle.deptStore.score, bd.lifestyle.cinema.score, bd.lifestyle.cafe.score, bd.lifestyle.care.score];
}
const mediumData: InfrastructureData = {
  ...fullData,
  subway: { ...fullData.subway, distanceMetres: 700 },
  cvs: { ...fullData.cvs, nearestDist: 300 },
  mart: { ...fullData.mart, daisoDist: 800, nearestDist: 800 },
  deptStore: { ...fullData.deptStore, nearestDist: 1000 },
  cinema: { ...fullData.cinema, nearestDist: 800 },
  cafe: { ...fullData.cafe, nearestDist: 400 },
  care: { ...fullData.care, nearestDist: 500 },
};
const regressionCases: readonly [InfrastructureData, number[]][] = [
  [fullData, [22, 14, 14, 15, 10, 9, 8]],
  [mediumData, [16, 10, 10, 10, 7, 6, 6]],
  [{ ...mediumData, subway: { ...fullData.subway, distanceMetres: 1000 },
    deptStore: { name: '백화점', nearestDist: 1500 }, cinema: { name: '영화관', nearestDist: 1200 } },
    [10, 10, 10, 5, 4, 6, 6]],
  [baseData(), [0, 0, 0, 0, 0, 0, 0]],
];
for (const [data, expected] of regressionCases) {
  for (const medicalDistance of [250, 500, null]) {
    assert(`Non-medical scores stay ${expected} with medical ${medicalDistance}`,
      JSON.stringify(nonMedicalScores({ ...data, medical: { nearestDist: medicalDistance } })) === JSON.stringify(expected));
  }
}

const transferCases: readonly [number | null, string[], boolean, number, number][] = [
  [300, ['1'], false, 20, 0], [300, ['1'], true, 20, 0],
  [350, ['1', '2'], false, 22, 2], [700, ['1', '2'], false, 16, 2],
  [1000, ['1', '2'], false, 10, 2], [1001, ['1', '2'], true, 0, 0],
  [null, ['1', '2'], false, 0, 0],
];
for (const [distanceMetres, lines, hasExpress, score, bonus] of transferCases) {
  const bd = calculateTotalScore(baseData({ subway: { exists: distanceMetres !== null, distanceMetres, lines, hasExpress, stationName: 'A' } }));
  assert(`Transfer at ${distanceMetres}m (${lines.length} lines, express ${hasExpress})`,
    bd.subway.score === score && bd.subway.transferBonus === bonus);
}

console.log(`\n══ Result: ${passed} passed, ${failed} failed ══\n`);
if (failed > 0) process.exit(1);
