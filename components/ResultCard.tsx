'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { toPng } from 'html-to-image';
import confetti from 'canvas-confetti';
import { Download, Link, MapPinned, RotateCcw } from 'lucide-react';
import type { TierResult } from '@/types/score';
import type { InfrastructureData, ScoreBreakdown } from '@/types/score';
import { SCORE_MAX, TOTAL_SCORE_MAX } from '@/lib/scoring';
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
  onShowFacilities?: () => void;
}

// ── Score-reason helpers ────────────────────────────────────────────────────

/**
 * Format a distance for display. Returns null when the distance is null,
 * so the caller can decide whether to show "없음" or hide the item entirely.
 */
function fmtDist(dist: number | null): string | null {
  return dist === null ? null : `${dist.toLocaleString('ko-KR')}m`;
}

/**
 * Build a short reason string for why the subway earned its score.
 * Reflects the scoring thresholds in lib/scoring.ts without duplicating the math.
 */
function subwayReason(infra: InfrastructureData, score: number): string {
  const dist = infra.subway.distanceMetres;
  if (dist === null || score === 0) return '1km 반경 안에 확인된 역 없음 → 0점';
  const threshold = dist <= 350 ? '350m' : dist <= 700 ? '700m' : '1,000m';
  const base = dist <= 350 ? 20 : dist <= 700 ? 14 : 8;
  const bonus = score - base > 0 ? ` + 환승 +${score - base}점` : '';
  return `${infra.subway.stationName}역 ${dist}m · ${threshold} 이내 기본 ${base}점${bonus}`;
}

/**
 * Build a short reason string for why convenience earned its score.
 */
function cvsReason(infra: InfrastructureData, score: number): string {
  const dist = infra.cvs.nearestDist;
  if (dist === null && infra.laundromat.count === 0) return '300m 반경 안에 편의점·빨래방 없음 → 0점';

  const parts: string[] = [];
  if (dist !== null) {
    const base = dist <= 150 ? 10 : dist <= 300 ? 6 : 0;
    if (base > 0) {
      parts.push(`편의점 ${dist}m · ${dist <= 150 ? '150m' : '300m'} 이내 기본 ${base}점`);
    } else {
      parts.push(`가장 가까운 편의점 ${dist}m (300m 초과)`);
    }
  } else {
    parts.push('300m 안 편의점 없음');
  }

  const brandCount = [infra.cvs.gs25, infra.cvs.cu, infra.cvs.seven, infra.cvs.emart24].filter(c => c > 0).length;
  if (brandCount >= 2 && score > (dist !== null && dist <= 150 ? 10 : 6)) {
    parts.push(`브랜드 ${brandCount}종 이상 +2점`);
  }
  if (infra.laundromat.count > 0) parts.push(`빨래방 ${infra.laundromat.count}개 +2점`);

  return parts.join(' · ');
}

/**
 * Build a short reason string for mart & daiso scoring.
 */
function martReason(infra: InfrastructureData, score: number): string {
  const daisoDist = infra.mart.daisoDist;
  const martDist = infra.mart.nearestDist;
  const nearestDist = Math.min(daisoDist ?? Infinity, martDist ?? Infinity);

  if (nearestDist === Infinity) return '800m 반경 안에 마트·다이소 없음 → 0점';

  const base = nearestDist <= 400 ? 10 : nearestDist <= 800 ? 6 : 0;
  const hasDaiso = infra.mart.daisoCount > 0;
  const hasMart = infra.mart.emartCount > 0 || infra.mart.homeplusCount > 0 || infra.mart.lotteMartCount > 0 || infra.mart.mediumSuperCount > 0;

  const parts: string[] = [];
  if (base > 0) {
    parts.push(`최단 ${nearestDist}m · ${nearestDist <= 400 ? '400m' : '800m'} 이내 기본 ${base}점`);
  } else {
    parts.push(`최단 ${nearestDist}m (800m 초과)`);
  }
  if (base > 0 && hasDaiso && hasMart) parts.push(`다이소 + 마트 동시 확인 +4점`);
  else if (!hasDaiso) parts.push('다이소 없음');
  else if (!hasMart) parts.push('대형마트 없음');

  return parts.join(' · ');
}

