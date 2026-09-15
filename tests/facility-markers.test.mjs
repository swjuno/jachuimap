import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import {
  buildFacilityMarkers,
  getDisplayedFacilityMarkers,
  getFacilityMarkerZIndex,
  MAX_FACILITY_MARKERS,
} from '../lib/facility-markers.ts';
import { fetchInfrastructureData } from '../lib/kakao.ts';
import { parseFacilityDistance } from '../lib/facility-distance.ts';
import { calculateTotalScore } from '../lib/scoring.ts';
import { GET } from '../app/api/score/route.ts';

const place = (id, distance, overrides = {}) => ({
  id, distance: String(distance), place_name: id, x: '127', y: '37',
  road_address_name: 'MUST NOT LEAK', phone: 'MUST NOT LEAK', ...overrides,
});

test('facility payload whitelists seven fields, validates coordinates and sorts distance', () => {
  const markers = buildFacilityMarkers([{ category: 'cafe', used: () => false,
    documents: [place('far', 300), place('near', 30), place('zero', 0), place('bad', 2, { y: '91' }),
      place('blank', 1, { x: '' }), place('negative', -1), place('nan', NaN), place('null', 1, { distance: null }),
      place('empty-distance', 1, { distance: '' }), place('space-distance', 1, { distance: '  ' }),
      place('infinite-distance', 1, { distance: 'Infinity' }), place('text-distance', 1, { distance: '100m' }), null] }]);
  assert.deepEqual(markers.map(m => m.id), ['zero', 'near', 'far']);
  assert.equal(parseFacilityDistance(0), 0);
  assert.equal(parseFacilityDistance(' 0 '), 0);
  for (const invalid of [null, undefined, '', '  ', -1, NaN, Infinity, 'Infinity', '100m']) {
    assert.equal(parseFacilityDistance(invalid), null);
  }
  assert.deepEqual(Object.keys(markers[0]).sort(), ['id', 'name', 'category', 'lat', 'lng', 'distance', 'usedForScore'].sort());
  assert.doesNotMatch(JSON.stringify(markers), /MUST NOT LEAK|phone|address|rawDebug/);
  assert.deepEqual(buildFacilityMarkers([]), []);
  assert.deepEqual(buildFacilityMarkers([{ category: 'cafe', documents: null, used: () => true }]), []);
});

test('facility deduplication is stable across IDs and name/coordinate duplicates', () => {
  const groups = [
    { category: 'medical', documents: [place('same', 20)], used: () => false },
    { category: 'medical', documents: [place('same', 20), place('other-id', 20, { place_name: 'same' })], used: () => true },
  ];
  const markers = buildFacilityMarkers(groups);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].usedForScore, true);
  assert.deepEqual(buildFacilityMarkers(groups), markers);
});

test('marker cap reserves category evidence and prioritizes used facilities then proximity', () => {
  const markers = buildFacilityMarkers([
    { category: 'cafe', documents: Array.from({ length: 50 }, (_, i) => place('cafe' + i, i + 1)), used: d => Number(d.distance) >= 10 },
    { category: 'subway', documents: [place('station', 900)], used: () => true },
  ]);
  assert.equal(markers.length, MAX_FACILITY_MARKERS);
  assert.ok(markers.some(m => m.id === 'station'));
  assert.ok(markers.every(m => m.usedForScore));
  assert.deepEqual(markers.map(m => m.distance), [...markers.map(m => m.distance)].sort((a, b) => a - b));
  assert.ok(markers.some(m => m.id === 'cafe9'));
  assert.ok(!markers.some(m => m.id === 'cafe49'));
});

test('default marker display contains only score evidence and all-facility mode remains capped', () => {
  const markers = buildFacilityMarkers([
    { category: 'cafe', documents: Array.from({ length: 35 }, (_, i) => place(`cafe-${i}`, i)), used: doc => doc.id === 'cafe-0' },
    { category: 'subway', documents: [place('station', 900)], used: () => true },
  ]);
  assert.deepEqual(getDisplayedFacilityMarkers(markers, false).map((marker) => marker.id), ['cafe-0', 'station']);
  assert.equal(getDisplayedFacilityMarkers(markers, true).length, MAX_FACILITY_MARKERS);
  assert.equal(getFacilityMarkerZIndex(markers[0], null), markers[0].usedForScore ? 3 : 2);
  assert.equal(getFacilityMarkerZIndex(markers[0], markers[0].id), 8);
});

