/**
 * lib/tier.ts
 * Pure tier classification logic — no API calls, no side-effects.
 *
 * Tier bands:
 *   S: 90–100  "슬세권의 지배자"
 *   A: 75–89   "갓성비 자취 마스터"
 *   B: 60–74   "타협형 도시민"
 *   C: 45–59   "배달앱 VIP 후보생"
 *   F: 0–44    "자연인 체험단"
 */

import type { ScoreBreakdown, Tier, TierResult } from '@/types/score';

interface TierDefinition {
  tier: Tier;
  minScore: number;
  title: string;
  quote: string;
}

// Ordered high → low so the first match wins.
const TIER_TABLE: readonly TierDefinition[] = [
  {
    tier: 'S',
    minScore: 90,
    title: '슬세권의 지배자',
    quote: '편의점, 카페, 마트가 다 걸어서 3분? 이 집 계약 안 하면 후회합니다.',
  },
  {
    tier: 'A',
    minScore: 75,
    title: '갓성비 자취 마스터',
    quote: '월세 대비 인프라가 이 정도면 진짜 갓벽. 친구들이 놀러 오고 싶어 할 거예요.',
  },
  {
    tier: 'B',
    minScore: 60,
    title: '타협형 도시민',
    quote: '완벽하진 않지만 살 만해요. 조금 불편해도 적응하면 괜찮은 동네.',
  },
  {
    tier: 'C',
    minScore: 45,
    title: '배달앱 VIP 후보생',
    quote: '주변에 아무것도 없어서 배달의민족 실버 등급까지 갈 것 같아요.',
  },
  {
    tier: 'F',
    minScore: 0,
    title: '자연인 체험단',
    quote: '인프라가 없으면 내면이 성장합니다. 자연인의 삶을 즐겨보세요.',
  },
] as const;

/**
 * Return the TierResult for a given total score and score breakdown.
 * Score must already be clamped to 0–100 by the caller (calculateTotalScore).
 */
export function getTierResult(totalScore: number, breakdown: ScoreBreakdown): TierResult {
  // Input guard — should never fire in normal usage, but protects the contract.
  const clamped = Math.max(0, Math.min(100, Math.round(totalScore)));

  const def = TIER_TABLE.find((t) => clamped >= t.minScore);

  // TIER_TABLE always has a minScore: 0 entry, so `def` is always defined.
  // The non-null assertion is safe here.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const { tier, title, quote } = def!;

  return { tier, title, quote, score: clamped, breakdown };
}