/**
 * Produce the 3 most meaningful strength lines for this location,
 * each annotated with the score reason so the user understands the grade.
 */
function buildStrengths(infra: InfrastructureData, breakdown: ScoreBreakdown): string[] {
  const { subway, convenience, martDaiso, lifestyle } = breakdown;
  const items: Array<{ score: number; pct: number; text: string }> = [];

  // Subway
  if (subway.score > 0 && infra.subway.stationName) {
    items.push({
      score: subway.score,
      pct: subway.score / SCORE_MAX.subway,
      text: `🚇 ${infra.subway.stationName}역 ${fmtDist(infra.subway.distanceMetres)} · ${subway.score}/${SCORE_MAX.subway}점`,
    });
  }

  // CVS
  const totalCvs = infra.cvs.gs25 + infra.cvs.cu + infra.cvs.seven + infra.cvs.emart24;
  if (convenience.score > 0 && infra.cvs.nearestDist !== null) {
    items.push({
      score: convenience.score,
      pct: convenience.score / SCORE_MAX.convenience,
      text: `🏪 편의점 ${totalCvs}개(${[infra.cvs.gs25 > 0 && 'GS25', infra.cvs.cu > 0 && 'CU', infra.cvs.seven > 0 && '세븐', infra.cvs.emart24 > 0 && '이마트24'].filter(Boolean).join('·')}) · 최단 ${fmtDist(infra.cvs.nearestDist)} · ${convenience.score}/${SCORE_MAX.convenience}점`,
    });
  }

  // Mart & Daiso
  if (martDaiso.score > 0) {
    const nearestMart = Math.min(infra.mart.daisoDist ?? Infinity, infra.mart.nearestDist ?? Infinity);
    const hasDaiso = infra.mart.daisoCount > 0;
    items.push({
      score: martDaiso.score,
      pct: martDaiso.score / SCORE_MAX.martDaiso,
      text: `🛒 ${hasDaiso ? `다이소 ${infra.mart.daisoCount}개` : '마트'} · 최단 ${nearestMart === Infinity ? '없음' : `${nearestMart}m`} · ${martDaiso.score}/${SCORE_MAX.martDaiso}점`,
    });
  }

  // Dept store
  if (lifestyle.deptStore.score > 0 && lifestyle.deptStore.name) {
    items.push({
      score: lifestyle.deptStore.score,
      pct: lifestyle.deptStore.score / SCORE_MAX.deptStore,
      text: `🏬 ${lifestyle.deptStore.name} ${lifestyle.deptStore.nearestDist !== 9999 ? fmtDist(lifestyle.deptStore.nearestDist) : ''} · ${lifestyle.deptStore.score}/${SCORE_MAX.deptStore}점`,
    });
  }

  // Cinema
  if (lifestyle.cinema.score > 0 && lifestyle.cinema.name) {
    items.push({
      score: lifestyle.cinema.score,
      pct: lifestyle.cinema.score / SCORE_MAX.cinema,
      text: `🎬 ${lifestyle.cinema.name} ${lifestyle.cinema.nearestDist !== 9999 ? fmtDist(lifestyle.cinema.nearestDist) : ''} · ${lifestyle.cinema.score}/${SCORE_MAX.cinema}점`,
    });
  }

  // Cafe
  if (lifestyle.cafe.score > 0 && infra.cafe.nearestDist !== null) {
    const sbLabel = lifestyle.cafe.hasStarbucks ? '(스타벅스 포함)' : '';
    items.push({
      score: lifestyle.cafe.score,
      pct: lifestyle.cafe.score / SCORE_MAX.cafe,
      text: `☕ 카페 ${fmtDist(infra.cafe.nearestDist)} ${sbLabel} · ${lifestyle.cafe.score}/${SCORE_MAX.cafe}점`.trim(),
    });
  }

  // Care
  if (lifestyle.care.score > 0) {
    const labels = [infra.care.hasOliveYoung && '올리브영', infra.care.hasGym && '헬스장'].filter(Boolean).join('·');
    items.push({
      score: lifestyle.care.score,
      pct: lifestyle.care.score / SCORE_MAX.care,
      text: `💪 ${labels} ${fmtDist(infra.care.nearestDist)} · ${lifestyle.care.score}/${SCORE_MAX.care}점`,
    });
  }

  // Medical
  if (lifestyle.medical.score > 0 && infra.medical.nearestDist !== null) {
    items.push({
      score: lifestyle.medical.score,
      pct: lifestyle.medical.score / SCORE_MAX.medical,
      text: `🏥 병원·약국 ${fmtDist(infra.medical.nearestDist)} · ${lifestyle.medical.score}/${SCORE_MAX.medical}점`,
    });
  }

  // Return top 3 by score percentage (highest-scoring categories first)
  return items
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3)
    .map(i => i.text);
}