test('all eleven facility categories survive the thirty-marker cap', () => {
  const categories = ['subway', 'cvs', 'laundry', 'mart', 'daiso', 'deptStore', 'cinema', 'cafe', 'oliveYoung', 'gym', 'medical'];
  const markers = buildFacilityMarkers(categories.map((category, categoryIndex) => ({
    category,
    documents: Array.from({ length: 4 }, (_, index) => place(
      `${category}-${index}`,
      categoryIndex * 10 + index,
      { y: String(36 + categoryIndex / 10 + index / 1000) },
    )),
    used: doc => doc.id.endsWith('-0'),
  })));
  assert.equal(markers.length, MAX_FACILITY_MARKERS);
  assert.deepEqual(new Set(markers.map((marker) => marker.category)), new Set(categories));
  assert.equal(getDisplayedFacilityMarkers(markers, false).length, categories.length);
});

test('score evidence selects only decisive representatives with deterministic ties', async t => {
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });
  globalThis.fetch = async input => {
    const query = new URL(input).searchParams;
    const kind = query.get('query') || query.get('category_group_code');
    const documents = {
      SW8: [place('station-b', 100, { place_name: '역B' }), place('station-a', 100, { place_name: '역A' })],
      CS2: [
        place('gs-near', 90, { place_name: 'GS25 가까운점' }),
        place('gs-extra', 110, { place_name: 'GS25 추가점', y: '37.02' }),
        place('cu-near', 100, { place_name: 'CU 가까운점', y: '37.04' }),
        place('seven-extra', 120, { place_name: '세븐일레븐 추가점', y: '37.06' }),
        place('emart24-extra', 130, { place_name: '이마트24 추가점', y: '37.08' }),
      ],
      코인빨래방: [place('laundry-far', 80), place('laundry-near', 30)],
      다이소: [place('daiso-far', 120, { place_name: '다이소 먼점' }), place('daiso-near', 70, { place_name: '다이소 가까운점' })],
      MT1: [place('mart-near', 50, { place_name: '이마트 가까운점' }), place('mart-extra', 110, { place_name: '홈플러스 추가점' })],
      백화점: [place('dept-far', 500, { place_name: '롯데백화점 먼점' }), place('dept-near', 200, { place_name: '롯데백화점 가까운점' })],
      영화관: [place('cinema-far', 600, { place_name: 'CGV 먼점' }), place('cinema-near', 200, { place_name: 'CGV 가까운점' })],
      CE7: [place('cafe-near', 50, { place_name: '일반 카페' }), place('starbucks-near', 100, { place_name: '스타벅스 가까운점' }), place('cafe-extra', 120, { place_name: '추가 카페' })],
      올리브영: [place('olive-near', 80, { place_name: '올리브영 가까운점' }), place('olive-extra', 100, { place_name: '올리브영 추가점' })],
      헬스장: [place('gym-near', 60, { place_name: '헬스장 가까운점' }), place('gym-extra', 90, { place_name: '헬스장 추가점' })],
      PM9: [place('pharmacy-near', 100, { place_name: '약국 가까운점' })],
      HP8: [place('hospital-near', 50, { place_name: '병원 가까운점' })],
    }[kind] || [];
    return Response.json({ documents, meta: { is_end: true } });
  };

  const infra = await fetchInfrastructureData(37, 127, 'test-key');
  const evidence = infra.facilityMarkers.filter((marker) => marker.usedForScore).map((marker) => marker.id).sort();
  assert.deepEqual(evidence, [
    'cafe-near', 'cinema-near', 'cu-near', 'daiso-near', 'dept-near', 'gs-near',
    'gym-near', 'hospital-near', 'laundry-near', 'mart-near', 'olive-near', 'starbucks-near', 'station-a',
  ].sort());
  assert.ok(!evidence.includes('gs-extra'));
  assert.ok(!evidence.includes('seven-extra'));
  assert.ok(!evidence.includes('emart24-extra'));
  assert.ok(!evidence.includes('laundry-far'));
  assert.ok(!evidence.includes('cafe-extra'));
  assert.equal(infra.facilityMarkers.length <= MAX_FACILITY_MARKERS, true);
});

test('facilities that do not affect a zero score are not score evidence', async t => {
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });
  globalThis.fetch = async input => {
    const kind = new URL(input).searchParams.get('query') || new URL(input).searchParams.get('category_group_code');
    const documents = kind === 'CS2'
      ? [place('far-gs', 500, { place_name: 'GS25 먼점' }), place('far-cu', 550, { place_name: 'CU 먼점' })]
      : kind === 'CE7'
        ? [place('far-starbucks', 500, { place_name: '스타벅스 먼점' })]
        : kind === 'SW8'
          ? [place('far-station', 1200, { place_name: '먼역' })]
          : [];
    return Response.json({ documents, meta: { is_end: true } });
  };
  const infra = await fetchInfrastructureData(37, 127, 'test-key');
  assert.ok(infra.facilityMarkers.length > 0);
  assert.ok(infra.facilityMarkers.every((marker) => !marker.usedForScore));
});

