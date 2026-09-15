'use client';

import { useState } from 'react';
import { Search, MapPin, Navigation } from 'lucide-react';

interface SearchPanelProps {
  pinCoords: { lat: number; lng: number } | null;
  onSearch: (lat: number, lng: number) => void;
  onResetGps?: () => void;
  isLoading: boolean;
  retrySeconds?: number;
}

export default function SearchPanel({ pinCoords, onSearch, onResetGps, isLoading, retrySeconds = 0 }: SearchPanelProps) {
  const [hillPreference, setHillPreference] = useState('unknown');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pinCoords || isLoading || retrySeconds > 0) return;
    onSearch(pinCoords.lat, pinCoords.lng);
  }

  return (
    <section className="glass-card flex flex-col gap-3 rounded-b-none rounded-t-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:gap-5 md:rounded-2xl md:p-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="hidden text-2xl font-bold tracking-tight text-white md:block">
          🏠 자취 생존기 맵
        </h1>
        <p className="text-sm text-slate-400">
          <span className="md:hidden">지도를 움직여 원하는 위치를 맞춘 뒤 분석하세요.</span>
          <span className="hidden md:inline">지도에 핀을 꽂고 인프라 티어를 확인하세요. 항목별 직선거리 기준 · 최대 1.5km</span>
        </p>
      </div>

      {/* Coordinate Status */}
      <div className="space-y-3">
        <div className="hidden items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 p-4 text-sm md:flex">
          <MapPin size={16} className="text-brand-400" />
          <span className="text-slate-300 font-medium">현재 지정 좌표:</span>
          {pinCoords ? (
            <span className="text-white font-mono bg-slate-900 px-2 py-0.5 rounded text-xs">
              {pinCoords.lat.toFixed(5)}, {pinCoords.lng.toFixed(5)}
            </span>
          ) : (
            <span className="text-slate-500 text-xs">위치를 선택해주세요</span>
          )}
        </div>
        
        {onResetGps && (
          <button
            type="button"
            onClick={onResetGps}
            disabled={isLoading}
            className="hidden min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-700 px-4 text-xs text-slate-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 md:flex md:min-h-0 md:w-auto md:justify-start md:rounded-none md:border-0 md:px-0"
          >
            <Navigation size={12} />
            📍 내 GPS 위치로 이동
          </button>
        )}
      </div>

      <label className="flex items-center justify-between gap-3 text-xs text-slate-300 md:hidden">
        <span className="shrink-0 font-medium">언덕 여부</span>
        <select
          value={hillPreference}
          onChange={(event) => setHillPreference(event.target.value)}
          aria-describedby="hill-preference-note"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <option value="unknown">모르겠어요</option>
          <option value="flat">평지에 가까워요</option>
          <option value="hilly">언덕이 있어요</option>
        </select>
        <span id="hill-preference-note" className="sr-only">참고용 선택이며 현재 점수에는 반영되지 않습니다.</span>
      </label>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Submit button */}
        <button
          type="submit"
          disabled={!pinCoords || isLoading || retrySeconds > 0}
          aria-label="현재 선택한 위치 분석하기"
          className="
            flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3
            bg-brand-600 hover:bg-brand-500 active:bg-brand-700
            text-white font-semibold text-sm
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-200 shadow-lg shadow-brand-900/30
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white
          "
        >
          <Search size={16} />
          {isLoading ? '분석 중...' : retrySeconds > 0 ? `${retrySeconds}초 후 분석 가능` : '🎯 이 위치 분석하기'}
        </button>
      </form>
      <p className="text-center text-[10px] text-slate-500 md:hidden">언덕 선택은 참고용이며 점수에는 반영되지 않습니다.</p>
    </section>
  );
}
