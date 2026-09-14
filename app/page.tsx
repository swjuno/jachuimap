'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SearchPanel from '@/components/SearchPanel';
import ScanningRadar from '@/components/ScanningRadar';
import ResultCard from '@/components/ResultCard';
import ScoreCard from '@/components/ScoreCard';
import KakaoMap, { DebugMarker } from '@/components/KakaoMap';
import AdModal from '@/components/AdModal';
import DebugModal from '@/components/DebugModal';
import type { ScoreApiResponse } from '@/app/api/score/route';
import { coordinatesEqual, type Coordinates } from '@/lib/coordinates';
import { restoreSharedLocationOnce } from '@/lib/sharing';
import { getScoreBand, toPublicErrorCode, trackAnalysisCompletedOnce, trackEvent, type AnalyticsSource } from '@/lib/analytics';

type AppState = 'idle' | 'scanning' | 'ad' | 'result';

export default function Home() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [result, setResult] = useState<ScoreApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinCoords, setPinCoords] = useState<{lat: number; lng: number} | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showDebugMarkers, setShowDebugMarkers] = useState(false);
  const [entryReady, setEntryReady] = useState(false);
  const entryConsumed = useRef(false);
  const [lastRequest, setLastRequest] = useState<Coordinates | null>(null);
  const requestSequence = useRef(0);
  const completedRequests = useRef(new Set<string>());
  const failedRequests = useRef(new Set<number>());

  const handlePinChange = useCallback((coords: Coordinates) => {
    setPinCoords((previous) => {
      if (previous && coordinatesEqual(previous, coords)) return previous;
      return coords;
    });
  }, []);

  const handleSearch = useCallback(async (lat: number, lng: number, source: AnalyticsSource = 'manual') => {
    const requestId = ++requestSequence.current;
    trackEvent('analysis_started', { source });
    setLastRequest({ lat, lng });
    setPinCoords({ lat, lng });
    setResult(null);
    setShowDebug(false);
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
      setAppState('ad');
    } catch (err) {
      if (!failedRequests.current.has(requestId)) {
        failedRequests.current.add(requestId);
        trackEvent('analysis_failed', { source, error_code: 'UNKNOWN_ERROR', retryable: true });
      }
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
      setAppState('idle');
    }
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
    setAppState('idle');
    setResult(null);
    setError(null);
    setLastRequest(null);
  }

  const isLoading = appState === 'scanning';

  const debugMarkers: DebugMarker[] = [];
  if (showDebugMarkers && result?.infrastructure?.rawDebugData) {
    const rd = result.infrastructure.rawDebugData;
    const addMarkers = (raw: any[], dedup: any[], prefix: string) => {
      raw.forEach((doc, idx) => {
        debugMarkers.push({
          id: doc.id || `${prefix}-${idx}`,
          lat: Number(doc.y),
          lng: Number(doc.x),
          label: doc.place_name,
          isAccepted: dedup.some(d => d.id === doc.id)
        });
      });
    };
    addMarkers(rd.daisoRaw, rd.daisoDedup, 'daiso');
    addMarkers(rd.martRaw, rd.martDedup, 'mart');
    addMarkers(rd.cvsRaw, rd.cvsDedup, 'cvs');
  }

  return (
    <main className="min-h-dvh bg-[var(--color-surface)] px-4 py-8 md:py-12">
      {/* ── Google Fonts ──────────────────────────────────────────────── */}
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=Noto+Sans+KR:wght@400;500;700;900&display=swap"
        rel="stylesheet"
      />

      {/* ── Page wrapper — mobile: single col | desktop: 2 col ──────── */}
      <div className="
        mx-auto w-full max-w-md
        md:max-w-5xl md:grid md:grid-cols-2 md:gap-8 md:items-start
      ">
        {/* ── LEFT column: Map (desktop sticky) ─────────────────────── */}
        <div className="hidden md:block md:sticky md:top-8 space-y-4">
          {entryReady && <KakaoMap
            lat={pinCoords?.lat}
            lng={pinCoords?.lng}
            label={result?.address ?? (pinCoords ? '지정된 위치' : undefined)}
              onPinChange={handlePinChange}
            debugMarkers={debugMarkers}
          />}

          {/* Desktop: show breakdown here when result is ready */}
          {appState === 'result' && result && (
            <ScoreCard
              breakdown={result.breakdown}
              infra={result.infrastructure}
            />
          )}

          {/* Ad/sponsor slot */}
          {appState === 'result' && (
            <div className="glass-card p-4 flex items-center gap-3 text-sm">
              <span className="text-xl">🏦</span>
              <div>
                <p className="font-semibold text-slate-200">전세 대출 비교</p>
                <p className="text-xs text-slate-500">카카오뱅크 · 우리은행 · 국민은행</p>
              </div>
              <span className="ml-auto text-xs text-slate-600 border border-slate-700 px-2 py-0.5 rounded">AD</span>
            </div>
          )}
        </div>

        {/* ── RIGHT column: Search / Scanning / Result ───────────────── */}
        <div className="space-y-4">
          {/* Map visible on mobile too (above search) */}
          <div className="md:hidden">
            {entryReady && <KakaoMap
              lat={pinCoords?.lat}
              lng={pinCoords?.lng}
              label={result?.address ?? (pinCoords ? '지정된 위치' : undefined)}
            onPinChange={handlePinChange}
              debugMarkers={debugMarkers}
            />}
          </div>

          {/* Error banner */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              ⚠️ {error}
              {lastRequest && (
                <button type="button" disabled={isLoading}
                  onClick={() => void handleSearch(lastRequest.lat, lastRequest.lng, 'manual')}
                  className="ml-3 underline disabled:opacity-50">
                  같은 위치로 다시 분석
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
            />
          )}

          {appState === 'scanning' && <ScanningRadar />}

          {appState === 'result' && result && (
            <>
              <ResultCard
                tier={result.tier}
                address={result.address}
                coordinates={lastRequest ?? result.coordinates}
                isMock={result._isMock}
                warning={result._warning}
                onReset={handleReset}
              />
              {/* Mobile breakdown below result card */}
              <div className="md:hidden">
                <ScoreCard
                  breakdown={result.breakdown}
                  infra={result.infrastructure}
                />
              </div>
              {/* Mobile ad slot */}
              <div className="md:hidden glass-card p-4 flex items-center gap-3 text-sm">
                <span className="text-xl">🚚</span>
                <div>
                  <p className="font-semibold text-slate-200">이삿짐 견적 비교</p>
                  <p className="text-xs text-slate-500">짐카 · 사다리차 포함 최저가</p>
                </div>
                <span className="ml-auto text-xs text-slate-600 border border-slate-700 px-2 py-0.5 rounded">AD</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="mt-12 text-center text-xs text-slate-700 pb-12">
        자취 생존기 맵 · 카카오 로컬 API 기반 · 최대 반경 1.5km 다중 스캔 적용
        <span className="mx-2">·</span>
        <a href="/privacy" className="underline hover:text-slate-400">개인정보 처리방침</a>
      </footer>

      {/* ── Ad Modal ──────────────────────────────────────────────────── */}
      {appState === 'ad' && (
        <AdModal onClose={() => setAppState('result')} />
      )}

      {/* ── Debug Tools ────────────────────────────────────────────────── */}
      {result?.infrastructure?.rawDebugData && (
        <>
          <button
            onClick={() => setShowDebug(true)}
            className="fixed bottom-4 left-4 z-40 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 px-3 py-2 rounded-full border border-slate-700 shadow-xl text-xs font-bold transition-all flex items-center gap-2"
          >
            <span>🛠️ Raw 데이터 디버그</span>
          </button>
          
          {showDebug && (
            <DebugModal 
              onClose={() => setShowDebug(false)} 
              debugData={result.infrastructure.rawDebugData} 
              showMarkers={showDebugMarkers}
              onToggleMarkers={() => setShowDebugMarkers(!showDebugMarkers)}
            />
          )}
        </>
      )}
    </main>
  );
}