test('invalid-distance facilities cannot displace a valid scoring representative', async t => {
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });
  globalThis.fetch = async input => {
    const kind = new URL(input).searchParams.get('query') || new URL(input).searchParams.get('category_group_code');
    const documents = kind === 'CS2'
      ? [place('blank-gs', 0, { distance: '', place_name: 'GS25 빈거리점' }), place('valid-cu', 100, { place_name: 'CU 정상점' })]
      : [];
    return Response.json({ documents, meta: { is_end: true } });
  };
  const infra = await fetchInfrastructureData(37, 127, 'test-key');
  assert.equal(infra.cvs.nearestDist, 100);
  assert.equal(infra.facilityMarkers.find((marker) => marker.id === 'blank-gs'), undefined);
  assert.equal(infra.facilityMarkers.find((marker) => marker.id === 'valid-cu')?.usedForScore, true);
  assert.equal(calculateTotalScore(infra).convenience.score, 10);
});

test('one nearest Starbucks represents both cafe base and Starbucks bonus without duplication', async t => {
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });
  globalThis.fetch = async input => {
    const query = new URL(input).searchParams;
    const kind = query.get('query') || query.get('category_group_code');
    const documents = kind === 'CE7'
      ? [place('starbucks-nearest', 80, { place_name: '스타벅스 가까운점' }), place('cafe-extra', 120, { place_name: '일반 카페' })]
      : [];
    return Response.json({ documents, meta: { is_end: true } });
  };
  const infra = await fetchInfrastructureData(37, 127, 'test-key');
  assert.deepEqual(infra.facilityMarkers.filter((marker) => marker.usedForScore).map((marker) => marker.id), ['starbucks-nearest']);
});

test('real aggregation preserves filters and score, keeps development debug data and makes only 12 searches', async t => {
  const oldFetch = globalThis.fetch, oldNodeEnv = process.env.NODE_ENV;
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNodeEnv;
  });
  process.env.NODE_ENV = 'development';
  let calls = 0;
  globalThis.fetch = async input => {
    calls++;
    const q = new URL(input).searchParams;
    const kind = q.get('query') || q.get('category_group_code');
    const documents = kind === 'SW8' ? [place('역', 300, { place_name: '강남역' })]
      : kind === 'CE7' ? [place('coffee', 100), place('starbucks', 250, { place_name: '스타벅스' }), place('other', 300)]
      : kind === '다이소' ? [place('banned', 10, { place_name: '다이소 부동산' }), place('daiso', 200, { place_name: '다이소' })]
      : [];
    return Response.json({ documents, meta: { is_end: true } });
  };
  const infra = await fetchInfrastructureData(37, 127, 'test-key');
  assert.equal(calls, 12);
  assert.equal(infra.rawDebugData?.daisoRaw[0]?.id, 'banned');
  assert.deepEqual(Object.keys(infra.rawDebugData ?? {}).sort(), [
    'cvsDedup', 'cvsRaw', 'daisoDedup', 'daisoRaw', 'martDedup', 'martRaw',
  ]);
  assert.equal(infra.facilityMarkers.find(m => m.id === 'banned'), undefined);
  assert.equal(infra.facilityMarkers.find(m => m.id === 'other').usedForScore, false);
  assert.equal(infra.facilityMarkers.find(m => m.id === 'starbucks').usedForScore, true);
  const { facilityMarkers, ...withoutMarkers } = infra;
  assert.deepEqual(calculateTotalScore(infra), calculateTotalScore(withoutMarkers));
});

test('API demo never invents marker locations and empty/failure responses stay distinct', async t => {
  const oldKey = process.env.KAKAO_REST_API_KEY, oldFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.KAKAO_REST_API_KEY; else process.env.KAKAO_REST_API_KEY = oldKey;
  });
  delete process.env.KAKAO_REST_API_KEY;
  globalThis.fetch = async () => { throw new Error('must not fetch for demo'); };
  const request = () => new Request('http://localhost/api/score?lat=37&lng=127');
  const demo = await (await GET(request())).json();
  assert.equal(demo._isMock, true);
  assert.deepEqual(demo.infrastructure.facilityMarkers, []);
  assert.equal(demo.tier.score, 90);
  process.env.KAKAO_REST_API_KEY = 'test-key';
  globalThis.fetch = async () => Response.json({ documents: [], meta: { is_end: true } });
  const empty = await GET(request());
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).infrastructure.facilityMarkers, []);
  globalThis.fetch = async () => { throw new Error('failure'); };
  const failed = await GET(request());
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).infrastructure, undefined);
});

