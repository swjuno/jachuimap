import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import type { InfrastructureData } from '@/types/score';

export const SCORE_LIMITS = { perMinute: 10, clients: 1000, concurrent: 4, cacheEntries: 200, cacheMs: 600_000 } as const;

/** Instance-local guard. Cold starts and multiple instances do NOT share this state. */
export class ScoreRuntime {
  private readonly salt = randomBytes(32);
  private readonly clients = new Map<string, { count: number; expires: number }>();
  private readonly cache = new Map<string, { data: InfrastructureData; expires: number }>();
  private readonly pending = new Map<string, Promise<InfrastructureData>>();
  private active = 0;

  private readonly now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }

  admit(headers: Headers, onVercel: boolean): { retryAfter: number; release?: () => void } {
    const now = this.now();
    for (const [key, value] of this.clients) if (value.expires <= now) this.clients.delete(key);
    // Trust only Vercel's overwritten header on Vercel, never arbitrary forwarded IPs.
    const candidate = onVercel ? headers.get('x-vercel-forwarded-for')?.trim() : undefined;
    const identity = candidate && isIP(candidate) ? candidate : 'unidentified';
    const key = createHmac('sha256', this.salt).update(identity).digest('hex');
    let bucket = this.clients.get(key);
    if (!bucket && this.clients.size >= SCORE_LIMITS.clients) return { retryAfter: 60 };
    if (!bucket) {
      bucket = { count: 0, expires: now + 60_000 };
      this.clients.set(key, bucket);
    }
    if (bucket.count >= SCORE_LIMITS.perMinute) return { retryAfter: Math.max(1, Math.ceil((bucket.expires - now) / 1000)) };
    bucket.count++;
    if (this.active >= SCORE_LIMITS.concurrent) return { retryAfter: 5 };
    this.active++;
    let released = false;
    return { retryAfter: 0, release: () => {
      if (!released) this.active--;
      released = true;
    } };
  }

  async infrastructure(lat: number, lng: number, apiKey: string, load: () => Promise<InfrastructureData>): Promise<InfrastructureData> {
    // Exact numeric coordinates: no rounding across score distance boundaries.
    const key = createHmac('sha256', this.salt).update(JSON.stringify([lat, lng, apiKey])).digest('hex');
    for (const [id, value] of this.cache) if (value.expires <= this.now()) this.cache.delete(id);
    const cached = this.cache.get(key);
    if (cached) return cached.data;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const task = Promise.resolve().then(load).then(data => {
      if (this.cache.size >= SCORE_LIMITS.cacheEntries) {
        const oldest = this.cache.keys().next().value;
        if (oldest) this.cache.delete(oldest);
      }
      this.cache.set(key, { data, expires: this.now() + SCORE_LIMITS.cacheMs });
      return data;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }
}

export const scoreRuntime = new ScoreRuntime();

/** Explicit fields only: never pass Request, Error, URLs, coordinates or tokens. */
export function logScoreRequest(status: number, code: string, durationMs: number): void {
  const allowed = ['OK', 'DEMO', 'INVALID_COORDINATES', 'MISSING_PARAMS', 'ADDRESS_NOT_FOUND',
    'GEOCODING_FAILED', 'INFRASTRUCTURE_FETCH_FAILED', 'RATE_LIMITED', 'UNKNOWN_ERROR'];
  const entry = JSON.stringify({ event: 'score_request', status, code: allowed.includes(code) ? code : 'UNKNOWN_ERROR',
    durationMs: Math.max(0, Math.round(durationMs)) });
  try { if (status >= 500) console.error(entry); else console.info(entry); } catch { /* Logging cannot break analysis. */ }
}
