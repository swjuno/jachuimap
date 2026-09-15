'use client';

import { useState } from 'react';
import { SCORE_MAX, LIFESTYLE_MAX, TOTAL_SCORE_MAX } from '@/lib/scoring';
import type { ScoreBreakdown, InfrastructureData } from '@/types/score';
import { ChevronDown, ChevronUp, Train, Store, ShoppingBag, MapPin, Heart, Film } from 'lucide-react';

interface ScoreCardProps {
  breakdown: ScoreBreakdown;
  infra: InfrastructureData;
}

// ── Accordion Component ──────────────────────────────────────────────

function Accordion({
  title,
  score,
  maxScore,
  icon,
  children,
}: {
  title: React.ReactNode;
  score: number;
  maxScore: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pct = maxScore === 0 ? 0 : Math.round((Math.abs(score) / maxScore) * 100);

  return (
    <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden transition-all">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-brand-400">{icon}</span>
          <span className="font-semibold text-slate-200 text-sm">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-white text-sm">
            {score > 0 ? `+${score}` : score}
            <span className="text-slate-500 font-normal text-xs">/{maxScore}</span>
          </span>
          {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </button>
      
      {/* Progress Bar under header */}
      <div className="h-1 w-full bg-slate-800/80">
        <div 
          className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-r-full"
          style={{ width: `${pct}%` }}
        />
      </div>

      {isOpen && (
        <div className="p-4 bg-slate-900/50 text-sm text-slate-300 space-y-2 border-t border-slate-700/50">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Sub-row ─────────────────────────────────────────────────────────────

function DetailRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-slate-700/30 last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className={`font-medium ${highlight ? 'text-brand-300' : 'text-slate-200'}`}>{value}</span>
    </div>
  );
}

// ── Score reason chip ────────────────────────────────────────────────

function ScoreReasonChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 rounded-lg bg-slate-800/60 border border-slate-700/40 px-3 py-2 text-xs text-slate-300 leading-snug">
      {children}
    </div>
  );
}

/** Format distance; returns '없음' for 9999 sentinel and 'Xm' otherwise. */
function fmtDist(d: number): string {
  return d === 9999 ? '없음' : `${d}m`;
}

// ── Subway reason text ───────────────────────────────────────────────

function subwayReasonText(
  distanceMetres: number | null,
  transferBonus: number,
  baseScore: number,
): string {
  if (distanceMetres === null || baseScore === 0) {
    return '1km 반경 안에 확인된 지하철역 없음 → 0점';
  }
  const threshold =
    distanceMetres <= 350 ? '350m 이내 → 기본 20점' :
    distanceMetres <= 700 ? '700m 이내 → 기본 14점' :
                             '1km 이내 → 기본 8점';
  const bonusPart = transferBonus > 0 ? ` + 환승 가능 +${transferBonus}점` : '';
  return `${distanceMetres}m · ${threshold}${bonusPart}`;
}

// ── CVS reason text ─────────────────────────────────────────────────

function cvsReasonText(
  nearestDist: number | null,
  brandCount: number,
  laundryCount: number,
  score: number,
): string {
  if (score === 0) {
    return nearestDist === null
      ? '300m 반경 안에 편의점이 확인되지 않음 → 0점'
      : `편의점 ${nearestDist}m (300m 초과) → 기본 점수 없음`;
  }
  const base = nearestDist !== null && nearestDist <= 150 ? 10 : 6;
  const threshold = nearestDist !== null && nearestDist <= 150 ? '150m 이내 → 기본 10점' : '300m 이내 → 기본 6점';
  const brandBonus = brandCount >= 2 ? ` + 브랜드 ${brandCount}종 +2점` : '';
  const laundryBonus = laundryCount > 0 ? ` + 빨래방 +2점` : '';
  return `${nearestDist}m · ${threshold}${brandBonus}${laundryBonus}`;
}

// ── Mart reason text ────────────────────────────────────────────────

function martReasonText(
  nearestDist: number,
  hasDaiso: boolean,
  hasMart: boolean,
  score: number,
): string {
  if (score === 0) {
    return nearestDist === 9999
      ? '800m 반경 안에 마트·다이소가 확인되지 않음 → 0점'
      : `최단 ${nearestDist}m (800m 초과) → 기본 점수 없음`;
  }
  const threshold =
    nearestDist <= 400 ? '400m 이내 → 기본 10점' : '800m 이내 → 기본 6점';
  const comboBonus = hasDaiso && hasMart ? ' + 다이소·마트 동시 확인 +4점' : '';
  return `${nearestDist}m · ${threshold}${comboBonus}`;
}

// ── Lifestyle reason text ───────────────────────────────────────────

function lifestyleReasonLines(
  lifestyle: ScoreBreakdown['lifestyle'],
  infra: InfrastructureData,
): Array<{ label: string; reason: string }> {
  return [
    {
      label: '백화점',
      reason: (() => {
        const d = lifestyle.deptStore.nearestDist;
        if (d === 9999 || infra.deptStore.name === null) return '1.5km 반경 안에 확인된 백화점 없음 → 0점';
        if (d <= 600) return `${d}m (600m 이내) → 15점`;
        if (d <= 1000) return `${d}m (1km 이내) → 10점`;
        if (d <= 1500) return `${d}m (1.5km 이내) → 5점`;
        return `${d}m (1.5km 초과) → 0점`;
      })(),
    },
    {
      label: '영화관',
      reason: (() => {
        const d = lifestyle.cinema.nearestDist;
        if (d === 9999 || infra.cinema.name === null) return '1.2km 반경 안에 CGV·롯데·메가박스 없음 → 0점';
        if (d <= 500) return `${d}m (500m 이내) → 10점`;
        if (d <= 800) return `${d}m (800m 이내) → 7점`;
        if (d <= 1200) return `${d}m (1.2km 이내) → 4점`;
        return `${d}m (1.2km 초과) → 0점`;
      })(),
    },
    {
      label: '카페/스타벅스',
      reason: (() => {
        const d = lifestyle.cafe.nearestDist;
        const s = lifestyle.cafe.hasStarbucks;
        if (d === 9999) return '400m 반경 안에 확인된 카페 없음 → 0점';
        const base = d <= 150 ? 7 : d <= 400 ? 4 : 0;
        if (base === 0) return `${d}m (400m 초과) → 0점`;
        const threshold = d <= 150 ? '150m 이내 → 기본 7점' : '400m 이내 → 기본 4점';
        return `${d}m · ${threshold}${s ? ' + 스타벅스 +2점' : ' · 스타벅스 없음'}`;
      })(),
    },
    {
      label: '올영/헬스장',
      reason: (() => {
        const d = lifestyle.care.nearestDist;
        const both = lifestyle.care.hasOliveYoung && lifestyle.care.hasGym;
        if (d === 9999) return '500m 반경 안에 올리브영·헬스장 없음 → 0점';
        const base = d <= 250 ? 6 : d <= 500 ? 4 : 0;
        if (base === 0) return `${d}m (500m 초과) → 0점`;
        const threshold = d <= 250 ? '250m 이내 → 기본 6점' : '500m 이내 → 기본 4점';
        return `${d}m · ${threshold}${both ? ' + 둘 다 확인 +2점' : ''}`;
      })(),
    },
    {
      label: '병원/약국',
      reason: (() => {
        const d = lifestyle.medical.nearestDist;
        if (d === 9999) return '500m 반경 안에 병원·약국 없음 → 0점';
        if (d <= 250) return `${d}m (250m 이내) → 8점 만점`;
        if (d <= 500) return `${d}m (500m 이내) → 6점`;
        return `${d}m (500m 초과) → 0점`;
      })(),
    },
  ];
}

// ── Main Component ───────────────────────────────────────────────────

export default function ScoreCard({ breakdown, infra }: ScoreCardProps) {
  const { subway, convenience, martDaiso, lifestyle } = breakdown;
  
  // Helpers
  const brandCount = [infra.cvs.gs25, infra.cvs.cu, infra.cvs.seven, infra.cvs.emart24].filter(c => c > 0).length;
  const hasDaiso = infra.mart.daisoCount > 0;
  const hasMart = infra.mart.emartCount > 0 || infra.mart.homeplusCount > 0 || infra.mart.lotteMartCount > 0 || infra.mart.mediumSuperCount > 0;
  const lifestyleReasons = lifestyleReasonLines(lifestyle, infra);

  return (
    <section className="glass-card p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
          📋 상세 평가표
        </h3>
        <span className="text-2xl font-black text-white tabular-nums">
          {breakdown.totalScore}
          <span className="text-sm font-normal text-slate-500"> / {TOTAL_SCORE_MAX}</span>
        </span>
      </div>

      {breakdown.dynamicMessage && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 my-2 text-sm text-amber-200 text-center font-medium shadow-sm">
          💡 {breakdown.dynamicMessage}
        </div>
      )}

      <div className="space-y-2">
        <div className="rounded-xl bg-slate-900/50 p-3 text-sm text-slate-300 space-y-2">
          <p>지하철: {infra.subway.stationName && infra.subway.distanceMetres !== null
            ? `${infra.subway.stationName}역 · ${infra.subway.distanceMetres}m`
            : '1km 검색에서 확인되지 않음'}</p>
          <p>편의점: 주요 4개 브랜드 {infra.cvs.gs25 + infra.cvs.cu + infra.cvs.seven + infra.cvs.emart24}개 확인
            {infra.cvs.nearestDist !== null ? ` · 가장 가까운 편의점 ${infra.cvs.nearestDist}m` : ' · 300m 검색에서 확인되지 않음'}</p>
          <p>영화관: {infra.cinema.name && infra.cinema.nearestDist !== null
            ? `${infra.cinema.name} · ${infra.cinema.nearestDist}m`
            : '1.2km 지정 브랜드 검색에서 확인되지 않음'}</p>
          <p className="text-xs text-slate-400">직선거리이며 실제 도보 거리·시간과 다릅니다. 조회 실패 시 점수를 제공하지 않습니다.
            검색 범위·브랜드 필터·최대 45개 결과 제한 때문에 확인되지 않은 시설이 있을 수 있습니다.</p>
          <a href="/scoring" className="inline-block text-brand-400 underline">점수 기준과 데이터 한계 보기</a>
        </div>

        {/* Subway */}
        <Accordion 
          title={
            <span className="flex items-center gap-1.5">
              대중교통 ({subway.name ? subway.name + '역' : '없음'})
              {breakdown.weakestCategory === 'subway' && <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 whitespace-nowrap">⚠️ 최저점</span>}
            </span>
          }
          score={subway.score} 
          maxScore={SCORE_MAX.subway}
          icon={<Train size={18} />}
        >
          <ScoreReasonChip>
            📐 {subwayReasonText(infra.subway.distanceMetres, subway.transferBonus, subway.score)}
          </ScoreReasonChip>
          <DetailRow label="가장 가까운 역" value={subway.name ? `${subway.name}역` : '없음'} />
          <DetailRow label="직선거리" value={fmtDist(subway.nearestDist)} highlight />
          <DetailRow label="환승 보너스" value={subway.transferBonus > 0 ? `+${subway.transferBonus}점 적용` : '없음'} />
        </Accordion>

        {/* Convenience */}
        <Accordion 
          title={
            <span className="flex items-center gap-1.5 flex-wrap">
              편의점 슬세권 <span className="text-slate-500 text-xs hidden sm:inline">[GS25 {convenience.counts.gs25}개, CU {convenience.counts.cu}개 등]</span>
              {breakdown.weakestCategory === 'convenience' && <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 whitespace-nowrap">⚠️ 최저점</span>}
            </span>
          }
          score={convenience.score} 
          maxScore={SCORE_MAX.convenience}
          icon={<Store size={18} />}
        >
          <ScoreReasonChip>
            📐 {cvsReasonText(infra.cvs.nearestDist, brandCount, infra.laundromat.count, convenience.score)}
          </ScoreReasonChip>
          <DetailRow label="최단 거리" value={fmtDist(convenience.nearestDist)} highlight />
          <DetailRow label="GS25" value={`${convenience.counts.gs25}개`} />
          <DetailRow label="CU" value={`${convenience.counts.cu}개`} />
          <DetailRow label="세븐일레븐" value={`${convenience.counts.seven}개`} />
          <DetailRow label="이마트24" value={`${convenience.counts.emart24}개`} />
          <DetailRow label="코인빨래방" value={`${convenience.counts.laundry}개`} />
        </Accordion>

        {/* Mart & Daiso */}
        <Accordion 
          title={
            <span className="flex items-center gap-1.5 flex-wrap">
              마트 &amp; 다이소 <span className="text-slate-500 text-xs hidden sm:inline">[다이소 {martDaiso.counts.daiso}개, 대형마트 {martDaiso.counts.emart + martDaiso.counts.homeplus + martDaiso.counts.lotteMart}개]</span>
              {breakdown.weakestCategory === 'martDaiso' && <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 whitespace-nowrap">⚠️ 최저점</span>}
            </span>
          }
          score={martDaiso.score} 
          maxScore={SCORE_MAX.martDaiso}
          icon={<ShoppingBag size={18} />}
        >
          <ScoreReasonChip>
            📐 {martReasonText(martDaiso.nearestDist, hasDaiso, hasMart, martDaiso.score)}
          </ScoreReasonChip>
          <DetailRow label="최단 거리" value={fmtDist(martDaiso.nearestDist)} highlight />
          <DetailRow label="다이소" value={`${martDaiso.counts.daiso}개`} />
          <DetailRow label="이마트" value={`${martDaiso.counts.emart}개`} />
          <DetailRow label="홈플러스" value={`${martDaiso.counts.homeplus}개`} />
          <DetailRow label="롯데마트" value={`${martDaiso.counts.lotteMart}개`} />
          <DetailRow label="동네 중대형마트" value={`${martDaiso.counts.mediumSuper}개`} />
        </Accordion>

        {/* Lifestyle */}
        <Accordion 
          title={
            <span className="flex items-center gap-1.5">
              라이프스타일 (백화점, 헬스장, 카페 등)
              {['deptStore', 'cinema', 'cafe', 'care', 'medical'].includes(breakdown.weakestCategory) && <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 whitespace-nowrap">⚠️ 최저점</span>}
            </span>
          }
          score={lifestyle.deptStore.score + lifestyle.cinema.score + lifestyle.cafe.score + lifestyle.care.score + lifestyle.medical.score} 
          maxScore={LIFESTYLE_MAX}
          icon={<Heart size={18} />}
        >
          {/* Lifestyle score reasons */}
          <div className="mb-2 space-y-1">
            {lifestyleReasons.map(({ label, reason }) => (
              <div key={label} className="rounded-lg bg-slate-800/60 border border-slate-700/40 px-3 py-1.5 text-xs text-slate-300 flex items-start gap-2">
                <span className="text-slate-500 shrink-0 w-16">{label}</span>
                <span className="text-slate-300">{reason}</span>
              </div>
            ))}
          </div>
          <DetailRow label="백화점" value={lifestyle.deptStore.name ? `${lifestyle.deptStore.name} (${fmtDist(lifestyle.deptStore.nearestDist)})` : '없음'} />
          <DetailRow label="영화관" value={lifestyle.cinema.name ? `${lifestyle.cinema.name} (${fmtDist(lifestyle.cinema.nearestDist)})` : '없음'} />
          <DetailRow label="카페/스타벅스" value={lifestyle.cafe.nearestDist !== 9999 ? `최소 ${fmtDist(lifestyle.cafe.nearestDist)} ${lifestyle.cafe.hasStarbucks ? '(스벅 포함)' : ''}` : '없음'} />
          <DetailRow label="올영/헬스장" value={lifestyle.care.nearestDist !== 9999 ? `최소 ${fmtDist(lifestyle.care.nearestDist)}` : '없음'} />
          <DetailRow label="병원/약국" value={fmtDist(lifestyle.medical.nearestDist)} />
        </Accordion>
      </div>

    </section>
  );
}