test('facility overlay helpers clean up overlay controls without raw HTML', async () => {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const source = await readFile(new URL('../components/FacilityMapLayer.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  let layoutEffect, selected = null;
  const overlays = [];
  const react = {
    useLayoutEffect: fn => { layoutEffect = fn; },
    useEffect: fn => { fn(); },
    useMemo: fn => fn(),
    useState: initial => initial === false ? [false, () => {}] : [selected, value => { selected = value; }],
    useRef: initial => ({ current: initial }),
  };
  const module = { exports: {} };
  runInNewContext(code, {
    exports: module.exports, module,
    require: name => {
      if (name === 'react') return react;
      if (name === '@/lib/facility-markers') return { getDisplayedFacilityMarkers, getFacilityMarkerZIndex };
      if (name.startsWith('@/types/') || name === '@/components/KakaoMap') return {};
      return require(name);
    },
    document: { createElement: () => ({ style: {}, setAttribute() {}, classList: { toggle() {} } }) },
    window: { kakao: { maps: {
      LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } },
      CustomOverlay: class {
        constructor(opts) { Object.assign(this, opts); overlays.push(this); }
        setMap(map) { this.map = map; }
        setPosition(position) { this.position = position; }
        setZIndex(zIndex) { this.zIndex = zIndex; }
      },
    } } },
  });
  const render = module.exports.default;
  const panToFacilityMarkerIfHidden = module.exports.panToFacilityMarkerIfHidden;
  const markers = buildFacilityMarkers([{ category: 'cafe', documents: [place('<img onerror=x>', 10)], used: () => true }]);
  const map = {};
  const tree = render({ map, markers });
  let cleanup = layoutEffect();
  assert.equal(overlays.length, 1);
  assert.equal(overlays[0].content.innerHTML, undefined);
  overlays[0].content.onclick();
  assert.equal(selected, markers[0].id);
  selected = null;
  const findByType = (node, type) => {
    if (!node || typeof node !== 'object') return null;
    if (node.type === type) return node;
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = findByType(child, type);
      if (found) return found;
    }
    return null;
  };
  const selector = findByType(tree, 'select');
  assert.ok(selector);
  selector.props.onChange({ target: { value: markers[0].id } });
  assert.equal(selected, markers[0].id);
  const pans = [];
  const visibleMap = { getBounds: () => ({ contain: () => true }), panTo: position => pans.push(position) };
  const hiddenMap = { getBounds: () => ({ contain: () => false }), panTo: position => pans.push(position) };
  panToFacilityMarkerIfHidden(visibleMap, markers[0]);
  assert.equal(pans.length, 0);
  panToFacilityMarkerIfHidden(hiddenMap, markers[0]);
  assert.equal(pans.length, 1);
  assert.equal(pans[0].lat, markers[0].lat);
  assert.equal(pans[0].lng, markers[0].lng);
  cleanup();
  assert.equal(overlays[0].map, null);
  assert.equal(overlays[0].content.onclick, null);
  cleanup = layoutEffect(); // Strict Mode setup replay
  assert.equal(overlays.filter(o => o.map).length, 1);
  cleanup();
  render({ map, markers: [] });
  layoutEffect();
  assert.equal(overlays.filter(o => o.map).length, 0);
  assert.equal(selected, null);
  assert.match(source, /aria-current=/);
  assert.match(source, /aria-pressed=/);
  assert.match(source, /min-h-11/);
  assert.match(source, /getDisplayedFacilityMarkers\(markers, showAll\)/);
});

