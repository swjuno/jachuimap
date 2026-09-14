'use client';

import { useState } from 'react';
import type { ScoreBreakdown, InfrastructureData } from '@/types/score';
import { ChevronDown, ChevronUp, Train, Store, ShoppingBag, MapPin, Heart, Film } from 'lucide-react';

interface ScoreCardProps {
  breakdown: ScoreBreakdown;
  infra: InfrastructureData;
}

// ── Accordion Component ──────────────────────────────────────────────────

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

export default function ScoreCard({ breakdown, infra }: ScoreCardProps) {
  const { subway, convenience, martDaiso, lifestyle } = breakdown;
  
  // Helpers
  const formatDist = (d: number) => d === 9999 ? '없음' : `${d}m`;

  return (
    <section className="glass-card p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
          📋 상세 평가표
        </h3>
        <span className="text-2xl font-black text-white tabular-nums">
          {breakdown.totalScore}
          <span className="text-sm font-normal text-slate-500"> / 100</span>
        </span>
      </div>

      {breakdown.dynamicMessage && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 my-2 text-sm text-amber-200 text-center font-medium shadow-sm">
          💡 {breakdown.dynamicMessage}
        </div>
      )}

      <div className="space-y-2">
        {/* Subway */}
        <Accordion 
          title={
            <span className="flex items-center gap-1.5">
              대중교통 ({subway.name ? subway.name + '역' : '없음'})
              {breakdown.weakestCategory === 'subway' && <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 whitespace-nowrap">⚠️ 최저점</span>}
            </span>
          }
          score={subway.score} 
          maxScore={22} 
          icon={<Train size={18} />}
        >
          <DetailRow label="가장 가까운 역" value={subway.name ? `${subway.name}역` : '없음'} />
          <DetailRow label="직선거리" value={formatDist(subway.nearestDist)} highlight />
          <DetailRow label="환승/급행 보너스" value={subway.score >= 20 ? '적용됨' : '없음'} />
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
          maxScore={14} 
          icon={<Store size={18} />}
        >
          <DetailRow label="최단 거리" value={formatDist(convenience.nearestDist)} highlight />
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
              마트 & 다이소 <span className="text-slate-500 text-xs hidden sm:inline">[다이소 {martDaiso.counts.daiso}개, 대형마트 {martDaiso.counts.emart + martDaiso.counts.homeplus + martDaiso.counts.lotteMart}개]</span>
              {breakdown.weakestCategory === 'martDaiso' && <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 whitespace-nowrap">⚠️ 최저점</span>}
            </span>
          }
          score={martDaiso.score} 
          maxScore={14} 
          icon={<ShoppingBag size={18} />}
        >
          <DetailRow label="최단 거리" value={formatDist(martDaiso.nearestDist)} highlight />
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
          maxScore={50} 
          icon={<Heart size={18} />}
        >
          <DetailRow label="백화점" value={lifestyle.deptStore.name ? `${lifestyle.deptStore.name} (${formatDist(lifestyle.deptStore.nearestDist)})` : '없음'} />
          <DetailRow label="영화관" value={lifestyle.cinema.name ? `${lifestyle.cinema.name} (${formatDist(lifestyle.cinema.nearestDist)})` : '없음'} />
          <DetailRow label="카페/스타벅스" value={lifestyle.cafe.nearestDist !== 9999 ? `최소 ${formatDist(lifestyle.cafe.nearestDist)} ${lifestyle.cafe.hasStarbucks ? '(스벅 포함)' : ''}` : '없음'} />
          <DetailRow label="올영/헬스장" value={lifestyle.care.nearestDist !== 9999 ? `최소 ${formatDist(lifestyle.care.nearestDist)}` : '없음'} />
          <DetailRow label="병원/약국" value={formatDist(lifestyle.medical.nearestDist)} />
        </Accordion>
      </div>

      {/* Ad Banner */}
      <div className="mt-6 border border-slate-700 border-dashed rounded-lg p-4 bg-slate-900/50 flex flex-col items-center justify-center relative overflow-hidden group cursor-pointer hover:bg-slate-800 transition-colors">
        <span className="absolute top-1 left-2 text-[10px] text-slate-500 font-bold bg-slate-800 px-1.5 py-0.5 rounded">AD</span>
        <p className="text-brand-400 font-bold text-sm mt-2">청년 전세대출 최저금리 1분만에 비교하기 💰</p>
        <p className="text-xs text-slate-400 mt-1">버팀목, 카카오뱅크 등 조건 확인 &rarr;</p>
      </div>
    </section>
  );
}
