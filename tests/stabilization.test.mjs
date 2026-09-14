// Run with Node.js 22.18+:
// node --conditions=react-server --test tests/stabilization.test.mjs
// Native TypeScript stripping; resolve the app's tsconfig alias without deps.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    if (specifier === './scoring') return nextResolve('./scoring.ts', context);
    return nextResolve(specifier, context);
  },
});

const { GET } = await import('../app/api/score/route.ts');
const {
  fetchInfrastructureData,
  InfrastructureLookupError,
  geocodeAddress,
  searchCategory,
  searchKeyword,
} = await import('../lib/kakao.ts');
const { normalizeCoordinates, coordinatesEqual, syncMapCenter } = await import('../lib/coordinates.ts');
await import('../lib/scoring.test.ts');
await import('../lib/kakao.test.ts');

const emptyResponse = () => Response.json({ documents: [], meta: { is_end: true } });
const request = (params) => new Request(`http://localhost/api/score?${new URLSearchParams(params)}`);

test('score API stabilization', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KAKAO_REST_API_KEY;
  const originalConsoleError = console.error;
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    if (originalKey === undefined) delete process.env.KAKAO_REST_API_KEY;
    else process.env.KAKAO_REST_API_KEY = originalKey;
  });
  console.error = () => {};

  await t.test('invalid coordinates return 400 without fetching, even in demo/address mode', async () => {
    const invalid = [
      { lat: 'NaN', lng: '127' }, { lat: 'Infinity', lng: '127' },
      { lat: '37', lng: '-Infinity' }, { lat: '37oops', lng: '127' },
      { lat: '90.001', lng: '0' }, { lat: '-90.001', lng: '0' },
      { lat: '0', lng: '180.001' }, { lat: '0', lng: '-180.001' },
      { lat: '', lng: '127' }, { lat: ' ', lng: '127' },
      { lat: '37' }, { lng: '127' },
    ];
    let calls = 0;
    globalThis.fetch = async () => { calls++; return emptyResponse(); };
    for (const key of [undefined, 'test-key']) {
      if (key === undefined) delete process.env.KAKAO_REST_API_KEY;
      else process.env.KAKAO_REST_API_KEY = key;
      for (const coords of invalid) {
        const response = await GET(request({ ...coords, address: '서울' }));
        assert.equal(response.status, 400);
        assert.equal((await response.json()).code, 'INVALID_COORDINATES');
      }
    }
    assert.equal(calls, 0);
  });

  await t.test('missing input remains 400', async () => {
    assert.equal((await GET(request({}))).status, 400);
  });

  await t.test('category search merges pages and sorts by distance', async () => {
    const calls = [];
    const place = (id, distance) => ({
      id,
      place_name: id,
      category_group_code: 'CS2',
      category_name: 'convenience',
      x: '127',
      y: '37',
      distance: String(distance),
      road_address_name: '',
    });
    globalThis.fetch = async (input) => {
      const url = new URL(input);
      calls.push({
        page: Number(url.searchParams.get('page')),
        sort: url.searchParams.get('sort'),
      });
      const page = Number(url.searchParams.get('page'));
      return Response.json({
        documents: [page === 1 ? place('far', 450) : place('near', 120)],
        meta: { total_count: 30, pageable_count: 30, is_end: page === 2 },
      });
    };

    const documents = await searchCategory(127, 37, 'CS2', 300, 'test-key');
    assert.deepEqual(documents.map((doc) => doc.id), ['near', 'far']);
    assert.deepEqual(calls, [{ page: 1, sort: 'distance' }, { page: 2, sort: 'distance' }]);
  });

  await t.test('keyword search stops immediately when is_end is true', async () => {
    const pages = [];
    globalThis.fetch = async (input) => {
      const url = new URL(input);
      pages.push(Number(url.searchParams.get('page')));
      return Response.json({
        documents: [],
        meta: { total_count: 30, pageable_count: 30, is_end: true },
      });
    };

    await searchKeyword(127, 37, 'cafe', 400, 'test-key');
    assert.deepEqual(pages, [1]);
  });

  await t.test('keyword search caps pagination at Kakao\'s pageable limit', async () => {
    const pages = [];
    globalThis.fetch = async (input) => {
      const url = new URL(input);
      pages.push(Number(url.searchParams.get('page')));
      return Response.json({
        documents: [],
        meta: { total_count: 45, pageable_count: 45, is_end: false },
      });
    };

    await searchKeyword(127, 37, 'cafe', 400, 'test-key');
    assert.deepEqual(pages, [1, 2, 3]);
  });

  await t.test('address keyword fallback uses consistent search params and relevance result', async () => {
    const calls = [];
    globalThis.fetch = async (input) => {
      const url = new URL(input);
      calls.push(url);
      if (url.pathname.endsWith('/address.json')) return Response.json({ documents: [] });
      return Response.json({
        documents: [
          {
            place_name: '가장 적합한 결과',
            road_address_name: '서울시 관악구 1',
            x: '127.01',
            y: '37.49',
          },
          {
            place_name: '덜 적합한 결과',
            road_address_name: '서울시 관악구 2',
            x: '127.02',
            y: '37.50',
          },
        ],
        meta: { total_count: 2, pageable_count: 2, is_end: true },
      });
    };

    const result = await geocodeAddress('신림역 9출 방면', 'test-key');
    const fallbackUrl = calls[1];
    assert.equal(fallbackUrl.searchParams.get('page'), '1');
    assert.equal(fallbackUrl.searchParams.get('size'), '15');
    assert.equal(fallbackUrl.searchParams.get('sort'), 'accuracy');
    assert.equal(result?.roadAddress, '서울시 관악구 1');
    assert.equal(result?.lat, 37.49);
    assert.equal(result?.lng, 127.01);
  });

  await t.test('subway selection uses the nearest distance across pages', async () => {
    const subwayPages = [];
    const place = (id, distance) => ({
      id,
      place_name: id,
      category_group_code: 'SW8',
      category_name: 'subway',
      x: '127',
      y: '37',
      distance: String(distance),
      road_address_name: '',
    });
    globalThis.fetch = async (input) => {
      const url = new URL(input);
      if (url.searchParams.get('category_group_code') !== 'SW8') return emptyResponse();
      const page = Number(url.searchParams.get('page'));
      subwayPages.push(page);
      return Response.json({
        documents: [page === 1 ? place('far', 800) : place('near', 100)],
        meta: { total_count: 30, pageable_count: 30, is_end: page === 2 },
      });
    };

    const infrastructure = await fetchInfrastructureData(37, 127, 'test-key');
    assert.equal(infrastructure.subway.stationName, 'near');
    assert.equal(infrastructure.subway.distanceMetres, 100);
    assert.deepEqual(subwayPages, [1, 2]);
  });

  await t.test('controlled map coordinates normalize valid values and ignore invalid updates', async () => {
    assert.deepEqual(normalizeCoordinates(37.5, 127.0), { lat: 37.5, lng: 127 });
    assert.deepEqual(normalizeCoordinates(0, 0), { lat: 0, lng: 0 });
    assert.equal(normalizeCoordinates(Number.NaN, 127), null);
    assert.equal(normalizeCoordinates(37, Number.POSITIVE_INFINITY), null);
    assert.equal(normalizeCoordinates(90.001, 0), null);
    assert.equal(normalizeCoordinates(0, -180.001), null);
    assert.equal(coordinatesEqual({ lat: 37, lng: 127 }, { lat: 37, lng: 127 }), true);
    assert.equal(coordinatesEqual({ lat: 37, lng: 127 }, { lat: 37.00000005, lng: 127 }), true);
    assert.equal(coordinatesEqual({ lat: 37, lng: 127 }, { lat: 37.000001, lng: 127 }), false);
    class FakeLatLng {
      constructor(lat, lng) { this.lat = lat; this.lng = lng; }
    }
    let center = { lat: 37, lng: 127 };
    const map = {
      getCenter: () => ({ getLat: () => center.lat, getLng: () => center.lng }),
      setCenter: (next) => { center = { lat: next.lat, lng: next.lng }; },
    };
    assert.equal(syncMapCenter(map, { lat: 37, lng: 127 }, FakeLatLng), false);
    assert.equal(syncMapCenter(map, { lat: 35, lng: 129 }, FakeLatLng), true);
    assert.deepEqual(center, { lat: 35, lng: 129 });
  });

  await t.test('successful empty searches are real absence, including coordinate boundaries', async () => {
    process.env.KAKAO_REST_API_KEY = 'test-key';
    let calls = 0;
    globalThis.fetch = async () => { calls++; return emptyResponse(); };
    for (const [lat, lng] of [[0, 0], [-90, -180], [90, 180]]) {
      const response = await GET(request({ lat, lng }));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.breakdown.totalScore, 0);
      assert.equal(body.tier.tier, 'F');
      assert.equal(body._isMock, undefined);
      assert.deepEqual(body.coordinates, { lat, lng });
    }
    assert.equal(calls, 36);
  });

  await t.test('normal subway score is unchanged', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(input);
      if (url.searchParams.get('category_group_code') !== 'SW8') return emptyResponse();
      return Response.json({ documents: [{
        id: 'station', place_name: '홍대입구역', category_group_code: 'SW8',
        category_name: '지하철역', x: '126.9236', y: '37.5563',
        distance: '280', road_address_name: '',
      }] });
    };
    const body = await (await GET(request({ lat: 37.5563, lng: 126.9236 }))).json();
    assert.equal(body.breakdown.subway.score, 22);
    assert.equal(body.breakdown.totalScore, 22);
  });

  await t.test('same coordinates and upstream data produce identical responses regardless of legacy options', async () => {
    // The external dataset is fixed: this verifies request-option independence,
    // not that live Kakao listings can never change over time.
    const calls = [];
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      const url = new URL(input);
      if (url.searchParams.get('category_group_code') !== 'SW8') return emptyResponse();
      return Response.json({ documents: [{
        id: 'station', place_name: '홍대입구역', category_group_code: 'SW8',
        category_name: '지하철역', x: '126.9236', y: '37.5563',
        distance: '280', road_address_name: '',
      }] });
    };
    const coords = { lat: 37.5563, lng: 126.9236 };
    const baseline = await (await GET(request(coords))).json();
    const baselineCalls = calls.splice(0);
    assert.equal(baseline.breakdown.totalScore, 22);
    assert.ok(!JSON.stringify(baseline).includes('steepHill'));
    for (const extra of [{}, { steepHill: 'true' }, { steepHill: 'false' }, { steepHill: 'invalid' }]) {
      const response = await GET(request({ ...coords, ...extra }));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), baseline);
      assert.deepEqual(calls.splice(0), baselineCalls);
    }
  });

  await t.test('partial failure preserves all outcomes and the original cause', async () => {
    const cause = new Error('private upstream diagnostic');
    globalThis.fetch = async (input) => {
      if (new URL(input).searchParams.get('category_group_code') === 'CS2') throw cause;
      return emptyResponse();
    };
    await assert.rejects(fetchInfrastructureData(37, 127, 'test-key'), (error) => {
      assert.ok(error instanceof InfrastructureLookupError);
      assert.equal(error.queries.length, 12);
      assert.equal(error.queries.filter(q => q.status === 'success').length, 11);
      assert.deepEqual(error.queries.find(q => q.status === 'failure'), {
        category: 'cvs', status: 'failure', cause,
      });
      return true;
    });
    const response = await GET(request({ lat: 37, lng: 127 }));
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, 'INFRASTRUCTURE_FETCH_FAILED');
    assert.equal(body.retryable, true);
    assert.equal(body.tier, undefined);
    assert.equal(body.breakdown, undefined);
    assert.equal(body._isMock, undefined);
    assert.ok(!JSON.stringify(body).includes('private upstream diagnostic'));
  });

  await t.test('every one of the 12 queries is required', async () => {
    for (let failedIndex = 0; failedIndex < 12; failedIndex++) {
      let calls = 0;
      globalThis.fetch = async () => calls++ === failedIndex
        ? new Response(null, { status: 429 }) : emptyResponse();
      const response = await GET(request({ lat: 37, lng: 127 }));
      assert.equal(response.status, 503);
      assert.equal(calls, 12);
      assert.equal((await response.json()).breakdown, undefined);
    }
  });

  await t.test('all failures cannot turn into a zero score or mock', async () => {
    globalThis.fetch = async () => new Response(null, { status: 401 });
    const response = await GET(request({ lat: 37, lng: 127 }));
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.tier, undefined);
    assert.equal(body._isMock, undefined);
    assert.equal(body.retryable, true);
  });

  await t.test('malformed upstream response is not absence', async () => {
    globalThis.fetch = async () => Response.json({ error: 'invalid response' });
    assert.equal((await GET(request({ lat: 37, lng: 127 }))).status, 503);
  });

  await t.test('address lookup and keyword fallback errors return retryable errors', async () => {
    for (const failFallback of [false, true]) {
      globalThis.fetch = async (input) => {
        if (failFallback && new URL(input).pathname.endsWith('/address.json')) return emptyResponse();
        return new Response(null, { status: 503 });
      };
      const response = await GET(request({ address: '서울' }));
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, 'GEOCODING_FAILED');
    }
    globalThis.fetch = async () => emptyResponse();
    assert.equal((await GET(request({ address: '없는 주소' }))).status, 404);
  });

  await t.test('missing key keeps demo score and exposes demo metadata without fetching', async () => {
    delete process.env.KAKAO_REST_API_KEY;
    let calls = 0;
    globalThis.fetch = async () => { calls++; return emptyResponse(); };
    let baseline;
    for (const extra of [{}, { steepHill: 'true' }, { steepHill: 'false' }, { steepHill: 'invalid' }]) {
      const response = await GET(request({ lat: 37, lng: 127, ...extra }));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body._isMock, true);
      assert.match(body._warning, /데모 데이터/);
      assert.equal(body.breakdown.totalScore, 88);
      assert.ok(!JSON.stringify(body).includes('steepHill'));
      if (baseline) assert.deepEqual(body, baseline);
      else baseline = body;
    }
    assert.equal(calls, 0);
  });
});

