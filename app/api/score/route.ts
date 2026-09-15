/**
 * app/api/score/route.ts
 */

import { geocodeAddress, fetchInfrastructureData } from '@/lib/kakao';
import { calculateTotalScore, getTierResult } from '@/lib/scoring';
import { logScoreRequest, scoreRuntime } from '@/lib/score-runtime';
import { createShareToken } from '@/lib/share-token';
import type { InfrastructureData, ScoreBreakdown, TierResult } from '@/types/score';

export interface ScoreApiResponse {
  shareToken?: string;
  address: string;
  coordinates: { lat: number; lng: number };
  infrastructure: InfrastructureData;
  breakdown: ScoreBreakdown;
  tier: TierResult;
  _isMock?: boolean;
  _warning?: string;
}

function lookupError(code: 'GEOCODING_FAILED' | 'INFRASTRUCTURE_FETCH_FAILED'): Response {
  return Response.json(
    {
      error: '주변 시설 정보를 확인하지 못했습니다. 잠시 후 다시 분석해 주세요.',
      code,
      retryable: true,
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

function buildMockResponse(address: string): ScoreApiResponse {
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

  const breakdown = calculateTotalScore(mockInfra);
  const tier = getTierResult(breakdown.totalScore, breakdown);

  return {
    address,
    coordinates: { lat: 37.5563, lng: 126.9236 },
    infrastructure: mockInfra,
    breakdown,
    tier,
  };
}

async function analyze(request: Request, signal: AbortSignal): Promise<Response> {
  const { searchParams } = new URL(request.url);

  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');
  const address = searchParams.get('address')?.trim() ?? '';
  
  const hasCoordinates = latStr !== null || lngStr !== null;
  const lat = Number(latStr);
  const lng = Number(lngStr);

  // Validate before the mock branch or any upstream call. A partial pair must
  // not silently fall back to address lookup.
  if (hasCoordinates && (
    !latStr?.trim() || !lngStr?.trim() ||
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < -90 || lat > 90 || lng < -180 || lng > 180
  )) {
    return Response.json(
      {
        error: '유효한 좌표를 입력해 주세요. 위도는 -90~90, 경도는 -180~180 범위의 숫자여야 합니다.',
        code: 'INVALID_COORDINATES',
        retryable: false,
      },
      { status: 400 },
    );
  }

  if (!hasCoordinates && !address) {
    return Response.json(
      { error: '좌표(lat, lng) 또는 주소를 입력해 주세요.', code: 'MISSING_PARAMS', retryable: false },
      { status: 400 },
    );
  }

  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    const mock = buildMockResponse(address);
    const shareCoordinates = hasCoordinates ? { lat, lng } : mock.coordinates;
    return Response.json(
      {
        ...mock,
        shareToken: createShareToken({ ...shareCoordinates, score: mock.tier.score, tier: mock.tier.tier, title: mock.tier.title, isMock: true }),
        _isMock: true,
        _warning:
          '데모 데이터입니다. 실제 선택한 위치의 분석 결과가 아닙니다.',
      },
      { status: 200 },
    );
  }

  let geoLat: number;
  let geoLng: number;
  let finalAddress: string = address || '사용자 지정 좌표';
  
  if (hasCoordinates) {
    geoLat = lat;
    geoLng = lng;
  } else {
    let geo: Awaited<ReturnType<typeof geocodeAddress>>;
    try {
      geo = await geocodeAddress(address, apiKey, signal);
    } catch (err) {
      // Public error response is logged without upstream diagnostics.
      return lookupError('GEOCODING_FAILED');
    }

    if (geo === null) {
      return Response.json(
        { error: '주소를 찾을 수 없습니다. 더 구체적인 주소를 입력해 주세요.', code: 'ADDRESS_NOT_FOUND', retryable: false },
        { status: 404 },
      );
    }
    
    geoLat = geo.lat;
    geoLng = geo.lng;
    finalAddress = geo.roadAddress;
  }

  if (!Number.isFinite(geoLat) || !Number.isFinite(geoLng) ||
      geoLat < -90 || geoLat > 90 || geoLng < -180 || geoLng > 180) {
    return lookupError('GEOCODING_FAILED');
  }

  let infrastructure: InfrastructureData;
  try {
    const load = () => fetchInfrastructureData(geoLat, geoLng, apiKey, signal);
    infrastructure = process.env.NODE_ENV === 'production'
      ? await scoreRuntime.infrastructure(geoLat, geoLng, apiKey, load)
      : await load();
  } catch (err) {
    // Public error response is logged without upstream diagnostics.
    return lookupError('INFRASTRUCTURE_FETCH_FAILED');
  }

  const breakdown = calculateTotalScore(infrastructure);
  const tier: TierResult = getTierResult(breakdown.totalScore, breakdown);

  const payload: ScoreApiResponse = {
    shareToken: createShareToken({ lat: geoLat, lng: geoLng, score: tier.score, tier: tier.tier, title: tier.title, isMock: false }),
    address: finalAddress,
    coordinates: { lat: geoLat, lng: geoLng },
    infrastructure,
    breakdown,
    tier,
  };

  return Response.json(payload, { status: 200 });
}


export async function GET(request: Request): Promise<Response> {
  const started = Date.now();
  const production = process.env.NODE_ENV === 'production';
  const admission = production ? scoreRuntime.admit(request.headers, process.env.VERCEL === '1') : null;
  let response: Response;
  try {
    response = admission && !admission.release
      ? Response.json({ error: '요청이 많습니다. 잠시 후 같은 위치로 다시 시도해 주세요.',
        code: 'RATE_LIMITED', retryable: true, retryAfter: admission.retryAfter },
        { status: 429, headers: { 'Retry-After': String(admission.retryAfter) } })
      : await analyze(request, AbortSignal.timeout(10_000));
  } catch {
    response = lookupError('INFRASTRUCTURE_FETCH_FAILED');
  } finally {
    admission?.release?.();
  }
  response.headers.set('Cache-Control', 'private, no-store');
  if (production) {
    const body: { code?: string; _isMock?: boolean } = await response.clone().json();
    logScoreRequest(response.status, body.code ?? (body._isMock ? 'DEMO' : 'OK'), Date.now() - started);
  }
  return response;
}
