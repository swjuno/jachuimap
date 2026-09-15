/**
 * lib/kakao.ts
 * Server-side Kakao Local Search API helpers.
 *
 * The `server-only` import causes a build-time error if this module is ever
 * imported from a Client Component — keeping the REST key off the browser.
 */
import 'server-only';

import { getStationMeta } from '@/data/subway-lines';
import { parseFacilityDistance } from '@/lib/facility-distance';
import { buildFacilityMarkers } from '@/lib/facility-markers';
import { getFacilityScoreEvidence } from '@/lib/scoring';
import type { InfrastructureData, SubwayInfo, PlaceDoc } from '@/types/score';

// ---------------------------------------------------------------------------
// Kakao API response shapes (minimal — only fields we consume)
// ---------------------------------------------------------------------------

interface KakaoDocument {
  /** Kakao Place ID */
  id: string;
  /** Establishment / place name */
  place_name: string;
  /** Category group code, e.g. "SW8" */
  category_group_code: string;
  /** Full category path separated by " > " */
  category_name: string;
  /** Longitude string (x) */
  x: string;
  /** Latitude string (y) */
  y: string;
  /** Straight-line distance from query centre in metres (string) */
  distance: string;
  /** Road address */
  road_address_name: string;
}

interface KakaoAddressDocument {
  address_name: string;
  address_type: 'REGION' | 'ROAD' | 'REGION_ADDR' | 'ROAD_ADDR';
  x: string; // longitude
  y: string; // latitude
  address: {
    address_name: string;
    region_1depth_name: string;
    region_2depth_name: string;
    region_3depth_name: string;
    main_address_no: string;
    sub_address_no: string;
    zip_code: string;
  } | null;
  road_address: {
    address_name: string;
    region_1depth_name: string;
    region_2depth_name: string;
    road_name: string;
    main_building_no: string;
    sub_building_no: string;
    building_name: string;
    zone_no: string;
  } | null;
}

interface KakaoLocalResponse {
  meta: { total_count: number; pageable_count: number; is_end: boolean };
  documents: KakaoDocument[];
}

// Kakao Local exposes at most 45 pageable results with a maximum page size of
// 15. Three pages therefore cover the complete pageable window while keeping
// the per-query request count bounded.
const KAKAO_PAGE_SIZE = 15;
const MAX_SEARCH_PAGES = 3;

interface KakaoAddressResponse {
  meta: { total_count: number };
  documents: KakaoAddressDocument[];
}

export type InfrastructureCategory =
  | 'subway' | 'cvs' | 'daiso' | 'oliveYoung' | 'laundry' | 'cafe'
  | 'mart' | 'deptStore' | 'cinema' | 'gym' | 'pharmacy' | 'hospital';

export type InfrastructureQueryResult =
  | { category: InfrastructureCategory; status: 'success'; documents: KakaoDocument[] }
  | { category: InfrastructureCategory; status: 'failure'; cause: unknown };

export class InfrastructureLookupError extends Error {
  readonly queries: readonly InfrastructureQueryResult[];

  constructor(queries: readonly InfrastructureQueryResult[]) {
    super('Required infrastructure queries failed');
    this.name = 'InfrastructureLookupError';
    this.queries = queries;
  }
}

async function captureQuery(
  category: InfrastructureCategory,
  query: Promise<KakaoDocument[]>,
): Promise<InfrastructureQueryResult> {
  try {
    const documents = await query;
    if (!Array.isArray(documents)) throw new Error('Invalid Kakao documents response');
    return { category, status: 'success', documents };
  } catch (cause: unknown) {
    return { category, status: 'failure', cause };
  }
}

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------

export interface GeoResult {
  lat: number;
  lng: number;
  roadAddress: string;
  region: string;
}

/**
 * Convert a Korean address string to coordinates.
 * Returns null when the address cannot be resolved.
 */
