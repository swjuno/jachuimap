/**
 * lib/kakao.ts
 * Server-side Kakao Local Search API helpers.
 *
 * The `server-only` import causes a build-time error if this module is ever
 * imported from a Client Component — keeping the REST key off the browser.
 */
import 'server-only';

import { getStationMeta } from '@/data/subway-lines';
import type { InfrastructureData, SubwayInfo } from '@/types/score';

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

interface KakaoAddressResponse {
  meta: { total_count: number };
  documents: KakaoAddressDocument[];
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
): Promise<GeoResult | null> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json');
  url.searchParams.set('query', address);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${apiKey}` },
    // Do not cache geocoding results — address data can change
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Kakao geocode failed: ${res.status} ${res.statusText}`);
  }

  const data: KakaoAddressResponse = await res.json();

  if (data.documents.length === 0) {
    // Fallback to keyword search (e.g., for queries like "신림역 9출 방면")
    const kwUrl = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
    kwUrl.searchParams.set('query', address);

    const kwRes = await fetch(kwUrl.toString(), {
      headers: { Authorization: `KakaoAK ${apiKey}` },
      cache: 'no-store',
    });

    if (!kwRes.ok) return null;

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
): Promise<KakaoDocument[]> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/category.json');
  url.searchParams.set('category_group_code', categoryCode);
  url.searchParams.set('x', String(x));
  url.searchParams.set('y', String(y));
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('size', '15');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${apiKey}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(
      `Kakao category search (${categoryCode}) failed: ${res.status} ${res.statusText}`,
    );
  }

  const data: KakaoLocalResponse = await res.json();
  return data.documents;
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
): Promise<KakaoDocument[]> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  url.searchParams.set('query', keyword);
  url.searchParams.set('x', String(x));
  url.searchParams.set('y', String(y));
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('size', '15');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${apiKey}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(
      `Kakao keyword search ("${keyword}") failed: ${res.status} ${res.statusText}`,
    );
  }

  const data: KakaoLocalResponse = await res.json();
  return data.documents;
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

  const nearest = docs[0];
  const stationName = parseStationName(nearest.place_name);
  const distanceMetres = parseInt(nearest.distance, 10);
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
      const dist = parseInt(doc.distance, 10);
      if (!isNaN(dist) && dist < min) min = dist;
    }
  }
  return min === Infinity ? null : min;
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
): Promise<InfrastructureData> {
  const [
    subwayDocs,
    cvsDocs,
    daisoDocs,
    oliveYoungDocs,
    laundryDocs,
    cafeDocs,
    martDocs,
    deptStoreDocs,
    cinemaDocs,
    gymDocs,
    pharmacyDocs,
    hospitalDocs,
  ] = await Promise.all([
    searchCategory(lng, lat, 'SW8', 1000, apiKey).catch(() => []),
    searchCategory(lng, lat, 'CS2', 300, apiKey).catch(() => []),
    searchKeyword(lng, lat, '다이소', 800, apiKey).catch(() => []),
    searchKeyword(lng, lat, '올리브영', 500, apiKey).catch(() => []),
    searchKeyword(lng, lat, '코인빨래방', 300, apiKey).catch(() => []),
    searchCategory(lng, lat, 'CE7', 400, apiKey).catch(() => []),
    searchCategory(lng, lat, 'MT1', 800, apiKey).catch(() => []),
    searchKeyword(lng, lat, '백화점', 1500, apiKey).catch(() => []),
    searchKeyword(lng, lat, '영화관', 1200, apiKey).catch(() => []),
    searchKeyword(lng, lat, '헬스장', 500, apiKey).catch(() => []),
    searchCategory(lng, lat, 'PM9', 500, apiKey).catch(() => []),
    searchCategory(lng, lat, 'HP8', 500, apiKey).catch(() => []),
  ]);

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
  const deptName = filteredDept.length > 0 ? filteredDept[0].place_name : null;
  const cinemaName = filteredCinema.length > 0 ? filteredCinema[0].place_name : null;

  return {
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
    rawDebugData: {
      daisoRaw: daisoDocs,
      daisoDedup: filteredDaiso,
      martRaw: martDocs,
      martDedup: martDedup,
      cvsRaw: cvsDocs,
      cvsDedup: cvsDedup,
    }
  };
}
