'use client';

import { useState } from 'react';
import { Search, MapPin, AlertTriangle, Navigation } from 'lucide-react';

interface SearchPanelProps {
  pinCoords: { lat: number; lng: number } | null;
  onSearch: (lat: number, lng: number, steepHill: boolean) => void;
  onResetGps?: () => void;
  isLoading: boolean;
}

export default function SearchPanel({ pinCoords, onSearch, onResetGps, isLoading }: SearchPanelProps) {
  const [steepHill, setSteepHill] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pinCoords || isLoading) return;
    onSearch(pinCoords.lat, pinCoords.lng, steepHill);
  }

  return (
    <section className="glass-card p-6 space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          🏠 자취 생존기 맵
        </h1>
        <p className="text-sm text-slate-400">
          지도에 핀을 꽂고 500m 반경 인프라 티어를 확인하세요.
        </p>
      </div>

      {/* Coordinate Status */}
      <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm">
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
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <Navigation size={12} />
            📍 내 GPS 위치로 이동
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Steep-hill toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none group">
          <div className="relative">
            <input
              type="checkbox"
              checked={steepHill}
              onChange={(e) => setSteepHill(e.target.checked)}
              disabled={isLoading}
              className="sr-only peer"
            />
            <div className="
              w-11 h-6 rounded-full bg-slate-700 border border-slate-600
              peer-checked:bg-brand-600 peer-checked:border-brand-500
              transition-colors relative
            ">
              <div className="
                absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow
                transition-transform peer-checked:translate-x-5
                group-has-[:checked]:translate-x-5
              " />
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-sm text-slate-300">
            <AlertTriangle size={14} className="text-amber-400" />
            가파른 언덕 있음
            <span className="text-xs text-slate-500">(-10점 페널티)</span>
          </span>
        </label>

        {/* Submit button */}
        <button
          type="submit"
          disabled={!pinCoords || isLoading}
          className="
            w-full flex items-center justify-center gap-2 rounded-xl py-3 px-4
            bg-brand-600 hover:bg-brand-500 active:bg-brand-700
            text-white font-semibold text-sm
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-200 shadow-lg shadow-brand-900/30
          "
        >
          <Search size={16} />
          {isLoading ? '분석 중...' : '🎯 이 위치(반경 500m) 분석하기'}
        </button>
      </form>
    </section>
  );
}