/**
 * Build a concise weakness explanation that clearly distinguishes between
 * "facility not found in search range" and "found but too far for full score".
 */
function buildWeakness(infra: InfrastructureData, breakdown: ScoreBreakdown): string {
  switch (breakdown.weakestCategory) {
    case 'subway': {
      const dist = infra.subway.distanceMetres;
      if (dist === null) return '1km 반경 안에 확인된 역이 없어 대중교통 점수 0점입니다.';
      if (dist > 1000) return `가장 가까운 역이 ${fmtDist(dist)} (기준 1km 초과)로 대중교통 점수가 낮습니다.`;
      return `가장 가까운 ${infra.subway.stationName}역이 ${fmtDist(dist)}라 대중교통 점수가 낮습니다.`;
    }
    case 'convenience': {
      const dist = infra.cvs.nearestDist;
      const totalCvs = infra.cvs.gs25 + infra.cvs.cu + infra.cvs.seven + infra.cvs.emart24;
      if (dist === null && totalCvs === 0) return '300m 반경 안에 편의점이 확인되지 않아 생활 편의 점수가 낮습니다.';
      if (dist !== null && dist > 300) return `가장 가까운 편의점이 ${fmtDist(dist)} (기준 300m 초과)라 점수가 낮습니다.`;
      return '편의점 거리 또는 브랜드 다양성이 부족해 생활 편의 점수가 낮습니다.';
    }
    case 'martDaiso': {
      const nearestDist = Math.min(infra.mart.daisoDist ?? Infinity, infra.mart.nearestDist ?? Infinity);
      if (nearestDist === Infinity) return '800m 반경 안에 마트·다이소가 확인되지 않아 장보기 점수가 낮습니다.';
      return `마트·다이소 최단 ${nearestDist}m (기준 400m 초과)로 장보기 점수가 낮습니다.`;
    }
    case 'deptStore': {
      const dist = infra.deptStore.nearestDist;
      if (dist === null) return '1.5km 반경 안에 백화점이 확인되지 않아 주말 생활 점수가 낮습니다.';
      return `가장 가까운 백화점이 ${fmtDist(dist)} (기준 1.5km)라 주말 생활 점수가 낮습니다.`;
    }
    case 'cinema': {
      const dist = infra.cinema.nearestDist;
      if (dist === null) return '1.2km 반경 안에 CGV·롯데·메가박스가 확인되지 않아 문화생활 점수가 낮습니다.';
      return `가장 가까운 영화관이 ${fmtDist(dist)} (기준 1.2km)라 문화생활 점수가 낮습니다.`;
    }
    case 'cafe': {
      const dist = infra.cafe.nearestDist;
      if (dist === null) return '400m 반경 안에 카페가 확인되지 않아 여가 점수가 낮습니다.';
      return `카페가 ${fmtDist(dist)} (기준 150m·400m)라 여가 점수가 낮습니다. 스타벅스 없음.`;
    }
    case 'care': {
      const dist = infra.care.nearestDist;
      if (dist === null) return '500m 반경 안에 올리브영·헬스장이 확인되지 않아 생활 관리 점수가 낮습니다.';
      return `올리브영·헬스장이 ${fmtDist(dist)} (기준 250m·500m)라 생활 관리 점수가 낮습니다.`;
    }
    case 'medical': {
      const dist = infra.medical.nearestDist;
      if (dist === null) return '500m 반경 안에 병원·약국이 확인되지 않아 의료 접근성 점수가 낮습니다.';
      return `가장 가까운 병원·약국이 ${fmtDist(dist)} (기준 500m 초과)라 의료 접근성 점수가 낮습니다.`;
    }
    default:
      return '모든 항목이 고르게 충족된 동네입니다.';
  }
}

