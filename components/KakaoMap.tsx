'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Plus, Minus, Navigation, Search, X } from 'lucide-react';
import { normalizeCoordinates, syncMapCenter, type Coordinates } from '@/lib/coordinates';
import type { FacilityMarker } from '@/types/score';
import FacilityMapLayer from '@/components/FacilityMapLayer';

export interface DebugMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  isAccepted: boolean;
}

interface KakaoMapProps {
  lat?: number;
  lng?: number;
  compact?: boolean;
  /** Address label shown on marker */
  label?: string;
  onPinChange?: (coords: Coordinates) => void;
  debugMarkers?: DebugMarker[];
  facilityMarkers?: readonly FacilityMarker[];
  /** Keep the analyzed location independent from result-map viewport movement. */
  lockAnalysisCoordinates?: boolean;
}

// Kakao Maps SDK type stubs
declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (cb: () => void) => void;
        LatLng: new (lat: number, lng: number) => unknown;
        Map: new (el: HTMLElement, opts: unknown) => KakaoMapInstance;
        Circle: new (opts: unknown) => { 
          setMap: (m: KakaoMapInstance | null) => void;
          setPosition: (latlng: unknown) => void;
        };
        Marker: new (opts: unknown) => {
          setMap: (m: KakaoMapInstance | null) => void;
        };
        MarkerImage: new (src: string, size: unknown) => unknown;
        CustomOverlay: new (opts: { map: KakaoMapInstance; position: unknown; content: HTMLElement;
          clickable: boolean; xAnchor: number; yAnchor: number; zIndex: number }) => {
            setMap: (map: KakaoMapInstance | null) => void;
            setPosition: (position: unknown) => void;
            setZIndex: (zIndex: number) => void;
          };
        Size: new (w: number, h: number) => unknown;
        event: {
          addListener: (target: unknown, type: string, handler: () => void) => void;
          removeListener: (target: unknown, type: string, handler: () => void) => void;
        };
        services?: {
          Places: new () => {
            keywordSearch: (keyword: string, callback: (data: { x: string; y: string }[], status: string) => void) => void;
          };
          Status: {
            OK: string;
          };
        };
      };
    };
  }
}

export interface KakaoMapInstance {
  setCenter: (latlng: unknown) => void;
  panTo: (latlng: unknown) => void;
  getBounds: () => { contain: (latlng: unknown) => boolean };
  relayout: () => void;
  getCenter: () => { getLat: () => number; getLng: () => number };
  setLevel: (level: number, options?: { animate?: boolean }) => void;
  getLevel: () => number;
  setZoomable: (zoomable: boolean) => void;
  setDraggable: (draggable: boolean) => void;
}

type KakaoLatLngFactory = new (lat: number, lng: number) => unknown;
type KakaoEventApi = {
  addListener: (target: unknown, type: string, handler: () => void) => void;
  removeListener: (target: unknown, type: string, handler: () => void) => void;
};
type PositionCircle = { setPosition: (position: unknown) => void };

export function bindKakaoScriptLoad(
  script: Pick<HTMLScriptElement, 'addEventListener' | 'removeEventListener'>,
  handler: () => void,
): () => void {
  script.addEventListener('load', handler);
  return () => script.removeEventListener('load', handler);
}

export function bindKakaoMapListener(
  event: KakaoEventApi,
  map: KakaoMapInstance,
  type: 'center_changed' | 'idle',
  handler: () => void,
): () => void {
  event.addListener(map, type, handler);
  return () => event.removeListener(map, type, handler);
}

export function createKakaoMapEventHandlers(
  map: KakaoMapInstance,
  LatLng: KakaoLatLngFactory,
  isAnalysisLocked: () => boolean,
  getAnalysisCoordinates: () => Coordinates | null,
  onPinChange: () => ((coords: Coordinates) => void) | undefined,
  getCircles: () => readonly PositionCircle[],
): { centerChanged: () => void; idle: () => void } {
  const centerChanged = () => {
    const coordinates = isAnalysisLocked() ? getAnalysisCoordinates() : null;
    const position = coordinates ? new LatLng(coordinates.lat, coordinates.lng) : map.getCenter();
    getCircles().forEach((circle) => circle.setPosition(position));
  };
  const idle = () => {
    if (isAnalysisLocked()) return;
    const center = map.getCenter();
    onPinChange()?.({ lat: center.getLat(), lng: center.getLng() });
  };
  return { centerChanged, idle };
}

