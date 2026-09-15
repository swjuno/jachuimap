'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getDisplayedFacilityMarkers, getFacilityMarkerZIndex } from '@/lib/facility-markers';
import type { FacilityCategory, FacilityMarker } from '@/types/score';
import type { KakaoMapInstance } from '@/components/KakaoMap';

const CATEGORY: Record<FacilityCategory, { label: string; icon: string; color: string }> = {
  subway: { label: '지하철역', icon: '🚇', color: '#1d4ed8' },
  cvs: { label: '편의점', icon: '🏪', color: '#7e22ce' },
  laundry: { label: '빨래방', icon: '🧺', color: '#0369a1' },
  mart: { label: '마트', icon: '🛒', color: '#c2410c' },
  daiso: { label: '다이소', icon: '🛍', color: '#be123c' },
  deptStore: { label: '백화점', icon: '🏬', color: '#a16207' },
  cinema: { label: '영화관', icon: '🎬', color: '#4338ca' },
  cafe: { label: '카페', icon: '☕', color: '#92400e' },
  oliveYoung: { label: '올리브영', icon: '💄', color: '#4d7c0f' },
  gym: { label: '헬스장', icon: '💪', color: '#0f766e' },
  medical: { label: '병원·약국', icon: '✚', color: '#b91c1c' },
};

interface Props {
  map: KakaoMapInstance;
  markers: readonly FacilityMarker[];
}

interface OverlayControl {
  overlay: { setMap: (map: KakaoMapInstance | null) => void; setZIndex: (zIndex: number) => void };
  button: HTMLButtonElement;
  marker: FacilityMarker;
}

export function panToFacilityMarkerIfHidden(map: KakaoMapInstance, marker: FacilityMarker): void {
  const sdk = window.kakao?.maps;
  if (!sdk?.LatLng) return;
  const position = new sdk.LatLng(marker.lat, marker.lng);
  if (!map.getBounds().contain(position)) map.panTo(position);
}

export default function FacilityMapLayer({ map, markers }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const overlaysRef = useRef(new Map<string, OverlayControl>());
  const visibleMarkers = useMemo(
    () => getDisplayedFacilityMarkers(markers, showAll),
    [markers, showAll],
  );
  const selected = visibleMarkers.find((marker) => marker.id === selectedId) ?? null;

  useEffect(() => {
    setSelectedId(null);
  }, [markers]);

  useEffect(() => {
    if (selectedId && !visibleMarkers.some((marker) => marker.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, visibleMarkers]);

  useLayoutEffect(() => {
    const sdk = window.kakao?.maps;
    if (!sdk?.CustomOverlay) return;
    const overlayControls = visibleMarkers.map((marker) => {
      const category = CATEGORY[marker.category];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'facility-map-marker';
      button.style.backgroundColor = category.color;
      button.textContent = category.icon;
      button.setAttribute('aria-label', `${category.label} · ${marker.name} · 직선거리 ${marker.distance}m`);
      button.setAttribute('aria-pressed', 'false');
      button.title = `${category.label} · ${marker.name}`;
      button.onclick = () => setSelectedId(marker.id);
      const overlay = new sdk.CustomOverlay({
        map,
        position: new sdk.LatLng(marker.lat, marker.lng),
        content: button,
        clickable: true,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: getFacilityMarkerZIndex(marker, null),
      });
      return { overlay, button, marker };
    });
    const controls = overlaysRef.current;
    controls.clear();
    overlayControls.forEach((control) => controls.set(control.marker.id, control));

    return () => {
      overlayControls.forEach(({ overlay, button }) => {
        button.onclick = null;
        overlay.setMap(null);
      });
      controls.clear();
    };
  }, [map, visibleMarkers]);

  useEffect(() => {
    overlaysRef.current.forEach(({ overlay, button, marker }) => {
      const isSelected = marker.id === selectedId;
      button.classList.toggle('facility-map-marker--selected', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
      overlay.setZIndex(getFacilityMarkerZIndex(marker, selectedId));
    });
  }, [selectedId, visibleMarkers]);

  useEffect(() => {
    if (selected) panToFacilityMarkerIfHidden(map, selected);
  }, [map, selected]);

  const modeLabel = showAll ? '점수 근거만 보기' : '전체 시설 보기';

  return (
    <aside className="absolute bottom-2 left-2 right-16 z-20 text-xs text-slate-200"
      aria-label="분석 시설 목록">
      {selected && (
        <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-slate-600 bg-slate-950/95 px-2 py-1.5 shadow-lg"
          role="status" aria-live="polite">
          <p className="truncate font-bold" title={selected.name}>{selected.name}</p>
          <p>{CATEGORY[selected.category].label} · 직선거리 {selected.distance.toLocaleString('ko-KR')}m</p>
          <p className="text-slate-400">{selected.usedForScore ? '주요 산정 근거' : '함께 검색된 시설'}</p>
        </div>
      )}

      <div className="flex min-h-11 gap-1 rounded-lg border border-slate-600 bg-slate-950/95 p-1 shadow-lg">
        <button type="button" onClick={() => setShowAll((current) => !current)}
          className="min-h-11 shrink-0 rounded border border-slate-500 px-2 font-medium text-slate-100 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-brand-400"
          aria-pressed={showAll}>
          {modeLabel}
        </button>
        <label className="min-w-0 flex-1">
          <span className="sr-only">표시된 시설 선택</span>
          <select value={selectedId ?? ''}
            onChange={(event) => setSelectedId(event.target.value || null)}
            aria-current={selected ? 'true' : undefined}
            className="min-h-11 w-full min-w-0 rounded bg-slate-900 px-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-brand-400">
            <option value="">시설 선택 · {visibleMarkers.length}곳</option>
            {visibleMarkers.map((marker) => (
              <option key={marker.id} value={marker.id}>
                {CATEGORY[marker.category].label} · {marker.name} · {marker.distance.toLocaleString('ko-KR')}m
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="sr-only">시설 이름은 카카오 검색 결과를 텍스트로만 표시합니다. 시설별 추가 점수를 뜻하지 않습니다.</p>
    </aside>
  );
}
