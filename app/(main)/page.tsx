'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SearchPanel from '@/components/SearchPanel';
import ScanningRadar from '@/components/ScanningRadar';
import ResultCard from '@/components/ResultCard';
import ScoreCard from '@/components/ScoreCard';
import KakaoMap from '@/components/KakaoMap';
import type { ScoreApiResponse } from '@/app/api/score/route';
import { coordinatesEqual, type Coordinates } from '@/lib/coordinates';
import { restoreSharedLocationOnce } from '@/lib/sharing';
import { getScoreBand, toPublicErrorCode, trackAnalysisCompletedOnce, trackEvent, type AnalyticsSource } from '@/lib/analytics';
import {
  deriveMobileMapScreen,
  isMobileMapScreen,
  shouldDisplayMap,
  type AnalysisState,
  type MobileResultSurface,
} from '@/lib/mobile-map-flow';

export default function Home() {
  const [appState, setAppState] = useState<AnalysisState>('idle');
  const [mobileResultSurface, setMobileResultSurface] = useState<MobileResultSurface>('result');
  const [result, setResult] = useState<ScoreApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinCoords, setPinCoords] = useState<{lat: number; lng: number} | null>(null);
  const requestInFlight = useRef(false);
  const [retryAt, setRetryAt] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [entryReady, setEntryReady] = useState(false);
  const entryConsumed = useRef(false);
  const [lastRequest, setLastRequest] = useState<Coordinates | null>(null);
  const requestSequence = useRef(0);
  const completedRequests = useRef(new Set<string>());
  const failedRequests = useRef(new Set<number>());
  const mapHeadingRef = useRef<HTMLHeadingElement>(null);
  const facilityHeadingRef = useRef<HTMLHeadingElement>(null);
  const scanningRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  const handlePinChange = useCallback((coords: Coordinates) => {
    setPinCoords((previous) => {
      if (previous && coordinatesEqual(previous, coords)) return previous;
      return coords;
    });
  }, []);

  const handleSearch = useCallback(async (lat: number, lng: number, source: AnalyticsSource = 'manual') => {
    if (requestInFlight.current || Date.now() < retryAt) return;
    requestInFlight.current = true;
    const requestId = ++requestSequence.current;
    trackEvent('analysis_started', { source });
    setMobileResultSurface('result');
    setLastRequest({ lat, lng });
    setPinCoords({ lat, lng });
    setResult(null);
    setAppState('scanning');
    setError(null);

    try {
      const params = new URLSearchParams({ 
        lat: String(lat), 
        lng: String(lng)
      });
      
      const apiPromise = fetch(`/api/score?${params.toString()}`);
      const delayPromise = new Promise(resolve => setTimeout(resolve, 2800));
      
      const [res] = await Promise.all([apiPromise, delayPromise]);
      const data: unknown = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          const seconds = Number(res.headers.get('Retry-After'));
          setRetryAt(Date.now() + (Number.isFinite(seconds) ? Math.min(60, Math.max(1, seconds)) : 60) * 1000);
        }
        const errData = data && typeof data === 'object' ? data as { error?: unknown; code?: unknown; retryable?: unknown } : {};
        const errorCode = toPublicErrorCode(errData.code);
        const retryable = errData.retryable === true;
        if (!failedRequests.current.has(requestId)) {
          failedRequests.current.add(requestId);
          trackEvent('analysis_failed', { source, error_code: errorCode, retryable });
        }
        throw new Error(typeof errData.error === 'string' ? errData.error : '오류가 발생했습니다.');
      }

      const responseData = data as ScoreApiResponse;
      const band = getScoreBand(responseData.tier.score);
      if (band) {
        trackAnalysisCompletedOnce(String(requestId), completedRequests.current, {
          source,
          tier: responseData.tier.tier,
          score_band: band,
          is_mock: responseData._isMock === true,
        });
      }
      setResult(responseData);
      setAppState('result');
    } catch (err) {
      if (!failedRequests.current.has(requestId)) {
        failedRequests.current.add(requestId);
        trackEvent('analysis_failed', { source, error_code: 'UNKNOWN_ERROR', retryable: true });
      }
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
      setAppState('idle');
    } finally {
      requestInFlight.current = false;
    }
  }, [retryAt]);

  useEffect(() => {
    if (!retryAt) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setRetrySeconds(remaining);
      if (remaining === 0) setRetryAt(0);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 768px)');
    const update = () => {
      setIsMobile(query.matches);
      if (!query.matches) setMobileResultSurface('result');
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const shared = restoreSharedLocationOnce(entryConsumed, () => window.location.search, (coords) => {
      void handleSearch(coords.lat, coords.lng, 'shared_link');
    });
    if (shared.kind === 'invalid') {
      setError('공유 링크의 좌표가 올바르지 않습니다. 지도에서 위치를 선택해 주세요.');
    }
    if (shared.kind === 'valid') trackEvent('shared_link_opened', {});
    // Mount maps only after URL restoration, preventing initial GPS from replacing shared coordinates.
    setEntryReady(true);
  }, [handleSearch]);

  function handleReset() {
    setMobileResultSurface('result');
    setAppState('idle');
    setResult(null);
    setError(null);
    setLastRequest(null);
  }

  const isLoading = appState === 'scanning';
  const mapCoordinates = appState === 'result' && result ? result.coordinates : pinCoords;
  const mobileScreen = deriveMobileMapScreen(appState, mobileResultSurface, Boolean(result));
  const mobileShowsMap = isMobileMapScreen(mobileScreen);
  const mapVisible = shouldDisplayMap(mobileScreen, isMobile);

  useEffect(() => {
    if (!isMobile) return;
    const target = mobileScreen === 'select-map'
      ? mapHeadingRef.current
      : mobileScreen === 'scanning'
        ? scanningRef.current
        : mobileScreen === 'facility-map'
          ? facilityHeadingRef.current
          : resultRef.current;
    if (!target) return;
    const frame = window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [isMobile, mobileScreen]);

  return (
    <main className={`${mobileShowsMap ? 'h-dvh overflow-hidden p-0' : 'min-h-dvh px-4 py-4'} bg-[var(--color-surface)] md:min-h-dvh md:h-auto md:overflow-visible md:px-4 md:py-12`}>
      {/* ── Google Fonts ──────────────────────────────────────────────── */}
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=Noto+Sans+KR:wght@400;500;700;900&display=swap"
        rel="stylesheet"
      />

      {/* ── Page wrapper — mobile: single col | desktop: 2 col ──────── */}
      <div className={`${mobileShowsMap ? 'grid h-full max-w-none grid-rows-[minmax(0,1fr)_auto]' : 'flex min-h-full max-w-md flex-col'} mx-auto w-full md:max-[1179px]:flex md:max-[1179px]:h-auto md:max-[1179px]:max-w-md md:max-[1179px]:flex-col min-[1180px]:max-w-6xl min-[1180px]:grid min-[1180px]:grid-cols-2 min-[1180px]:gap-8 min-[1180px]:items-start`}>
        {/* KakaoMap remains mounted across every mobile surface. */}
        <div className={`${mobileScreen === 'result' ? 'hidden md:block' : 'relative min-h-0'} min-[1180px]:col-start-1 min-[1180px]:row-start-1 min-[1180px]:sticky min-[1180px]:top-8 min-[1180px]:block min-[1180px]:space-y-4`}>
          {mobileScreen === 'select-map' && (
            <h1 ref={mapHeadingRef} tabIndex={-1} className="sr-only md:hidden">분석할 위치를 지도에서 선택</h1>
          )}
          {mobileScreen === 'facility-map' && (
            <>
              <h1 ref={facilityHeadingRef} tabIndex={-1} className="sr-only md:hidden">점수 근거 시설 지도</h1>
              <button
                type="button"
                onClick={() => setMobileResultSurface('result')}
                aria-label="분석 결과로 돌아가기"
                className="absolute left-3 top-[calc(.75rem+env(safe-area-inset-top))] z-30 min-h-11 rounded-xl border border-slate-600 bg-slate-950/90 px-4 text-sm font-semibold text-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 md:hidden"
              >
                ← 결과로 돌아가기
              </button>
            </>
          )}
          {entryReady && <KakaoMap
            lat={mapCoordinates?.lat}
            lng={mapCoordinates?.lng}
            compact={appState === 'result'}
            facilityMarkers={appState === 'result' && !result?._isMock ? result?.infrastructure.facilityMarkers : undefined}
            lockAnalysisCoordinates={appState === 'result' && Boolean(result)}
            label={result?.address ?? (pinCoords ? '지정된 위치' : undefined)}
            onPinChange={handlePinChange}
            visible={mapVisible}
            mobileFullScreen={isMobile && mobileShowsMap}
            viewMode={mobileScreen === 'facility-map' ? 'facility' : 'select'}
          />}
          {mobileScreen === 'scanning' && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm md:hidden">
              <div ref={scanningRef} tabIndex={-1} className="w-full outline-none">
                <h1 className="sr-only">선택 위치 분석 중</h1>
                <ScanningRadar />
              </div>
            </div>
          )}
          {appState === 'result' && result && (
            <p className="hidden text-xs text-slate-400 md:block">
              {result._isMock ? '데모 데이터에는 실제 시설 마커를 표시하지 않습니다.' :
                '초록 핀은 선택 위치, 원형 아이콘은 시설입니다. 기본은 점수 근거 시설만 표시하며, 전체 시설 보기에서도 최대 30곳입니다. 직선거리이며 개별 시설의 추가 점수를 뜻하지 않습니다.'}
            </p>
          )}

          <div className="hidden min-[1180px]:block">
            {appState === 'result' && result && (
              <ScoreCard breakdown={result.breakdown} infra={result.infrastructure} />
            )}
          </div>
        </div>

        {/* ── RIGHT column: Search / Scanning / Result ───────────────── */}
        <div className={`${mobileShowsMap ? 'relative z-50 mx-auto min-h-0 w-full max-w-md' : ''} min-[1180px]:col-start-2 min-[1180px]:row-start-1 min-[1180px]:space-y-4`}>

          {/* Error banner */}
          {error && (
            <div ref={errorRef} tabIndex={-1} role="alert" className="mx-3 mb-2 rounded-xl border border-red-500/30 bg-red-950/95 px-4 py-3 text-sm text-red-300 md:mx-0 md:bg-red-950/40">
              ⚠️ {error}
              {lastRequest && (
                <button type="button" disabled={isLoading || retrySeconds > 0}
                  onClick={() => void handleSearch(lastRequest.lat, lastRequest.lng, 'manual')}
                  className="ml-3 underline disabled:opacity-50">
                  {retrySeconds > 0 ? `${retrySeconds}초 후 재시도` : '같은 위치로 다시 분석'}
                </button>
              )}
            </div>
          )}

          {/* State machine */}
          {entryReady && appState === 'idle' && (
            <SearchPanel 
              pinCoords={pinCoords}
              onSearch={handleSearch} 
              onResetGps={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => handlePinChange({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                    () => alert('GPS 위치를 가져올 수 없습니다.')
                  );
                }
              }}
              isLoading={isLoading}
              retrySeconds={retrySeconds}
            />
          )}

          {appState === 'scanning' && (
            <div tabIndex={-1} aria-live="polite" className="hidden scroll-mt-6 outline-none md:block">
              <ScanningRadar />
            </div>
          )}

          {appState === 'result' && result && (
            <div ref={resultRef} tabIndex={-1} aria-live="polite" className={`${mobileScreen === 'facility-map' ? 'hidden md:block' : ''} scroll-mt-6 space-y-4 outline-none`}>
              <ResultCard
                tier={result.tier}
                shareToken={result.shareToken}
                address={result.address}
                coordinates={lastRequest ?? result.coordinates}
                breakdown={result.breakdown}
                infra={result.infrastructure}
                isMock={result._isMock}
                warning={result._warning}
                onReset={handleReset}
                onShowFacilities={() => setMobileResultSurface('facility-map')}
              />
              {/* Mobile breakdown below result card */}
              <div className="min-[1180px]:hidden">
                <ScoreCard
                  breakdown={result.breakdown}
                  infra={result.infrastructure}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className={`${mobileShowsMap ? 'hidden md:block' : ''} mt-12 pb-12 text-center text-xs text-slate-700`}>
        자취 생존기 맵 · 카카오 로컬 API 기반 · 최대 반경 1.5km 다중 스캔 적용
        <span className="mx-2">·</span>
        <a href="/scoring" className="underline hover:text-slate-400">점수 기준과 데이터 한계</a>
        <span className="mx-2">·</span>
        <a href="/privacy" className="underline hover:text-slate-400">개인정보 처리방침</a>
      </footer>

    </main>
  );
}
