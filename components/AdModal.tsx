'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface AdModalProps {
  onClose: () => void;
}

export default function AdModal({ onClose }: AdModalProps) {
  const [timeLeft, setTimeLeft] = useState(2);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-fade-up">
        {/* Ad Header */}
        <div className="bg-slate-800 px-4 py-3 border-b border-slate-700 flex justify-between items-center">
          <span className="text-xs font-semibold text-slate-400">스폰서 광고</span>
          {timeLeft === 0 ? (
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
              <X size={16} />
            </button>
          ) : (
            <div className="w-4 h-4" /> // Placeholder to maintain flex space
          )}
        </div>
        
        {/* Ad Content */}
        <div className="p-6 text-center space-y-4">
          <h3 className="text-lg font-bold text-white">결과 집계 완료!</h3>
          <div className="w-full h-32 bg-slate-800 rounded-lg flex flex-col items-center justify-center border border-slate-700 border-dashed">
            <p className="text-sm font-medium text-brand-400">청년 전세대출 최저금리 비교하기</p>
            <p className="text-xs text-slate-500 mt-1">스폰서 배너 이미지 영역</p>
          </div>
          <p className="text-sm text-slate-300">
            광고 확인 후 결과가 공개됩니다.
          </p>
        </div>

        {/* Action */}
        <div className="px-6 pb-6">
          {timeLeft > 0 ? (
            <button 
              disabled
              className="w-full py-3 rounded-xl bg-slate-700 text-slate-400 font-bold opacity-60 cursor-not-allowed transition-all"
            >
              결과 준비 중... ({timeLeft}초)
            </button>
          ) : (
            <button 
              onClick={onClose}
              className="w-full py-3 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all active:scale-95"
            >
              👉 결과 확인하러 가기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
