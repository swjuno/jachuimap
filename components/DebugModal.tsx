'use client';

import { X, Map as MapIcon } from 'lucide-react';
import type { RawDebugData } from '@/types/score';

interface DebugModalProps {
  onClose: () => void;
  debugData: RawDebugData;
  showMarkers: boolean;
  onToggleMarkers: () => void;
}

export default function DebugModal({ onClose, debugData, showMarkers, onToggleMarkers }: DebugModalProps) {
  const categories = [
    { name: '다이소', raw: debugData.daisoRaw, dedup: debugData.daisoDedup },
    { name: '대형마트', raw: debugData.martRaw, dedup: debugData.martDedup },
    { name: '편의점', raw: debugData.cvsRaw, dedup: debugData.cvsDedup },
  ];

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-96 bg-slate-900 border-l border-slate-700 shadow-2xl z-50 flex flex-col animate-fade-in">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          🛠️ Raw 데이터 디버그
        </h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="p-4 bg-slate-800 border-b border-slate-700">
        <button
          onClick={onToggleMarkers}
          className={`w-full py-2 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
            showMarkers 
              ? 'bg-brand-500 text-slate-900 hover:bg-brand-400' 
              : 'bg-slate-700 text-white hover:bg-slate-600'
          }`}
        >
          <MapIcon size={16} />
          {showMarkers ? '지도에 디버그 마커 숨기기' : '지도에 디버그 마커 표시'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 text-sm">
        {categories.map((cat, i) => (
          <div key={i} className="space-y-2">
            <h3 className="font-bold text-brand-300 border-b border-slate-700 pb-1">
              {cat.name} (API {cat.raw.length}개 &rarr; 중복제거 {cat.dedup.length}개)
            </h3>
            <div className="space-y-3">
              {cat.raw.map((doc, idx) => {
                const isDeduped = cat.dedup.some((d) => d.id === doc.id);
                return (
                  <div 
                    key={doc.id || idx} 
                    className={`p-3 rounded-lg border ${
                      isDeduped ? 'bg-slate-800 border-brand-500/50' : 'bg-slate-800/50 border-slate-700/50 opacity-60'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-slate-200">{doc.place_name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        isDeduped ? 'bg-brand-500/20 text-brand-300' : 'bg-red-500/20 text-red-300'
                      }`}>
                        {isDeduped ? '채택' : '중복 탈락'}
                      </span>
                    </div>
                    <div className="text-slate-400 text-xs mt-1 space-y-0.5">
                      <p>거리: {doc.distance}m</p>
                      <p>주소: {doc.road_address_name || '주소 없음'}</p>
                      <p className="font-mono text-[10px]">({doc.y}, {doc.x})</p>
                    </div>
                  </div>
                );
              })}
              {cat.raw.length === 0 && <p className="text-slate-500">검색 결과 없음</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
