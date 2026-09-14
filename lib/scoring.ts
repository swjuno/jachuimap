/**
 * lib/scoring.ts
 * Pure, deterministic infrastructure scoring.
 */

import type { InfrastructureData, ScoreBreakdown, TierResult, SubwayScoreInfo, ConvenienceScoreInfo, MartDaisoScoreInfo, LifestyleScoreInfo } from '@/types/score';

function getMinDist(...dists: (number | null)[]): number {
  const valid = dists.filter((d): d is number => d !== null);
  return valid.length > 0 ? Math.min(...valid) : 9999;
}

export function getDynamicCommentary(lowestKey: string, score: number, steepHill: boolean): string {
  if (lowestKey === 'allGood') return "단점을 찾을 수가 없습니다. 살기 편한 인프라가 완벽하게 갖춰진 최고의 동네예요!";
  if (steepHill && score < 75) return "인프라는 둘째치고 집 들어갈 때마다 허벅지가 터지는 유산소 지옥길.";

  switch (lowestKey) {
    case 'subway': return "집은 좋은데 출퇴근길이 지옥입니다. 버스 놓치면 택시비 파산 각!";
    case 'convenience': return "새벽에 라면이나 물 사러 나가려면 등산해야 합니다. 슬세권 실종!";
    case 'martDaiso': return "다이소 한 번 가려면 버스 타야 합니다. 쿠팡 로켓와우 없이는 생존 불가!";
    case 'deptStore': return "평일엔 괜찮은데 주말 쇼핑이나 약속 잡으려면 무조건 원정 나가야 해요.";
    case 'cinema': return "퇴근 후 문화생활은 넷플릭스가 유일한 희망인 조용한 동네입니다.";
    case 'cafe': return "슬리퍼 끌고 갈 스타벅스가 없습니다. 주말 카공족은 서러운 입지.";
    case 'care': return "퇴근길 올리브영 방앗간과 헬스장이 멀어 갓생 살기 쉽지 않겠네요.";
    case 'medical': return "감기약 하나 사려 해도 한참 걸립니다. 상비약 박스 구비 필수!";
    default: return "";
  }
}

