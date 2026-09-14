'use client';

import { useEffect, useState } from 'react';

const SCAN_STEPS = [
  '🚇 대중교통 및 지하철 접근성 스캔 중...',
  '🏪 편의점 브랜드별(GS25, CU, 세븐일레븐) 탐색 중...',
  '🛒 생활 마트 및 다이소 인프라 집계 중...',
  '🍿 백화점 및 라이프스타일 지표 최종 계산 중...',
] as const;

const STEP_DELAY_MS = 700;

export default function ScanningRadar() {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (stepIndex >= SCAN_STEPS.length - 1) return;
    const timer = setTimeout(() => setStepIndex((i) => i + 1), STEP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stepIndex]);

  return (
    <div className="glass-card p-8 flex flex-col items-center gap-6 animate-fade-up">
      {/* Radar rings */}
      <div className="relative flex items-center justify-center w-40 h-40">
        {/* Static center dot */}
        <div className="absolute z-10 w-4 h-4 rounded-full bg-brand-400 shadow-[0_0_12px_4px_rgba(74,222,128,0.5)]" />
        {/* Pulsing rings */}
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className={`absolute rounded-full border border-brand-500/50 radar-ring radar-ring-${n}`}
            style={{ width: '72px', height: '72px' }}
          />
        ))}
        {/* Static circle guides */}
        <div className="absolute w-24 h-24 rounded-full border border-slate-700/60" />
        <div className="absolute w-36 h-36 rounded-full border border-slate-700/40" />
      </div>

      {/* Status text */}
      <div className="text-center space-y-1 h-12">
        <p className="text-sm font-medium text-brand-300 animate-fade-up" key={stepIndex}>
          {SCAN_STEPS[stepIndex]}
        </p>
        <p className="text-xs text-slate-500 mt-1">최대 반경 1.5km 다중 인프라 스캔 중</p>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5 mt-2">
        {SCAN_STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i <= stepIndex
                ? 'bg-brand-400 w-6'
                : 'bg-slate-700 w-1.5'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
