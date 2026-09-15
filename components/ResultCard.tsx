'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { toPng } from 'html-to-image';
import confetti from 'canvas-confetti';
import { Download, Link, RotateCcw } from 'lucide-react';
import type { TierResult } from '@/types/score';
import { TOTAL_SCORE_MAX } from '@/lib/scoring';
import type { Coordinates } from '@/lib/coordinates';
import { buildShareUrl, buildResultShareData, shareResult } from '@/lib/sharing';
import { getScoreBand, trackEvent } from '@/lib/analytics';

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
  shareToken?: string;
  tier: TierResult;
  address: string;
  coordinates: Coordinates;
  isMock?: boolean;
  warning?: string;
  onReset: () => void;
}

export default function ResultCard({ tier, address, coordinates, shareToken, isMock, warning, onReset }: ResultCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const hasFired = useRef(false);
  const cfg = TIER_CONFIG[tier.tier];
  const [shareNotice, setShareNotice] = useState('');
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);

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
  }, [tier.score, tier.tier]);

  // Download as PNG
  const handleDownload = useCallback(async () => {
    if (!cardRef.current || saving) return;
    setSaving(true);
    setShareNotice('');
    try {
      // Export with system fonts so cross-origin font CSS cannot stall saving.
      const dataUrl = await toPng(cardRef.current, {
        quality: 0.95, pixelRatio: 3, skipFonts: true,
        style: { fontFamily: 'system-ui, sans-serif' },
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `자취생존기_${tier.tier}티어.png`;
      a.click();
      setShareNotice('PNG 카드를 만들었습니다. 브라우저의 다운로드 목록을 확인해 주세요.');
      const scoreBand = getScoreBand(tier.score);
      if (scoreBand) trackEvent('png_downloaded', { tier: tier.tier, score_band: scoreBand });
    } catch {
      setShareNotice('카드를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }, [saving, tier.score, tier.tier]);

  const handleShare = async () => {
    setShareNotice('');
    setSharing(true);
    try {
      const url = buildShareUrl(window.location.href, coordinates, shareToken);
      const scoreBand = getScoreBand(tier.score);
      if (scoreBand) trackEvent('share_clicked', { tier: tier.tier, score_band: scoreBand });
      const outcome = await shareResult(buildResultShareData(tier, url, isMock), navigator);
      if (outcome === 'copied') {
        if (scoreBand) trackEvent('share_completed', { method: 'clipboard', tier: tier.tier, score_band: scoreBand });
        setShareNotice('공유 문구와 링크를 복사했습니다. 원하는 대화에 붙여넣어 주세요.');
      } else if (outcome === 'shared') {
        if (scoreBand) trackEvent('share_completed', { method: 'native_share', tier: tier.tier, score_band: scoreBand });
      } else {
        trackEvent('share_cancelled', { method: 'native_share' });
      }
    } catch {
      setShareNotice('공유하지 못했습니다. 링크 복사를 이용하거나 다시 시도해 주세요.');
    } finally {
      setSharing(false);
    }
  };

  const handleCopyLink = async () => {
    setShareNotice('');
    try {
      const scoreBand = getScoreBand(tier.score);
      if (scoreBand) trackEvent('share_clicked', { tier: tier.tier, score_band: scoreBand });
      await navigator.clipboard.writeText(buildShareUrl(window.location.href, coordinates, shareToken));
      if (scoreBand) trackEvent('share_completed', { method: 'clipboard', tier: tier.tier, score_band: scoreBand });
      setShareNotice('링크를 복사했습니다.');
    } catch {
      setShareNotice('링크를 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.');
    }
  };

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
          disabled={saving}
          className="
            flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium
            bg-slate-800 border border-slate-700 text-slate-200
            hover:bg-slate-700 hover:border-slate-600 active:scale-95 transition-all
          "
        >
          <Download size={14} />
          {saving ? '카드 만드는 중...' : '카드 저장 (PNG)'}
        </button>
        <button
          id="share-result-btn"
          onClick={handleShare}
          disabled={sharing}
          className="
            flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium
            bg-slate-800 border border-slate-700 text-slate-200
            hover:bg-slate-700 hover:border-slate-600 active:scale-95 transition-all
          "
        >
          <Link size={14} />
          카카오톡·DM으로 공유
        </button>
      </div>

      <div className="text-center space-y-2">
        <button id="copy-link-btn" onClick={handleCopyLink} className="text-xs text-slate-300 underline">링크 복사</button>
        <p className="text-xs text-slate-400">공유 링크에는 선택한 지도 위치가 포함됩니다.</p>
        <p className="text-xs text-slate-400">서명된 링크도 암호화되지 않아 좌표를 확인할 수 있습니다.</p>
        <p role="status" aria-live="polite" className="text-xs text-slate-300">{shareNotice}</p>
      </div>

      {/* Reset */}
      <button
        id="reset-btn"
        onClick={() => {
          trackEvent('reanalyze_clicked', { previous_tier: tier.tier });
          onReset();
        }}
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

