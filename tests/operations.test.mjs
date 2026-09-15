import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createHmac } from 'node:crypto';
import { ScoreRuntime, SCORE_LIMITS, logScoreRequest } from '../lib/score-runtime.ts';
import { createShareToken, readSignedShareToken, verifyShareToken, SHARE_TTL } from '../lib/share-token.ts';
import { shareMetadata } from '../lib/share-metadata.ts';
import { restoreSharedLocationOnce } from '../lib/sharing.ts';
import { searchKeyword } from '../lib/kakao.ts';
import { GET } from '../app/api/score/route.ts';
import { readFile } from 'node:fs/promises';

const resultCardSource = await readFile(new URL('../components/ResultCard.tsx', import.meta.url), 'utf8');
const mainPageSource = await readFile(new URL('../app/(main)/page.tsx', import.meta.url), 'utf8');
const kakaoMapSource = await readFile(new URL('../components/KakaoMap.tsx', import.meta.url), 'utf8');

test('instance request limits expire and cannot be bypassed by an untrusted header', () => {
  let now = 0;
  const runtime = new ScoreRuntime(() => now);
  for (let i = 0; i < SCORE_LIMITS.perMinute; i++) {
    const result = runtime.admit(new Headers({ 'x-forwarded-for': `192.0.2.${i}` }), false);
    assert.equal(result.retryAfter, 0);
    result.release(); result.release(); // release is idempotent
  }
  assert.equal(runtime.admit(new Headers(), false).retryAfter, 60);
  now = 60_000;
  assert.equal(runtime.admit(new Headers(), false).retryAfter, 0);
});

test('concurrency and client table remain bounded; Vercel identities are separate', () => {
  const runtime = new ScoreRuntime(() => 0);
  const leases = Array.from({ length: SCORE_LIMITS.concurrent }, (_, i) =>
    runtime.admit(new Headers({ 'x-vercel-forwarded-for': `192.0.2.${i}` }), true));
  assert.equal(runtime.admit(new Headers({ 'x-vercel-forwarded-for': '192.0.2.10' }), true).retryAfter, 5);
  leases.forEach(lease => lease.release());
  for (let i = 0; i < SCORE_LIMITS.clients; i++) {
    runtime.admit(new Headers({ 'x-vercel-forwarded-for': `2001:db8::${i.toString(16)}` }), true).release?.();
  }
  assert.equal(runtime.admit(new Headers({ 'x-vercel-forwarded-for': '2001:db8::ffff' }), true).retryAfter, 60);
});

test('cache coalesces requests, keeps exact coordinates, expires, and retries failures', async () => {
  let now = 0, calls = 0;
  const runtime = new ScoreRuntime(() => now);
  const load = async () => { calls++; await delay(2); return { test: calls }; };
  const results = await Promise.all(Array.from({ length: 3 }, () => runtime.infrastructure(37, 127, 'test-key', load)));
  assert.equal(calls, 1);
  assert.deepEqual(results[0], results[1]);
  await runtime.infrastructure(37, 127, 'test-key', load);
  assert.equal(calls, 1);
  await runtime.infrastructure(37.0000001, 127, 'test-key', load);
  assert.equal(calls, 2); // no rounding into another score boundary
  await runtime.infrastructure(37, 127, 'different-test-key', load);
  assert.equal(calls, 3);
  now = SCORE_LIMITS.cacheMs;
  await runtime.infrastructure(37, 127, 'test-key', load);
  assert.equal(calls, 4);
  let failures = 0;
  const fail = async () => { failures++; throw new Error('upstream'); };
  await assert.rejects(runtime.infrastructure(38, 127, 'test-key', fail));
  await assert.rejects(runtime.infrastructure(38, 127, 'test-key', fail));
  assert.equal(failures, 2);
});

test('successful empty cache entries are bounded and evicted', async () => {
  const runtime = new ScoreRuntime(() => 0);
  let calls = 0;
  const empty = async () => { calls++; return {}; };
  for (let i = 0; i <= SCORE_LIMITS.cacheEntries; i++) await runtime.infrastructure(0, i / 100, 'test-key', empty);
  await runtime.infrastructure(0, 0, 'test-key', empty);
  assert.equal(calls, SCORE_LIMITS.cacheEntries + 2);
});

