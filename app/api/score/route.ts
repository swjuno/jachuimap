/**
 * app/api/score/route.ts
 */

import { geocodeAddress, fetchInfrastructureData } from '@/lib/kakao';
import { calculateTotalScore, getTierResult } from '@/lib/scoring';
import type { InfrastructureData, ScoreBreakdown, TierResult } from '@/types/score';

export interface ScoreApiResponse {
  address: string;
  coordinates: { lat: number; lng: number };
  infrastructure: InfrastructureData;
  breakdown: ScoreBreakdown;
  tier: TierResult;
}

function buildMockResponse(address: string, steepHill: boolean): ScoreApiResponse {
  const mockInfra: InfrastructureData = {
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

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');
  const address = searchParams.get('address')?.trim() ?? '';
  
  if (!latStr || !lngStr) {
    if (!address) {
      return Response.json(
        { error: '좌표(lat, lng) 또는 주소를 입력해 주세요.', code: 'MISSING_PARAMS' },
        { status: 400 },
      );
    }
  }

  const steepHill = searchParams.get('steepHill') === 'true';

  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    const mock = buildMockResponse(address, steepHill);
    return Response.json(
      {
        ...mock,
        _isMock: true,
        _warning:
          'KAKAO_REST_API_KEY is not set. This is a mock response for local development.',
      },
      { status: 200 },
    );
  }

  let geoLat: number;
  let geoLng: number;
  let finalAddress: string = address || '사용자 지정 좌표';
  
  if (latStr && lngStr) {
    geoLat = parseFloat(latStr);
    geoLng = parseFloat(lngStr);
  } else {
    let geo: Awaited<ReturnType<typeof geocodeAddress>>;
    try {
      geo = await geocodeAddress(address, apiKey);
    } catch (err) {
      console.error('[Score API Error]', err);
      const mock = buildMockResponse(address, steepHill);
      return Response.json(
        {
          ...mock,
          _isMock: true,
          _warning: '주소 변환 중 오류가 발생하여 모의 데이터를 반환합니다.',
        },
        { status: 200 },
      );
    }

    if (geo === null) {
      return Response.json(
        { error: '주소를 찾을 수 없습니다. 더 구체적인 주소를 입력해 주세요.', code: 'ADDRESS_NOT_FOUND' },
        { status: 404 },
      );
    }
    
    geoLat = geo.lat;
    geoLng = geo.lng;
    finalAddress = geo.roadAddress;
  }

  let infrastructure: InfrastructureData;
  try {
    infrastructure = await fetchInfrastructureData(geoLat, geoLng, apiKey);
  } catch (err) {
    console.error('[Score API Error]', err);
    const mock = buildMockResponse(finalAddress, steepHill);
    mock.coordinates = { lat: geoLat, lng: geoLng };
    return Response.json(
      {
        ...mock,
        _isMock: true,
        _warning: '인프라 데이터를 가져오는 중 오류가 발생하여 모의 데이터를 반환합니다.',
      },
      { status: 200 },
    );
  }

  const breakdown = calculateTotalScore(infrastructure, steepHill);
  const tier: TierResult = getTierResult(breakdown.totalScore, breakdown);

  const payload: ScoreApiResponse = {
    address: finalAddress,
    coordinates: { lat: geoLat, lng: geoLng },
    infrastructure,
    breakdown,
    tier,
  };

  return Response.json(payload, { status: 200 });
}
