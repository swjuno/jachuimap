'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { toPng } from 'html-to-image';
import confetti from 'canvas-confetti';
import { Download, Link, RotateCcw } from 'lucide-react';
import type { TierResult } from '@/types/score';
import type { InfrastructureData, ScoreBreakdown } from '@/types/score';
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
  breakdown: ScoreBreakdown;
  infra: InfrastructureData;
  isMock?: boolean;
  warning?: string;
  onReset: () => void;
}

export default function ResultCard({ tier, address, coordinates, shareToken, breakdown, infra, isMock, warning, onReset }: ResultCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const hasFired = useRef(false);
  const cfg = TIER_CONFIG[tier.tier];
  const [shareNotice, setShareNotice] = useState('');
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const brandCount = [infra.cvs.gs25, infra.cvs.cu, infra.cvs.seven, infra.cvs.emart24].filter((count) => count > 0).length;
  const totalCvs = infra.cvs.gs25 + infra.cvs.cu + infra.cvs.seven + infra.cvs.emart24;
  const formatDistance = (distance: number | null) => distance === null ? null : `${distance.toLocaleString('ko-KR')}m`;
  const strengths = [
    infra.subway.stationName && formatDistance(infra.subway.distanceMetres)
      ? `${infra.subway.stationName}역 ${formatDistance(infra.subway.distanceMetres)}` : null,
    totalCvs > 0 && formatDistance(infra.cvs.nearestDist)
      ? `편의점 ${brandCount}개 브랜드 · 가장 가까운 곳 ${formatDistance(infra.cvs.nearestDist)}` : null,
    formatDistance(infra.mart.nearestDist)
      ? `마트·다이소 최단 ${formatDistance(infra.mart.nearestDist)}` : null,
    infra.cinema.name && formatDistance(infra.cinema.nearestDist)
      ? `영화관 ${infra.cinema.name} · ${formatDistance(infra.cinema.nearestDist)}` : null,
    infra.cafe.hasStarbucks && formatDistance(infra.cafe.nearestDist)
      ? `스타벅스 포함 카페 ${formatDistance(infra.cafe.nearestDist)}` : null,
  ].filter((item): item is string => item !== null).slice(0, 3);
  const weakness = (() => {
    switch (breakdown.weakestCategory) {
      case 'subway': return infra.subway.distanceMetres === null ? '1km 안에 확인된 역이 없어 교통 점수가 낮습니다.' : `가장 가까운 역이 ${formatDistance(infra.subway.distanceMetres)}라 교통 점수가 낮습니다.`;
      case 'convenience': return totalCvs === 0 ? '300m 안에 확인된 편의점이 없어 생활 점수가 낮습니다.' : '편의점 거리와 브랜드 수가 부족해 생활 점수가 낮습니다.';
      case 'martDaiso': return '마트와 다이소 접근성이 낮아 장보기 점수가 낮습니다.';
      case 'deptStore': return '1.5km 안에 가까운 백화점이 없어 주말 생활 점수가 낮습니다.';
      case 'cinema': return '1.2km 안에 가까운 영화관이 없어 문화생활 점수가 낮습니다.';
      case 'cafe': return '카페 접근성이 낮아 여가 점수가 낮습니다.';
      case 'care': return '올리브영·헬스장 접근성이 낮아 생활 관리 점수가 낮습니다.';
      case 'medical': return infra.medical.nearestDist === null ? '500m 안에 확인된 병원·약국이 없어 의료 점수가 낮습니다.' : `병원·약국이 ${formatDistance(infra.medical.nearestDist)}라 의료 점수가 낮습니다.`;
      default: return '모든 항목이 고르게 충족된 동네입니다.';
    }
  })();

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
          {address === '사용자 지정 좌표' ? (
            <details className="text-left text-xs text-slate-400">
              <summary className="cursor-pointer list-none text-center text-slate-400 hover:text-slate-200">분석 위치 정보</summary>
              <p className="mt-2 text-center text-slate-500">📍 지도에서 선택한 위치</p>
            </details>
          ) : <p className="text-xs text-slate-500">📍 {address}</p>}
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
            flex min-h-11 items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium
            bg-slate-800 border border-slate-700 text-slate-200
            hover:bg-slate-700 hover:border-slate-600 active:scale-95 transition-all
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400
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
            flex min-h-11 items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium
            bg-slate-800 border border-slate-700 text-slate-200
            hover:bg-slate-700 hover:border-slate-600 active:scale-95 transition-all
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400
          "
        >
          <Link size={14} />
          카카오톡·DM으로 공유
        </button>
      </div>

      <div className="text-center space-y-2">
        <button id="copy-link-btn" onClick={handleCopyLink} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-4 text-xs font-medium text-slate-200 underline-offset-2 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">링크 복사</button>
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
          w-full min-h-11 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm
          text-slate-400 hover:text-white border border-dashed border-slate-700
          hover:border-slate-500 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400
        "
      >
        <RotateCcw size={13} />
        다른 주소 분석하기
      </button>

      <section className="hidden min-[1180px]:block rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 space-y-4" aria-label="분석 요약">
        <div>
          <h3 className="text-sm font-bold text-slate-200">이 동네의 강점</h3>
          {strengths.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
              {strengths.map((item) => <li key={item}>✓ {item}</li>)}
            </ul>
          ) : <p className="mt-2 text-sm text-slate-400">높은 점수를 받은 핵심 시설이 확인되지 않았습니다.</p>}
        </div>
        <div className="border-t border-slate-700/60 pt-3">
          <h3 className="text-sm font-bold text-amber-200">가장 아쉬운 항목</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">{weakness}</p>
        </div>
      </section>
    </div>
  );
}