export async function geocodeAddress(
  address: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<GeoResult | null> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json');
  url.searchParams.set('query', address);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${apiKey}` },
    // Do not cache geocoding results — address data can change
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4_000)]) : AbortSignal.timeout(4_000),
  });

  if (!res.ok) {
    throw new Error(`Kakao geocode failed: ${res.status} ${res.statusText}`);
  }

  const data: KakaoAddressResponse = await res.json();

  if (data.documents.length === 0) {
    // Fallback to keyword search (e.g., for queries like "신림역 9출 방면")
    const kwUrl = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
    kwUrl.searchParams.set('query', address);
    kwUrl.searchParams.set('page', '1');
    kwUrl.searchParams.set('size', String(KAKAO_PAGE_SIZE));
    // Preserve Kakao's relevance ordering for address resolution.
    kwUrl.searchParams.set('sort', 'accuracy');

    const kwRes = await fetch(kwUrl.toString(), {
      headers: { Authorization: `KakaoAK ${apiKey}` },
      cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4_000)]) : AbortSignal.timeout(4_000),
    });

    if (!kwRes.ok) {
      throw new Error(`Kakao geocode keyword search failed: ${kwRes.status} ${kwRes.statusText}`);
    }

    const kwData: KakaoLocalResponse = await kwRes.json();
    if (kwData.documents.length === 0) return null;

    const kwDoc = kwData.documents[0];
    return {
      lat: parseFloat(kwDoc.y),
      lng: parseFloat(kwDoc.x),
      roadAddress: kwDoc.road_address_name || kwDoc.place_name || address,
      region: '',
    };
  }

  const doc = data.documents[0];
  const lat = parseFloat(doc.y);
  const lng = parseFloat(doc.x);

  const roadAddress =
    doc.road_address?.address_name ?? doc.address?.address_name ?? address;

  const region =
    doc.road_address
      ? `${doc.road_address.region_1depth_name} ${doc.road_address.region_2depth_name}`
      : doc.address
        ? `${doc.address.region_1depth_name} ${doc.address.region_2depth_name}`
        : '';

  return { lat, lng, roadAddress, region };
}

// ---------------------------------------------------------------------------
// Category search (e.g. SW8 = subway, CS2 = convenience store, MT1 = mart)
// ---------------------------------------------------------------------------

/**
 * Kakao Local category search within `radius` metres (straight-line, 직선거리).
 */
export async function searchCategory(
  x: number,
  y: number,
  categoryCode: string,
  radius: number,
  apiKey: string,
  signal?: AbortSignal,
): Promise<KakaoDocument[]> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/category.json');
  url.searchParams.set('category_group_code', categoryCode);
  url.searchParams.set('x', String(x));
  url.searchParams.set('y', String(y));
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('size', String(KAKAO_PAGE_SIZE));
  url.searchParams.set('sort', 'distance');

  return fetchSearchPages(
    url,
    apiKey,
    `Kakao category search (${categoryCode})`,
    signal,
  );
}

// ---------------------------------------------------------------------------
// Keyword search (e.g. "스타벅스", "다이소")
// ---------------------------------------------------------------------------

/**
 * Kakao Local keyword search within `radius` metres (straight-line, 직선거리).
 */
export async function searchKeyword(
  x: number,
  y: number,
  keyword: string,
  radius: number,
  apiKey: string,
  signal?: AbortSignal,
): Promise<KakaoDocument[]> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  url.searchParams.set('query', keyword);
  url.searchParams.set('x', String(x));
  url.searchParams.set('y', String(y));
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('size', String(KAKAO_PAGE_SIZE));
  url.searchParams.set('sort', 'distance');

  return fetchSearchPages(
    url,
    apiKey,
    `Kakao keyword search ("${keyword}")`,
    signal,
  );
}

async function fetchSearchPages(
  url: URL,
  apiKey: string,
  description: string,
  signal?: AbortSignal,
): Promise<KakaoDocument[]> {
  const documents: KakaoDocument[] = [];

  for (let page = 1; page <= MAX_SEARCH_PAGES; page += 1) {
    url.searchParams.set('page', String(page));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `KakaoAK ${apiKey}` },
      cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4_000)]) : AbortSignal.timeout(4_000),
    });

    if (!res.ok) {
      throw new Error(`${description} failed: ${res.status} ${res.statusText}`);
    }

    const data: KakaoLocalResponse = await res.json();
    if (!Array.isArray(data?.documents)) {
      throw new Error(`${description} returned an invalid documents response`);
    }

    documents.push(...data.documents);

    const isEnd = data.meta?.is_end ?? true;
    if (isEnd) break;

    const pageableCount = data.meta?.pageable_count;
    if (Number.isFinite(pageableCount) && page * KAKAO_PAGE_SIZE >= pageableCount) {
      break;
    }
  }

  return sortByDistance(documents);
}

function parseDistance(doc: KakaoDocument): number | null {
  return parseFacilityDistance(doc.distance);
}

function filterDocumentsWithValidDistance(documents: KakaoDocument[]): KakaoDocument[] {
  return documents.filter((document) => parseDistance(document) !== null);
}

function sortByDistance(docs: KakaoDocument[]): KakaoDocument[] {
  return docs
    .map((doc, index) => ({ doc, index, distance: parseDistance(doc) }))
    .sort((a, b) => {
      if (a.distance === null && b.distance === null) return a.index - b.index;
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance || a.index - b.index;
    })
    .map(({ doc }) => doc);
}

// ---------------------------------------------------------------------------
// Subway parser helper
// ---------------------------------------------------------------------------

/**
 * Extract the bare station name from a Kakao `place_name` like "강남역".
 * Strips trailing "역" so it can be looked up in STATION_META.
 */
function parseStationName(placeName: string): string {
  return placeName.trim().replace(/역$/, '');
}

/**
 * Parse the first subway result into a SubwayInfo object.
 */
function buildSubwayInfo(docs: KakaoDocument[]): SubwayInfo {
  if (docs.length === 0) {
    return { exists: false, distanceMetres: null, stationName: null, lines: [], hasExpress: false };
  }

  const nearest = nearestDocument(docs) ?? docs[0];
  const stationName = parseStationName(nearest.place_name);
  const distanceMetres = parseDistance(nearest);
  const meta = getStationMeta(stationName);

  return {
    exists: true,
    distanceMetres,
    stationName,
    lines: meta.lines,
    hasExpress: meta.isExpress,
  };
}

// ---------------------------------------------------------------------------
// Distance helper
// ---------------------------------------------------------------------------

function getNearestDist(...docArrays: KakaoDocument[][]): number | null {
  let min = Infinity;
  for (const docs of docArrays) {
    for (const doc of docs) {
      const dist = parseDistance(doc);
      if (dist !== null && dist < min) min = dist;
    }
  }
  return min === Infinity ? null : min;
}

function documentKey(doc: PlaceDoc): string {
  const id = doc.id.trim();
  return id || `${doc.place_name.trim()}:${doc.y}:${doc.x}`;
}

function compareDocuments(a: PlaceDoc, b: PlaceDoc): number {
  const aDistance = parseFacilityDistance(a.distance);
  const bDistance = parseFacilityDistance(b.distance);
  if (aDistance === null || bDistance === null) return aDistance === bDistance ? 0 : aDistance === null ? 1 : -1;
  if (aDistance !== bDistance) return aDistance - bDistance;
  return documentKey(a).localeCompare(documentKey(b))
    || a.place_name.localeCompare(b.place_name)
    || a.y.localeCompare(b.y)
    || a.x.localeCompare(b.x);
}

function nearestDocument<T extends PlaceDoc>(...docArrays: readonly T[][]): T | null {
  const candidates = docArrays.flat().filter((doc) => parseFacilityDistance(doc.distance) !== null);
  if (candidates.length === 0) return null;
  return [...candidates].sort(compareDocuments)[0];
}

type ConvenienceBrand = 'gs25' | 'cu' | 'seven' | 'emart24';

function convenienceBrand(doc: PlaceDoc): ConvenienceBrand | null {
  const name = doc.place_name.toUpperCase();
  if (name.includes('GS25') || name.includes('지에스25')) return 'gs25';
  if (name.includes('CU') || name.includes('씨유')) return 'cu';
  if (name.includes('세븐일레븐')) return 'seven';
  if (name.includes('이마트24')) return 'emart24';
  return null;
}

function nearestDistinctConvenienceBrands(documents: readonly PlaceDoc[]): PlaceDoc[] {
  const selected = new Map<ConvenienceBrand, PlaceDoc>();
  for (const doc of [...documents].sort(compareDocuments)) {
    const brand = convenienceBrand(doc);
    if (brand && !selected.has(brand)) selected.set(brand, doc);
  }
  return [...selected.values()].slice(0, 2);
}

function countBrands(docs: KakaoDocument[], keywords: string[]): number {
  return docs.filter(d => keywords.some(k => d.place_name.toUpperCase().includes(k.toUpperCase()))).length;
}

// ---------------------------------------------------------------------------
// Deduplication Helper
// ---------------------------------------------------------------------------

function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function deduplicatePlaces(docs: KakaoDocument[]): KakaoDocument[] {
  const unique: KakaoDocument[] = [];

  for (const doc of docs) {
    const lat = Number(doc.y);
    const lng = Number(doc.x);
    const cleanName = doc.place_name.replace(/\s+/g, '').replace(/\[.*?\]|\(.*?\)/g, '');

    const isDuplicate = unique.some((existing) => {
      const exLat = Number(existing.y);
      const exLng = Number(existing.x);
      const dist = getDistanceMeters(lat, lng, exLat, exLng);

      const existingCleanName = existing.place_name.replace(/\s+/g, '').replace(/\[.*?\]|\(.*?\)/g, '');
      if (cleanName === existingCleanName && dist < 150) return true;
      if (dist < 40) return true;

      return false;
    });

    if (!isDuplicate) {
      unique.push(doc);
    }
  }

  return unique;
}

// ---------------------------------------------------------------------------
// Strict Filtering Helpers
// ---------------------------------------------------------------------------

function filterRealDepartmentStores(documents: KakaoDocument[]) {
  const allowedBrands = [
    '현대백화점', '롯데백화점', '신세계백화점', '갤러리아', 'AK플라자', 'NC백화점',
    '스타필드', '더현대', '아이파크몰', '타임스퀘어', '롯데몰',
    '현대프리미엄아울렛', '신세계프리미엄아울렛', '롯데프리미엄아울렛'
  ];
  const bannedWords = [
    '통신', '휴대폰', '가구', '침구', '그릇', '신발', '낚시', '타이어', '할인', 'DC', '알뜰', '안경', '마트'
  ];

  return documents.filter((doc) => {
    const name = doc.place_name;
    const category = doc.category_name || '';

    if (bannedWords.some((word) => name.includes(word))) return false;

    const isBrandMatch = allowedBrands.some((brand) => name.includes(brand));
    const isCategoryMatch = category.includes('백화점') || category.includes('복합쇼핑몰');

    return isBrandMatch || isCategoryMatch;
  });
}

function filterDaiso(documents: KakaoDocument[]) {
  const bannedWords = ['인테리어', '부동산', '헤어'];
  return documents.filter((doc) => {
    const name = doc.place_name;
    if (bannedWords.some((word) => name.includes(word))) return false;
    return name.includes('다이소');
  });
}

function filterOliveYoung(documents: KakaoDocument[]) {
  const bannedWords = ['치과', '의원', '성형', '병원', '카페', '헤어', '네일', '한의원'];
  return documents.filter((doc) => {
    const name = doc.place_name;
    if (bannedWords.some((word) => name.includes(word))) return false;
    return name.includes('올리브영');
  });
}

function filterCinema(documents: KakaoDocument[]) {
  const allowedBrands = ['CGV', '롯데시네마', '메가박스'];
  return documents.filter((doc) => {
    const name = doc.place_name.toUpperCase();
    return allowedBrands.some((brand) => name.includes(brand));
  });
}

// ---------------------------------------------------------------------------
// Aggregate infrastructure fetch
// ---------------------------------------------------------------------------

/**
 * Execute all Kakao Local searches in parallel and aggregate into
 * a strongly-typed InfrastructureData object.
 *
 * Radius is strictly 500 m straight-line (직선거리) for all primary queries.
 * Bus stop query uses 200 m radius (feeder-bus proximity check).
 */
export async function fetchInfrastructureData(
  lat: number,
  lng: number,
  apiKey: string,
  signal = AbortSignal.timeout(10_000),
): Promise<InfrastructureData> {
  // Every query contributes to scoring and is required. Preserve all outcomes
  // before deciding whether it is safe to aggregate and score the result.
  const queries = await Promise.all([
    captureQuery('subway', searchCategory(lng, lat, 'SW8', 1000, apiKey, signal)),
    captureQuery('cvs', searchCategory(lng, lat, 'CS2', 300, apiKey, signal)),
    captureQuery('daiso', searchKeyword(lng, lat, '다이소', 800, apiKey, signal)),
    captureQuery('oliveYoung', searchKeyword(lng, lat, '올리브영', 500, apiKey, signal)),
    captureQuery('laundry', searchKeyword(lng, lat, '코인빨래방', 300, apiKey, signal)),
    captureQuery('cafe', searchCategory(lng, lat, 'CE7', 400, apiKey, signal)),
    captureQuery('mart', searchCategory(lng, lat, 'MT1', 800, apiKey, signal)),
    captureQuery('deptStore', searchKeyword(lng, lat, '백화점', 1500, apiKey, signal)),
    captureQuery('cinema', searchKeyword(lng, lat, '영화관', 1200, apiKey, signal)),
    captureQuery('gym', searchKeyword(lng, lat, '헬스장', 500, apiKey, signal)),
    captureQuery('pharmacy', searchCategory(lng, lat, 'PM9', 500, apiKey, signal)),
    captureQuery('hospital', searchCategory(lng, lat, 'HP8', 500, apiKey, signal)),
  ]);

  const [
    rawSubwayDocs,
    rawCvsDocs,
    rawDaisoDocs,
    rawOliveYoungDocs,
    rawLaundryDocs,
    rawCafeDocs,
    rawMartDocs,
    rawDeptStoreDocs,
    rawCinemaDocs,
    rawGymDocs,
    rawPharmacyDocs,
    rawHospitalDocs,
  ] = queries.map((query) => {
    if (query.status === 'failure') throw new InfrastructureLookupError(queries);
    return query.documents;
  });

  const subwayDocs = filterDocumentsWithValidDistance(rawSubwayDocs);
  const cvsDocs = filterDocumentsWithValidDistance(rawCvsDocs);
  const daisoDocs = filterDocumentsWithValidDistance(rawDaisoDocs);
  const oliveYoungDocs = filterDocumentsWithValidDistance(rawOliveYoungDocs);
  const laundryDocs = filterDocumentsWithValidDistance(rawLaundryDocs);
  const cafeDocs = filterDocumentsWithValidDistance(rawCafeDocs);
  const martDocs = filterDocumentsWithValidDistance(rawMartDocs);
  const deptStoreDocs = filterDocumentsWithValidDistance(rawDeptStoreDocs);
  const cinemaDocs = filterDocumentsWithValidDistance(rawCinemaDocs);
  const gymDocs = filterDocumentsWithValidDistance(rawGymDocs);
  const pharmacyDocs = filterDocumentsWithValidDistance(rawPharmacyDocs);
  const hospitalDocs = filterDocumentsWithValidDistance(rawHospitalDocs);

  const subway = buildSubwayInfo(subwayDocs);

  // Deduplicate target amenities
  const cvsDedup = deduplicatePlaces(cvsDocs);
  const daisoDedup = deduplicatePlaces(daisoDocs);
  const martDedup = deduplicatePlaces(martDocs);

  // Convenience & Laundry
  const gs25 = countBrands(cvsDedup, ['GS25', '지에스25']);
  const cu = countBrands(cvsDedup, ['CU', '씨유']);
  const seven = countBrands(cvsDedup, ['세븐일레븐']);
  const emart24 = countBrands(cvsDedup, ['이마트24']);
  const cvsDist = getNearestDist(cvsDedup);

  const filteredDaiso = filterDaiso(daisoDedup);
  const filteredOlive = filterOliveYoung(oliveYoungDocs);
  const filteredDept = filterRealDepartmentStores(deptStoreDocs);
  const filteredCinema = filterCinema(cinemaDocs);

  // Mart & Daiso
  const emartCount = countBrands(martDedup, ['이마트', '트레이더스']);
  const homeplusCount = countBrands(martDedup, ['홈플러스']);
  const lotteMartCount = countBrands(martDedup, ['롯데마트']);
  const costcoCount = countBrands(martDedup, ['코스트코']);
  const largeMartCount = emartCount + homeplusCount + lotteMartCount + costcoCount;
  const mediumSuperCount = Math.max(0, martDedup.length - largeMartCount);

  // Lifestyle
  const hasStarbucks = countBrands(cafeDocs, ['스타벅스']) > 0;
  const deptName = nearestDocument(filteredDept)?.place_name ?? null;
  const cinemaName = nearestDocument(filteredCinema)?.place_name ?? null;

  const infrastructure: InfrastructureData = {
    subway,
    cvs: { gs25, cu, seven, emart24, nearestDist: cvsDist },
    laundromat: { count: laundryDocs.length, nearestDist: getNearestDist(laundryDocs) },
    mart: {
      daisoCount: filteredDaiso.length,
      daisoDist: getNearestDist(filteredDaiso),
      emartCount,
      homeplusCount,
      lotteMartCount,
      mediumSuperCount,
      nearestDist: getNearestDist(martDocs),
    },
    deptStore: { name: deptName, nearestDist: getNearestDist(filteredDept) },
    cinema: { name: cinemaName, nearestDist: getNearestDist(filteredCinema) },
    cafe: { hasStarbucks, nearestDist: getNearestDist(cafeDocs) },
    care: {
      hasOliveYoung: filteredOlive.length > 0,
      hasGym: gymDocs.length > 0,
      nearestDist: getNearestDist(filteredOlive, gymDocs),
    },
    medical: { nearestDist: getNearestDist(pharmacyDocs, hospitalDocs) },
  };
  const scoreEvidence = getFacilityScoreEvidence(infrastructure);
  const evidence = new Set<string>();
  const mark = (category: string, doc: PlaceDoc | null) => {
    if (doc) evidence.add(`${category}:${documentKey(doc)}`);
  };

  if (scoreEvidence.subway) mark('subway', nearestDocument(subwayDocs));
  if (scoreEvidence.cvsBase) mark('cvs', nearestDocument(cvsDedup));
  if (scoreEvidence.cvsBrandBonus) {
    for (const doc of nearestDistinctConvenienceBrands(cvsDedup)) mark('cvs', doc);
  }
  if (scoreEvidence.laundryBonus) mark('laundry', nearestDocument(laundryDocs));

  const nearestMartOrDaiso = nearestDocument(martDocs, filteredDaiso);
  if (scoreEvidence.martBase) {
    if (nearestMartOrDaiso && filteredDaiso.some((doc) => documentKey(doc) === documentKey(nearestMartOrDaiso))) {
      mark('daiso', nearestMartOrDaiso);
    } else {
      mark('mart', nearestMartOrDaiso);
    }
  }
  if (scoreEvidence.martComboBonus) {
    mark('daiso', nearestDocument(filteredDaiso));
    mark('mart', nearestDocument(martDedup));
  }

  if (scoreEvidence.deptStore) mark('deptStore', nearestDocument(filteredDept));
  if (scoreEvidence.cinema) mark('cinema', nearestDocument(filteredCinema));
  if (scoreEvidence.cafeBase) mark('cafe', nearestDocument(cafeDocs));
  if (scoreEvidence.starbucksBonus) {
    mark('cafe', nearestDocument(cafeDocs.filter((doc) => doc.place_name.includes('스타벅스'))));
  }
  const nearestCare = nearestDocument(filteredOlive, gymDocs);
  if (scoreEvidence.careBase) {
    if (nearestCare && filteredOlive.some((doc) => documentKey(doc) === documentKey(nearestCare))) {
      mark('oliveYoung', nearestCare);
    } else {
      mark('gym', nearestCare);
    }
  }
  if (scoreEvidence.careComboBonus) {
    mark('oliveYoung', nearestDocument(filteredOlive));
    mark('gym', nearestDocument(gymDocs));
  }
  if (scoreEvidence.medical) mark('medical', nearestDocument(pharmacyDocs, hospitalDocs));
  const facilityMarkers = buildFacilityMarkers([
    { category: 'subway', documents: subwayDocs, used: doc => evidence.has(`subway:${documentKey(doc)}`) },
    { category: 'cvs', documents: cvsDedup, used: doc => evidence.has(`cvs:${documentKey(doc)}`) },
    { category: 'laundry', documents: laundryDocs, used: doc => evidence.has(`laundry:${documentKey(doc)}`) },
    { category: 'daiso', documents: filteredDaiso, used: doc => evidence.has(`daiso:${documentKey(doc)}`) },
    { category: 'mart', documents: martDocs, used: doc => evidence.has(`mart:${documentKey(doc)}`) },
    { category: 'deptStore', documents: filteredDept, used: doc => evidence.has(`deptStore:${documentKey(doc)}`) },
    { category: 'cinema', documents: filteredCinema, used: doc => evidence.has(`cinema:${documentKey(doc)}`) },
    { category: 'cafe', documents: cafeDocs, used: doc => evidence.has(`cafe:${documentKey(doc)}`) },
    { category: 'oliveYoung', documents: filteredOlive, used: doc => evidence.has(`oliveYoung:${documentKey(doc)}`) },
    { category: 'gym', documents: gymDocs, used: doc => evidence.has(`gym:${documentKey(doc)}`) },
    { category: 'medical', documents: [...pharmacyDocs, ...hospitalDocs], used: doc => evidence.has(`medical:${documentKey(doc)}`) },
  ]);

  return {
    facilityMarkers,
    subway,
    cvs: {
      gs25,
      cu,
      seven,
      emart24,
      nearestDist: cvsDist,
    },
    laundromat: {
      count: laundryDocs.length,
      nearestDist: getNearestDist(laundryDocs),
    },
    mart: {
      daisoCount: filteredDaiso.length,
      daisoDist: getNearestDist(filteredDaiso),
      emartCount,
      homeplusCount,
      lotteMartCount,
      mediumSuperCount,
      nearestDist: getNearestDist(martDocs),
    },
    deptStore: {
      name: deptName,
      nearestDist: getNearestDist(filteredDept),
    },
    cinema: {
      name: cinemaName,
      nearestDist: getNearestDist(filteredCinema),
    },
    cafe: {
      hasStarbucks,
      nearestDist: getNearestDist(cafeDocs),
    },
    care: {
      hasOliveYoung: filteredOlive.length > 0,
      hasGym: gymDocs.length > 0,
      nearestDist: getNearestDist(filteredOlive, gymDocs),
    },
    medical: {
      nearestDist: getNearestDist(pharmacyDocs, hospitalDocs),
    },
    ...(process.env.NODE_ENV !== 'production' ? { rawDebugData: {
      daisoRaw: rawDaisoDocs,
      daisoDedup: filteredDaiso,
      martRaw: rawMartDocs,
      martDedup,
      cvsRaw: rawCvsDocs,
      cvsDedup,
    } } : {}),
  };
}