interface AnalysisPinControl {
  overlay: { setMap: (map: KakaoMapInstance | null) => void; setPosition: (position: unknown) => void };
  element: HTMLElement;
}

const KAKAO_SDK_SRC = 'https://dapi.kakao.com/v2/maps/sdk.js';

export default function KakaoMap({ lat, lng, compact = false, label, onPinChange, facilityMarkers, lockAnalysisCoordinates = false }: KakaoMapProps) {
  const mapHeightClass = compact ? 'h-[220px] md:h-[460px]' : 'h-[clamp(180px,calc(100svh-160px),400px)] md:h-[460px]';
  const containerRef = useRef<HTMLDivElement>(null);
  const mapKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  const controlledCoordinates = normalizeCoordinates(lat, lng);
  
  const mapInstanceRef = useRef<KakaoMapInstance | null>(null);
  const primaryCircleRef = useRef<{ setPosition: (position: unknown) => void } | null>(null);
  const extendedCircleRef = useRef<{ setPosition: (position: unknown) => void } | null>(null);
  const analysisPinRef = useRef<AnalysisPinControl | null>(null);
  const [readyMap, setReadyMap] = useState<KakaoMapInstance | null>(null);
  const [sdkUnavailable, setSdkUnavailable] = useState(false);
  const hasInitializedGpsRef = useRef(false);
  const latestCoordinatesRef = useRef<Coordinates | null>(controlledCoordinates);
  const analysisCoordinatesRef = useRef<Coordinates | null>(controlledCoordinates);
  const analysisLockedRef = useRef(lockAnalysisCoordinates);
  const onPinChangeRef = useRef(onPinChange);
  latestCoordinatesRef.current = controlledCoordinates;
  analysisCoordinatesRef.current = controlledCoordinates;
  analysisLockedRef.current = lockAnalysisCoordinates;
  onPinChangeRef.current = onPinChange;

  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    if (!mapKey || readyMap) return;
    const timer = window.setTimeout(() => {
      if (!mapInstanceRef.current) setSdkUnavailable(true);
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [mapKey, readyMap]);

  const handleJumpSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    
    const kakao = window.kakao;
    const services = kakao?.maps?.services;
    
    if (!kakao || !services) {
      alert('지도 서비스가 아직 로드되지 않았습니다.');
      return;
    }

    const ps = new services.Places();
    ps.keywordSearch(keyword, (data, status) => {
      if (status === services.Status.OK && data.length > 0) {
        const target = normalizeCoordinates(Number(data[0].y), Number(data[0].x));
        if (!target) {
          alert('위치를 찾을 수 없습니다. 지하철역이나 동 이름을 입력해 주세요.');
          return;
        }
        moveToCoordinates(target);
      } else {
        alert('위치를 찾을 수 없습니다. 지하철역이나 동 이름을 입력해 주세요.');
      }
    });
  };

  function moveToCoordinates(coordinates: Coordinates): void {
    const map = mapInstanceRef.current;
    const kakao = window.kakao;
    if (!map || !kakao?.maps) return;

    syncMapCenter(map, coordinates, kakao.maps.LatLng);
    if (!analysisLockedRef.current) onPinChangeRef.current?.(coordinates);
  }

  useEffect(() => {
    if (!containerRef.current || !mapKey) return;
    if (mapInstanceRef.current) {
      setReadyMap(mapInstanceRef.current);
      return;
    }

    const scriptId = 'kakao-maps-sdk';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    let disposed = false;
    let releaseLoadListener = () => {};

    const initMap = () => {
      if (disposed || !window.kakao?.maps || !containerRef.current || mapInstanceRef.current) return;
      window.kakao.maps.load(() => {
        if (disposed || !containerRef.current || !window.kakao || mapInstanceRef.current) return;
        const { LatLng, Map } = window.kakao.maps;

        const container = containerRef.current;
        const initialCoordinates = latestCoordinatesRef.current;
        const initialLat = initialCoordinates?.lat ?? 37.497952;
        const initialLng = initialCoordinates?.lng ?? 127.027619;
        const center = new LatLng(initialLat, initialLng);

        // 1. Map Initialization
        const map = new Map(container, { center, level: 4 });
        map.setZoomable(true);
        map.setDraggable(true);
        map.relayout();
        mapInstanceRef.current = map;
        setReadyMap(map);

        // GPS auto-center runs only in the unlocked location-selection state.
        if (!initialCoordinates && navigator.geolocation && !hasInitializedGpsRef.current) {
          hasInitializedGpsRef.current = true;
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const coordinates = normalizeCoordinates(pos.coords.latitude, pos.coords.longitude);
              if (coordinates) moveToCoordinates(coordinates);
            },
            (err) => {
              console.warn('Geolocation failed or denied, sticking to default:', err);
              onPinChangeRef.current?.({ lat: initialLat, lng: initialLng });
            },
            { enableHighAccuracy: true, timeout: 5000 }
          );
        } else if (!initialCoordinates && !hasInitializedGpsRef.current) {
          hasInitializedGpsRef.current = true;
          onPinChangeRef.current?.({ lat: initialLat, lng: initialLng });
        }
      });
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `${KAKAO_SDK_SRC}?appkey=${mapKey}&autoload=false&libraries=services`;
      releaseLoadListener = bindKakaoScriptLoad(script, initMap);
      document.head.appendChild(script);
    } else if (window.kakao?.maps) {
      initMap();
    } else {
      releaseLoadListener = bindKakaoScriptLoad(script, initMap);
    }

    return () => {
      disposed = true;
      releaseLoadListener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapKey]); // Empty dependencies except mapKey to completely decouple from lat/lng prop changes

  useEffect(() => {
    const map = readyMap;
    const sdk = window.kakao?.maps;
    if (!map || !sdk) return;

    const center = map.getCenter();
    const primaryCircle = new sdk.Circle({
      map, center, radius: 300, strokeWeight: 2, strokeColor: '#10B981', strokeOpacity: 0.8,
      fillColor: '#10B981', fillOpacity: 0.15,
    });
    const extendedCircle = new sdk.Circle({
      map, center, radius: 800, strokeWeight: 2, strokeColor: '#3B82F6', strokeOpacity: 0.6,
      strokeStyle: 'dashed', fillColor: '#3B82F6', fillOpacity: 0.05,
    });
    primaryCircleRef.current = primaryCircle;
    extendedCircleRef.current = extendedCircle;
    const handlers = createKakaoMapEventHandlers(
      map,
      sdk.LatLng,
      () => analysisLockedRef.current,
      () => analysisCoordinatesRef.current,
      () => onPinChangeRef.current,
      () => [primaryCircleRef.current, extendedCircleRef.current].filter(
        (circle): circle is PositionCircle => circle !== null,
      ),
    );
    const releaseCenterChanged = bindKakaoMapListener(sdk.event, map, 'center_changed', handlers.centerChanged);
    const releaseIdle = bindKakaoMapListener(sdk.event, map, 'idle', handlers.idle);
    const handleResize = () => map.relayout();
    window.addEventListener('resize', handleResize);
    handlers.centerChanged();

    return () => {
      releaseCenterChanged();
      releaseIdle();
      window.removeEventListener('resize', handleResize);
      primaryCircle.setMap(null);
      extendedCircle.setMap(null);
      if (primaryCircleRef.current === primaryCircle) primaryCircleRef.current = null;
      if (extendedCircleRef.current === extendedCircle) extendedCircleRef.current = null;
      const pin = analysisPinRef.current;
      if (pin) {
        pin.overlay.setMap(null);
        analysisPinRef.current = null;
      }
    };
  }, [readyMap]);

  useEffect(() => {
    const map = readyMap;
    const sdk = window.kakao?.maps;
    const coordinates = normalizeCoordinates(lat, lng);
    if (!map || !sdk || !coordinates) return;

    const position = new sdk.LatLng(coordinates.lat, coordinates.lng);
    if (lockAnalysisCoordinates) {
      primaryCircleRef.current?.setPosition(position);
      extendedCircleRef.current?.setPosition(position);
      const existingPin = analysisPinRef.current;
      if (existingPin) {
        existingPin.overlay.setPosition(position);
        existingPin.element.setAttribute('aria-label', label ? `분석 위치 · ${label}` : '분석 위치');
      } else if (sdk.CustomOverlay) {
        const element = document.createElement('div');
        element.className = 'analysis-map-pin';
        element.textContent = '📍';
        element.setAttribute('role', 'img');
        element.setAttribute('aria-label', label ? `분석 위치 · ${label}` : '분석 위치');
        const overlay = new sdk.CustomOverlay({
          map, position, content: element, clickable: false, xAnchor: 0.5, yAnchor: 1, zIndex: 10,
        });
        analysisPinRef.current = { overlay, element };
      }
    } else if (analysisPinRef.current) {
      analysisPinRef.current.overlay.setMap(null);
      analysisPinRef.current = null;
    }
    syncMapCenter(map, coordinates, sdk.LatLng);
  }, [readyMap, lat, lng, lockAnalysisCoordinates, label]);

  useEffect(() => {
    const map = readyMap;
    if (!map) return;
    const frame = window.requestAnimationFrame(() => map.relayout());
    return () => window.cancelAnimationFrame(frame);
  }, [compact, readyMap]);

  function handleGpsClick() {
    if (!navigator.geolocation || !window.kakao?.maps) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coordinates = normalizeCoordinates(pos.coords.latitude, pos.coords.longitude);
        if (coordinates) moveToCoordinates(coordinates);
      },
      (err) => {
        alert('GPS 권한을 허용해주세요.');
      },
      { enableHighAccuracy: true }
    );
  }
  
  if (!mapKey) {
    return (
      <div className={`w-full ${mapHeightClass} rounded-2xl overflow-hidden glass-card relative`}>
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(99,102,241,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.4) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
          <div className="absolute bottom-3 left-0 right-0 flex justify-center">
            <span className="text-xs text-slate-500 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700">지도 미리보기 — NEXT_PUBLIC_KAKAO_MAP_KEY 설정 필요</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${mapHeightClass} rounded-2xl overflow-hidden glass-card relative touch-pan-x touch-pan-y shadow-lg`}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {!readyMap && <div role="status" className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900 p-4 text-center text-sm text-slate-300">
        {sdkUnavailable ? '지도를 불러오지 못했습니다. 분석 결과는 아래에서 확인할 수 있습니다.' : '지도를 불러오는 중입니다.'}
      </div>}
      {compact && readyMap && facilityMarkers && facilityMarkers.length > 0 && (
        <FacilityMapLayer map={readyMap} markers={facilityMarkers} />
      )}

      {/* Floating Search Bar */}
      <div className="absolute top-4 left-4 right-4 md:left-6 md:right-auto md:w-80 z-20">
        <form 
          onSubmit={handleJumpSearch}
          className="bg-slate-900/90 backdrop-blur-md border border-slate-700/60 text-white rounded-xl px-4 py-2.5 shadow-xl flex items-center gap-2"
        >
          <Search size={18} className="text-slate-400 shrink-0" />
          <input 
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="동네나 지하철역 검색 (예: 신림역)"
            className="bg-transparent border-none outline-none w-full text-sm placeholder:text-slate-300 focus:ring-0"
          />
          {keyword && (
            <button 
              type="button" 
              onClick={() => setKeyword('')}
              className="text-slate-400 hover:text-white transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          )}
        </form>
      </div>

      {/* Location-selection pin follows the viewport only while analysis is unlocked. */}
      {!lockAnalysisCoordinates && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none z-10 flex flex-col items-center">
          <MapPin size={42} className="text-brand-500 fill-brand-600 drop-shadow-lg" />
          <div className="w-3 h-1 bg-black/40 rounded-[100%] blur-[1.5px] mt-0.5 animate-pulse" />
          {label && (
            <div className="absolute bottom-[48px] px-2.5 py-1 text-xs whitespace-nowrap bg-slate-800 text-white rounded-md border border-slate-700 shadow-md">
              {label}
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 border-b border-r border-slate-700 rotate-45" />
            </div>
          )}
        </div>
      )}

      {/* Floating Controls */}
      <div className="absolute top-20 md:top-4 right-4 z-10 flex flex-col gap-2">
        <div className="flex flex-col bg-slate-800/90 border border-slate-700 rounded-lg overflow-hidden shadow-lg backdrop-blur-md">
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.setLevel(mapInstanceRef.current.getLevel() - 1, { animate: true })}
            className="p-2.5 text-slate-300 hover:text-white hover:bg-slate-700 active:bg-slate-600 transition-colors border-b border-slate-700 flex items-center justify-center"
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.setLevel(mapInstanceRef.current.getLevel() + 1, { animate: true })}
            className="p-2.5 text-slate-300 hover:text-white hover:bg-slate-700 active:bg-slate-600 transition-colors flex items-center justify-center"
          >
            <Minus size={18} />
          </button>
        </div>
        <button
          type="button"
          onClick={handleGpsClick}
          className="p-2.5 bg-slate-800/90 border border-slate-700 rounded-lg shadow-lg text-slate-300 hover:text-white hover:bg-slate-700 active:bg-slate-600 transition-colors backdrop-blur-md flex items-center justify-center"
        >
          <Navigation size={18} />
        </button>
      </div>
    </div>
  );
}
