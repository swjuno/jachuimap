'use client';

import { useState } from 'react';
import SearchPanel from '@/components/SearchPanel';
import ScanningRadar from '@/components/ScanningRadar';
import ResultCard from '@/components/ResultCard';
import ScoreCard from '@/components/ScoreCard';
import KakaoMap, { DebugMarker } from '@/components/KakaoMap';
import AdModal from '@/components/AdModal';
import DebugModal from '@/components/DebugModal';
import type { ScoreApiResponse } from '@/app/api/score/route';

type AppState = 'idle' | 'scanning' | 'ad' | 'result';

export default function Home() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [result, setResult] = useState<ScoreApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinCoords, setPinCoords] = useState<{lat: number; lng: number} | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showDebugMarkers, setShowDebugMarkers] = useState(false);

  async function handleSearch(lat: number, lng: number, steepHill: boolean) {
    setAppState('scanning');
    setError(null);

    try {
      const params = new URLSearchParams({ 
        lat: String(lat), 
        lng: String(lng), 
        steepHill: String(steepHill) 
      });
      
      const apiPromise = fetch(`/api/score?${params.toString()}`);
      const delayPromise = new Promise(resolve => setTimeout(resolve, 2800));
      
      const [res] = await Promise.all([apiPromise, delayPromise]);
      const data: unknown = await res.json();

      if (!res.ok) {
        const errData = data as { error?: string };
        throw new Error(errData.error ?? '오류가 발생했습니다.');
      }

      setResult(data as ScoreApiResponse);
      setAppState('ad');
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
      setAppState('idle');
    }
  }

  function handleReset() {
    setAppState('idle');
    setResult(null);
    setError(null);
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
          <KakaoMap
            lat={pinCoords?.lat}
            lng={pinCoords?.lng}
            label={result?.address ?? (pinCoords ? '지정된 위치' : undefined)}
            onPinChange={setPinCoords}
            debugMarkers={debugMarkers}
          />

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
            <KakaoMap
              lat={pinCoords?.lat}
              lng={pinCoords?.lng}
              label={result?.address ?? (pinCoords ? '지정된 위치' : undefined)}
              onPinChange={setPinCoords}
              debugMarkers={debugMarkers}
            />
          </div>

          {/* Error banner */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              ⚠️ {error}
            </div>
          )}

          {/* State machine */}
          {appState === 'idle' && (
            <SearchPanel 
              pinCoords={pinCoords}
              onSearch={handleSearch} 
              onResetGps={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => setPinCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
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