export function calculateTotalScore(data: InfrastructureData, steepHill: boolean): ScoreBreakdown {
  // 1. Subway (Max 22)
  let subScore = 0;
  const subDist = data.subway.distanceMetres ?? 9999;
  if (subDist <= 350) subScore = 20;
  else if (subDist <= 700) subScore = 14;
  else if (subDist <= 1000) subScore = 8;

  // Transfer bonus (+2)
  if (subScore > 0 && data.subway.lines.length > 1) {
    subScore += 2;
  }

  const subwayInfo: SubwayScoreInfo = {
    nearestDist: subDist,
    name: data.subway.stationName ?? '',
    score: subScore,
  };

  // 2. Convenience / Laundry (Max 14)
  let cvsScore = 0;
  const cvsDist = data.cvs.nearestDist ?? 9999;
  if (cvsDist <= 150) cvsScore = 10;
  else if (cvsDist <= 300) cvsScore = 6;

  let brandCount = 0;
  if (data.cvs.gs25 > 0) brandCount++;
  if (data.cvs.cu > 0) brandCount++;
  if (data.cvs.seven > 0) brandCount++;
  if (data.cvs.emart24 > 0) brandCount++;

  if (cvsScore > 0 && brandCount >= 2) cvsScore += 2;
  if (data.laundromat.count > 0) cvsScore += 2;

  // Cap at 14 (should naturally cap, 10 + 2 + 2 = 14)
  cvsScore = Math.min(14, cvsScore);

  const convenienceInfo: ConvenienceScoreInfo = {
    score: cvsScore,
    nearestDist: getMinDist(cvsDist, data.laundromat.nearestDist),
    counts: {
      gs25: data.cvs.gs25,
      cu: data.cvs.cu,
      seven: data.cvs.seven,
      emart24: data.cvs.emart24,
      laundry: data.laundromat.count,
    }
  };

  // 3. Mart & Daiso (Max 14)
  let martScore = 0;
  const martDist = getMinDist(data.mart.daisoDist, data.mart.nearestDist);
  if (martDist <= 400) martScore = 10;
  else if (martDist <= 800) martScore = 6;

  const hasDaiso = data.mart.daisoCount > 0;
  const hasMart = data.mart.emartCount > 0 || data.mart.homeplusCount > 0 || data.mart.lotteMartCount > 0 || data.mart.mediumSuperCount > 0;
  if (martScore > 0 && hasDaiso && hasMart) {
    martScore += 4;
  }

  const martInfo: MartDaisoScoreInfo = {
    score: martScore,
    nearestDist: martDist,
    counts: {
      daiso: data.mart.daisoCount,
      emart: data.mart.emartCount,
      homeplus: data.mart.homeplusCount,
      lotteMart: data.mart.lotteMartCount,
      mediumSuper: data.mart.mediumSuperCount,
    }
  };

  // 4. Lifestyle (Max 48)
  const deptDist = data.deptStore.nearestDist ?? 9999;
  let deptScore = 0;
  if (deptDist <= 600) deptScore = 15;
  else if (deptDist <= 1000) deptScore = 10;
  else if (deptDist <= 1500) deptScore = 5;

  const cinemaDist = data.cinema.nearestDist ?? 9999;
  let cinemaScore = 0;
  if (cinemaDist <= 500) cinemaScore = 10;
  else if (cinemaDist <= 800) cinemaScore = 7;
  else if (cinemaDist <= 1200) cinemaScore = 4;

  const cafeDist = data.cafe.nearestDist ?? 9999;
  let cafeScore = 0;
  if (cafeDist <= 150) cafeScore = 7;
  else if (cafeDist <= 400) cafeScore = 4;
  if (cafeScore > 0 && data.cafe.hasStarbucks) cafeScore += 2;

  const careDist = data.care.nearestDist ?? 9999;
  let careScore = 0;
  if (careDist <= 250) careScore = 6;
  else if (careDist <= 500) careScore = 4;
  if (careScore > 0 && data.care.hasOliveYoung && data.care.hasGym) careScore += 2;

  const medDist = data.medical.nearestDist ?? 9999;
  let medScore = 0;
  if (medDist <= 250) medScore = 6;
  else if (medDist <= 500) medScore = 4;

  const lifestyleInfo: LifestyleScoreInfo = {
    deptStore: { nearestDist: deptDist, name: data.deptStore.name ?? '', score: deptScore },
    cinema: { nearestDist: cinemaDist, name: data.cinema.name ?? '', score: cinemaScore },
    cafe: { nearestDist: cafeDist, hasStarbucks: data.cafe.hasStarbucks, score: cafeScore },
    care: { nearestDist: careDist, hasOliveYoung: data.care.hasOliveYoung, hasGym: data.care.hasGym, score: careScore },
    medical: { nearestDist: medDist, score: medScore },
  };

  // 5. Steep Hill Penalty
  const steepHillPenalty = steepHill ? -10 : 0;

  // 6. Aggregate
  let totalScore = subScore + cvsScore + martScore + deptScore + cinemaScore + cafeScore + careScore + medScore + steepHillPenalty;
  totalScore = Math.max(0, Math.min(100, totalScore));

  const percentages = {
    subway: subScore / 22,
    convenience: cvsScore / 14,
    martDaiso: martScore / 14,
    deptStore: deptScore / 15,
    cinema: cinemaScore / 10,
    cafe: cafeScore / 9,
    care: careScore / 8,
    medical: medScore / 6,
  };

  let weakestCategory = 'allGood';
  let minPct = 1.0;

  const allGood = Object.values(percentages).every(p => p >= 0.85);
  if (!allGood) {
    for (const [key, pct] of Object.entries(percentages)) {
      if (pct < minPct) {
        minPct = pct;
        weakestCategory = key;
      }
    }
  }

  const dynamicMessage = getDynamicCommentary(weakestCategory, totalScore, steepHill);

  return {
    totalScore,
    tier: 'F', // will be set properly by getTierResult
    tierTitle: '',
    subway: subwayInfo,
    convenience: convenienceInfo,
    martDaiso: martInfo,
    lifestyle: lifestyleInfo,
    steepHillPenalty,
    dynamicMessage,
    weakestCategory,
  };
}

export function getTierResult(score: number, bd: ScoreBreakdown): TierResult {
  let tier: TierResult['tier'] = 'F';
  if (score >= 90) tier = 'S';
  else if (score >= 75) tier = 'A';
  else if (score >= 60) tier = 'B';
  else if (score >= 45) tier = 'C';
  else tier = 'F';

  let title = '';
  switch (bd.weakestCategory) {
    case 'subway': title = "교통 고립 탈출러"; break;
    case 'convenience': title = "슬세권 실종 구역"; break;
    case 'martDaiso': title = "로켓배송 의존 구역"; break;
    case 'deptStore': title = "주말 원정러의 터전"; break;
    case 'cinema': title = "넷플릭스 붙박이존"; break;
    case 'cafe': title = "카공 난민 구역"; break;
    case 'care': title = "갓생 보류 구역"; break;
    case 'medical': title = "상비약 필수 구역"; break;
    case 'allGood': title = "완성형 올인원 꿀단지"; break;
    default: title = "주말 원정러의 터전"; break;
  }

  bd.tier = tier;
  bd.tierTitle = title;

  return {
    tier,
    title,
    quote: bd.dynamicMessage,
    score,
    breakdown: bd,
  };
}
