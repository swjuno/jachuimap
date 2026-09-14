'use client';

import { useRef, useEffect, useCallback } from 'react';
import { toPng } from 'html-to-image';
import confetti from 'canvas-confetti';
import { Download, Link, RotateCcw } from 'lucide-react';
import type { TierResult } from '@/types/score';
import { TOTAL_SCORE_MAX } from '@/lib/scoring';

// ── Tier visual config ──────────────────────────────────────────────────────
const TIER_CONFIG = {
  S: {
    badge: 'tier-s',
    glow: 'shadow-[0_0_40px_8px_rgba(245,158,11,0.3)]',
    label: 'S 티어',
    emoji: '👑',
    ring: 'ring-amber-500/40',
  },
  A: {
    badge: 'tier-a',
    glow: 'shadow-[0_0_40px_8px_rgba(139,92,246,0.3)]',
    label: 'A 티어',
    emoji: '🌟',
    ring: 'ring-violet-500/40',
  },
  B: {
    badge: 'tier-b',
    glow: 'shadow-[0_0_40px_8px_rgba(59,130,246,0.3)]',
    label: 'B 티어',
    emoji: '👍',
    ring: 'ring-blue-500/40',
  },
  C: {
    badge: 'tier-c',
    glow: 'shadow-[0_0_40px_8px_rgba(249,115,22,0.3)]',
    label: 'C 티어',
    emoji: '😅',
    ring: 'ring-orange-500/40',
  },
  F: {
    badge: 'tier-f',
    glow: 'shadow-[0_0_40px_8px_rgba(107,114,128,0.2)]',
    label: 'F 티어',
    emoji: '😭',
    ring: 'ring-gray-500/40',
  },
} as const;

interface ResultCardProps {
  tier: TierResult;
  address: string;
  isMock?: boolean;
  warning?: string;
  onReset: () => void;
}

export default function ResultCard({ tier, address, isMock, warning, onReset }: ResultCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const hasFired = useRef(false);
  const cfg = TIER_CONFIG[tier.tier];

  // Fire confetti once on mount
  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    const isTierGood = tier.tier === 'S' || tier.tier === 'A';

    confetti({
      particleCount: isTierGood ? 160 : 60,
      spread: isTierGood ? 100 : 60,
      origin: { y: 0.55 },
      colors: isTierGood
        ? ['#f59e0b', '#8b5cf6', '#22c55e', '#f43f5e']
        : ['#64748b', '#94a3b8'],
    });
  }, [tier.tier]);

  // Download as PNG
  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, { quality: 0.95, pixelRatio: 3 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `자취생존기_${tier.tier}티어.png`;
      a.click();
    } catch (err) {
      console.error('이미지 저장 실패:', err);
    }
  }, [tier.tier]);

  // Copy share URL
  const handleCopyLink = useCallback(async () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('steepHill'); // Strip the retired option from legacy URLs.
    url.searchParams.set('address', address);
    try {
      await navigator.clipboard.writeText(url.toString());
      // Simple toast via alert (no external dep needed)
      const btn = document.getElementById('copy-link-btn');
      if (btn) {
        const original = btn.textContent;
        btn.textContent = '✅ 복사 완료!';
        setTimeout(() => { if (btn) btn.textContent = original; }, 2000);
      }
    } catch {
      /* clipboard unavailable in non-secure context */
    }
  }, [address]);

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Capturable card — 9:16-friendly proportions */}
      <div
        ref={cardRef}
        className={`
          glass-card p-6 ring-2 ${cfg.ring} ${cfg.glow}
          flex flex-col items-center text-center gap-4
        `}
        style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 100%)' }}
      >
        {isMock && (
          <div role="status" className="text-sm text-amber-200">
            <strong>데모 데이터</strong>
            <p>{warning ?? '실제 선택한 위치의 분석 결과가 아닙니다.'}</p>
          </div>
        )}
        {/* Tier badge */}
        <div className={`
          w-24 h-24 rounded-2xl ${cfg.badge} flex flex-col items-center justify-center
          text-white font-black shadow-2xl
        `}>
          <span className="text-3xl leading-none">{cfg.emoji}</span>
          <span className="text-sm mt-0.5 font-bold">{cfg.label}</span>
        </div>

        {/* Score */}
        <div>
          <div className="text-5xl font-black text-white tabular-nums">
            {tier.score}
            <span className="text-xl font-medium text-slate-400"> / {TOTAL_SCORE_MAX}점</span>
          </div>
        </div>

        {/* Title & quote */}
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-white">{tier.title}</h2>
          <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
            "{tier.quote}"
          </p>
        </div>

        {/* Address */}
        <div className="w-full border-t border-slate-700/60 pt-3 mt-1">
          <p className="text-xs text-slate-500">
            📍 {address}
          </p>
          <p className="text-[10px] text-slate-600 mt-0.5">
            자취 생존기 맵 · 항목별 직선거리 기준 · 최대 1.5km
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          id="download-png-btn"
          onClick={handleDownload}
          className="
            flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium
            bg-slate-800 border border-slate-700 text-slate-200
            hover:bg-slate-700 hover:border-slate-600 active:scale-95 transition-all
          "
        >
          <Download size={14} />
          카드 저장 (PNG)
        </button>
        <button
          id="copy-link-btn"
          onClick={handleCopyLink}
          className="
            flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium
            bg-slate-800 border border-slate-700 text-slate-200
            hover:bg-slate-700 hover:border-slate-600 active:scale-95 transition-all
          "
        >
          <Link size={14} />
          링크 복사하기
        </button>
      </div>

      {/* Reset */}
      <button
        id="reset-btn"
        onClick={onReset}
        className="
          w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm
          text-slate-400 hover:text-white border border-dashed border-slate-700
          hover:border-slate-500 transition-all
        "
      >
        <RotateCcw size={13} />
        다른 주소 분석하기
      </button>
    </div>
  );
}