test('Kakao map lifecycle callbacks keep locked analysis coordinates and clean up listeners', async () => {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const source = await readFile(new URL('../components/KakaoMap.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  runInNewContext(code, {
    exports: module.exports, module,
    require: name => {
      if (name === 'react') return { useEffect() {}, useRef: initial => ({ current: initial }), useState: initial => [initial, () => {}] };
      if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
      if (name === 'lucide-react') return { MapPin() {}, Plus() {}, Minus() {}, Navigation() {}, Search() {}, X() {} };
      if (name === '@/lib/coordinates') return { normalizeCoordinates: (lat, lng) => ({ lat, lng }), syncMapCenter() {} };
      if (name === '@/components/FacilityMapLayer') return () => null;
      if (name.startsWith('@/types/')) return {};
      return require(name);
    },
  });
  const { bindKakaoMapListener, bindKakaoScriptLoad, createKakaoMapEventHandlers, restoreKakaoMapViewport } = module.exports;
  const listeners = new Map();
  const event = {
    addListener: (_target, type, handler) => listeners.set(type, handler),
    removeListener: (_target, type, handler) => { if (listeners.get(type) === handler) listeners.delete(type); },
  };
  let locked = true;
  let analysisCoordinates = { lat: 37, lng: 127 };
  let center = { getLat: () => 37.5, getLng: () => 127.5 };
  const map = { getCenter: () => center };
  const pinChanges = [];
  const circlePositions = [];
  class LatLng { constructor(lat, lng) { this.lat = lat; this.lng = lng; } }
  const handlers = createKakaoMapEventHandlers(
    map,
    LatLng,
    () => locked,
    () => analysisCoordinates,
    () => coords => pinChanges.push(coords),
    () => [{ setPosition: position => circlePositions.push(position) }],
  );
  const releaseCenter = bindKakaoMapListener(event, map, 'center_changed', handlers.centerChanged);
  const releaseIdle = bindKakaoMapListener(event, map, 'idle', handlers.idle);
  listeners.get('center_changed')();
  listeners.get('idle')();
  assert.equal(circlePositions[0].lat, 37);
  assert.equal(circlePositions[0].lng, 127);
  assert.equal(pinChanges.length, 0);

  center = { getLat: () => 36, getLng: () => 126 };
  listeners.get('center_changed')(); // Facility pan/manual result-map movement.
  listeners.get('idle')();
  assert.equal(circlePositions[1].lat, 37);
  assert.equal(circlePositions[1].lng, 127);
  assert.equal(pinChanges.length, 0);

  locked = false;
  listeners.get('center_changed')();
  listeners.get('idle')();
  assert.equal(circlePositions[2], center);
  assert.equal(pinChanges.length, 1);
  assert.equal(pinChanges[0].lat, 36);
  assert.equal(pinChanges[0].lng, 126);

  releaseCenter();
  releaseIdle();
  assert.equal(listeners.size, 0);

  const restored = { relayouts: 0, centers: [] };
  const restoredCircles = [];
  const restoredPins = [];
  const restoreMap = {
    relayout: () => { restored.relayouts++; },
    setCenter: position => restored.centers.push(position),
  };
  restoreKakaoMapViewport(
    restoreMap,
    LatLng,
    analysisCoordinates,
    [{ setPosition: position => restoredCircles.push(position) }],
    { setPosition: position => restoredPins.push(position) },
  );
  assert.equal(restored.relayouts, 1);
  assert.deepEqual({ lat: restored.centers[0].lat, lng: restored.centers[0].lng }, analysisCoordinates);
  assert.equal(restoredCircles[0], restored.centers[0]);
  assert.equal(restoredPins[0], restored.centers[0]);
  restoreKakaoMapViewport(restoreMap, LatLng, null, [], null);
  assert.equal(restored.relayouts, 2);
  assert.equal(restored.centers.length, 1);
  const scriptListeners = new Set();
  const script = {
    addEventListener: (_type, handler) => scriptListeners.add(handler),
    removeEventListener: (_type, handler) => scriptListeners.delete(handler),
  };
  let scriptLoads = 0;
  const releaseScript = bindKakaoScriptLoad(script, () => { scriptLoads++; });
  releaseScript();
  for (const handler of scriptListeners) handler();
  assert.equal(scriptLoads, 0);
  assert.match(source, /lockAnalysisCoordinates/);
  assert.match(source, /analysis-map-pin/);
});

test('page wires one result map with locked analysis coordinates', async () => {
  const source = await readFile(new URL('../app/(main)/page.tsx', import.meta.url), 'utf8');
  assert.equal((source.match(/<KakaoMap/g) ?? []).length, 1);
  assert.match(source, /facilityMarkers=\{appState === 'result' && !result\?\._isMock/);
  assert.match(source, /lockAnalysisCoordinates=\{appState === 'result' && Boolean\(result\)\}/);
  assert.ok(source.indexOf('setResult(null)') < source.indexOf("setAppState('scanning')"));
  assert.match(source, /handleSearch\(coords.lat, coords.lng, 'shared_link'\)/);
  assert.match(source, /handleSearch\(lastRequest.lat, lastRequest.lng, 'manual'\)/);
  assert.match(source, /mobileFullScreen=\{isMobile && mobileShowsMap\}/);
  assert.match(source, /setMobileResultSurface\('facility-map'\)/);
  assert.match(source, /setMobileResultSurface\('result'\)/);
  assert.match(source, /← 결과로 돌아가기/);
});
