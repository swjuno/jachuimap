'use client';

import { Search, MapPin, Navigation } from 'lucide-react';

interface SearchPanelProps {
  pinCoords: { lat: number; lng: number } | null;
  onSearch: (lat: number, lng: number) => void;
  onResetGps?: () => void;
  isLoading: boolean;
}

export default function SearchPanel({ pinCoords, onSearch, onResetGps, isLoading }: SearchPanelProps) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pinCoords || isLoading) return;
    onSearch(pinCoords.lat, pinCoords.lng);
  }

  return (
    <section className="glass-card flex flex-col gap-4 p-4 md:p-6 md:gap-5">
      {/* Header */}
      <div className="order-2 space-y-1 md:order-1">
        <h1 className="hidden text-2xl font-bold tracking-tight text-white md:block">
          🏠 자취 생존기 맵
        </h1>
        <p className="text-sm text-slate-400">
          <span className="md:hidden">지도를 움직여 원하는 위치를 맞춘 뒤 분석하세요.</span>
          <span className="hidden md:inline">지도에 핀을 꽂고 인프라 티어를 확인하세요. 항목별 직선거리 기준 · 최대 1.5km</span>
        </p>
      </div>

      {/* Coordinate Status */}
      <div className="order-3 space-y-3 md:order-2">
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
            className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-700 px-4 text-xs text-slate-400 transition-colors hover:text-white md:min-h-0 md:w-auto md:justify-start md:rounded-none md:border-0 md:px-0"
          >
            <Navigation size={12} />
            📍 내 GPS 위치로 이동
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="order-1 space-y-4 md:order-3">
        {/* Submit button */}
        <button
          type="submit"
          disabled={!pinCoords || isLoading}
          aria-label="현재 선택한 위치 분석하기"
          className="
            flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3
            bg-brand-600 hover:bg-brand-500 active:bg-brand-700
            text-white font-semibold text-sm
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-200 shadow-lg shadow-brand-900/30
          "
        >
          <Search size={16} />
          {isLoading ? '분석 중...' : '🎯 이 위치 분석하기'}
        </button>
      </form>
    </section>
  );
}