export default function ResultCard({ tier, address, coordinates, shareToken, breakdown, infra, isMock, warning, onReset, onShowFacilities }: ResultCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const hasFired = useRef(false);
  const cfg = TIER_CONFIG[tier.tier];
  const [shareNotice, setShareNotice] = useState('');
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);

  const strengths = buildStrengths(infra, breakdown);
  const weakness = buildWeakness(infra, breakdown);

  // Fire confetti once on mount
  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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
          glass-card p-4 ring-2 ${cfg.ring} ${cfg.glow}
          flex flex-col items-center text-center gap-3 md:p-6 md:gap-4
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
          h-16 w-16 rounded-2xl ${cfg.badge} flex flex-col items-center justify-center
          md:h-24 md:w-24
          text-white font-black shadow-2xl
        `}>
          <span className="text-2xl leading-none md:text-3xl">{cfg.emoji}</span>
          <span className="text-sm mt-0.5 font-bold">{cfg.label}</span>
        </div>

        {/* Score */}
        <div>
          <div className="text-4xl font-black text-white tabular-nums md:text-5xl">
            {tier.score}
            <span className="text-xl font-medium text-slate-400"> / {TOTAL_SCORE_MAX}점</span>
          </div>
        </div>

        {/* Title & quote */}
        <div className="space-y-1.5">
          <h1 id="result-title" className="text-lg font-bold text-white">{tier.title}</h1>
          <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
            &ldquo;{tier.quote}&rdquo;
          </p>
        </div>

        <div className="w-full rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-left min-[1180px]:hidden">
          <p className="text-xs font-bold text-amber-200">핵심 요약</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-200">{weakness}</p>
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

      {onShowFacilities && (
        <button
          id="show-facilities-btn"
          type="button"
          onClick={onShowFacilities}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-500/50 bg-brand-600/20 px-4 text-sm font-semibold text-brand-100 hover:bg-brand-600/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 min-[1180px]:hidden"
          aria-label="지도에서 점수 근거 시설 보기"
        >
          <MapPinned size={16} />
          지도에서 시설 보기
        </button>
      )}

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

      {/* ── 강점·약점 요약 ─────────────────────────────────────────────────
           Desktop (min-[1180px]): always visible, no disclosure
           Mobile (<1180px):       collapsible <details> to keep the view compact
      ──────────────────────────────────────────────────────────────────────── */}

      {/* Desktop-only — always open */}
      <section
        className="hidden min-[1180px]:block rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 space-y-4"
        aria-label="분석 요약"
      >
        <StrengthWeaknessBody strengths={strengths} weakness={weakness} />
      </section>

      {/* Mobile-only — collapsible details */}
      <details className="min-[1180px]:hidden rounded-2xl border border-slate-700/70 bg-slate-900/60 group">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none select-none text-sm font-semibold text-slate-300 hover:text-white transition-colors">
          <span>📊 점수 근거 보기</span>
          {/* Chevron that rotates when open */}
          <span className="text-slate-500 transition-transform group-open:rotate-180 text-xs">▼</span>
        </summary>
        <div className="px-4 pb-4 space-y-4 border-t border-slate-700/50 pt-3">
          <StrengthWeaknessBody strengths={strengths} weakness={weakness} />
        </div>
      </details>
    </div>
  );
}

// ── Shared strength/weakness content ──────────────────────────────────────

function StrengthWeaknessBody({
  strengths,
  weakness,
}: {
  strengths: string[];
  weakness: string;
}) {
  return (
    <>
      <div>
        <h3 className="text-sm font-bold text-slate-200">이 동네의 강점</h3>
        {strengths.length > 0 ? (
          <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
            {strengths.map((item) => (
              <li key={item} className="flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0 text-emerald-400">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-400">높은 점수를 받은 핵심 시설이 확인되지 않았습니다.</p>
        )}
      </div>
      <div className="border-t border-slate-700/60 pt-3">
        <h3 className="text-sm font-bold text-amber-200">가장 아쉬운 항목</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">{weakness}</p>
      </div>
    </>
  );
}