test('expired signed location remains usable but stale scores and tampering do not', () => {
  const secret = 'operations-test-only-secret-at-least-32-bytes';
  const issued = 1000;
  const token = createShareToken({ lat: 37, lng: 127, score: 90, tier: 'S', title: '테스트', isMock: false }, secret, issued);
  const now = issued + SHARE_TTL;
  assert.equal(verifyShareToken(token, secret, now), null);
  const signed = readSignedShareToken(token, secret, now);
  assert.equal(signed.lat, 37);
  const metadata = shareMetadata(token, secret, now);
  assert.match(metadata.title, /만료/);
  assert.doesNotMatch(JSON.stringify(metadata), /90점|S 티어/);
  const query = '?' + new URLSearchParams({ lat: String(signed.lat), lng: String(signed.lng), share: '1' });
  const ref = { current: false };
  const requests = [];
  restoreSharedLocationOnce(ref, () => query, c => requests.push(c));
  restoreSharedLocationOnce(ref, () => query, c => requests.push(c));
  assert.deepEqual(requests, [{ lat: 37, lng: 127 }]);
  assert.equal(readSignedShareToken('A' + token.slice(1), secret, now), null);
  assert.equal(readSignedShareToken(token, '', now), null);
  const body = Buffer.from(JSON.stringify({ ...signed, lat: 91 })).toString('base64url');
  assert.equal(readSignedShareToken(body + '.' + createHmac('sha256', secret).update(body).digest('base64url'), secret, now), null);
});

test('upstream deadline aborts pagination instead of producing a successful empty result', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async (_url, { signal }) => {
    calls++;
    await delay(100, undefined, { signal });
    return Response.json({ documents: [], meta: { is_end: false, pageable_count: 45 } });
  };
  await assert.rejects(searchKeyword(127, 37, 'test', 400, 'test-key', AbortSignal.timeout(5)));
  assert.equal(calls, 1);
});

test('production API caches success, omits raw data, rejects abuse, and logs no location', async t => {
  const oldEnv = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL, KAKAO_REST_API_KEY: process.env.KAKAO_REST_API_KEY };
  const originalFetch = globalThis.fetch, info = console.info, error = console.error;
  t.after(() => {
    globalThis.fetch = originalFetch; console.info = info; console.error = error;
    for (const [key, value] of Object.entries(oldEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  process.env.NODE_ENV = 'production'; process.env.VERCEL = '1'; process.env.KAKAO_REST_API_KEY = 'test-key';
  const logs = [];
  console.info = console.error = entry => logs.push(JSON.parse(entry));
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ documents: [], meta: { is_end: true } }); };
  const request = () => new Request('http://localhost/api/score?lat=37&lng=127', { headers: { 'x-vercel-forwarded-for': '192.0.2.123' } });
  for (let i = 0; i < 10; i++) {
    const res = await GET(request());
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
    assert.equal((await res.json()).infrastructure.rawDebugData, undefined);
  }
  assert.equal(calls, 12);
  const limited = await GET(request());
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('Retry-After')) > 0);
  const limitedBody = await limited.json();
  assert.equal(limitedBody.code, 'RATE_LIMITED');
  assert.equal(limitedBody.tier, undefined);
  assert.equal(calls, 12);
  globalThis.fetch = async () => { throw new Error('private coordinates lat=38&lng=128 key=test-key'); };
  for (let i = 0; i < 2; i++) {
    const res = await GET(new Request('http://localhost/api/score?lat=38&lng=128', { headers: { 'x-vercel-forwarded-for': '192.0.2.124' } }));
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, 'INFRASTRUCTURE_FETCH_FAILED');
  }
  logScoreRequest(503, 'private address here', 10);
  assert.equal(logs.at(-1).code, 'UNKNOWN_ERROR');
  for (const entry of logs) assert.deepEqual(Object.keys(entry), ['event', 'status', 'code', 'durationMs']);
  assert.doesNotMatch(JSON.stringify(logs), /lat=|lng=|test-key|192\.0|private address/);
});

test('PNG export uses local-safe fonts and records success only after download', () => {
  assert.match(resultCardSource, /skipFonts:\s*true/);
  assert.match(resultCardSource, /카드 만드는 중/);
  assert.match(resultCardSource, /카드를 저장하지 못했습니다/);
  const download = resultCardSource.indexOf('a.click()');
  const completed = resultCardSource.indexOf("trackEvent('png_downloaded'");
  assert.ok(download >= 0 && completed > download);
});

test('desktop result layout stays two-column while mobile result offers a dedicated facility map', () => {
  assert.match(mainPageSource, /min-\[1180px\]:grid/);
  assert.match(mainPageSource, /min-\[1180px\]:col-start-1/);
  assert.match(resultCardSource, /hidden min-\[1180px\]:block/);
  assert.match(resultCardSource, /분석 요약/);
  assert.match(resultCardSource, /id="copy-link-btn"[^>]*min-h-11/);
  assert.match(kakaoMapSource, /h-\[220px\] md:h-\[460px\]/);
  assert.match(resultCardSource, /id="show-facilities-btn"/);
  assert.match(mainPageSource, /visible=\{mapVisible\}/);
  assert.match(mainPageSource, /viewMode=\{mobileScreen === 'facility-map'/);
});
