import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizeCoordinates } from '@/lib/coordinates';
import type { Tier } from '@/types/score';

export const SCORING_VERSION = '100-medical-8-v1';
export const SHARE_TTL = 30 * 24 * 60 * 60;
export interface ShareSnapshot {
  lat: number; lng: number; score: number; tier: Tier;
  title: string; scoringVersion: typeof SCORING_VERSION;
  isMock: boolean; issuedAt: number; expiresAt: number;
}
function valid(value: unknown, now: number): value is ShareSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.lat !== 'number' || typeof v.lng !== 'number' || !normalizeCoordinates(v.lat, v.lng)) return false;
  if (typeof v.score !== 'number' || !Number.isInteger(v.score) || v.score < 0 || v.score > 100) return false;
  const tier = v.score >= 90 ? 'S' : v.score >= 75 ? 'A' : v.score >= 60 ? 'B' : v.score >= 45 ? 'C' : 'F';
  return v.tier === tier && typeof v.title === 'string' && v.title.length > 0 && Array.from(v.title).length <= 40
    && !/[<>\u0000-\u001f]/.test(v.title) && v.scoringVersion === SCORING_VERSION && typeof v.isMock === 'boolean'
    && typeof v.issuedAt === 'number' && Number.isSafeInteger(v.issuedAt) && v.issuedAt <= now + 60
    && typeof v.expiresAt === 'number' && Number.isSafeInteger(v.expiresAt) && v.expiresAt > v.issuedAt
    && v.expiresAt - v.issuedAt === SHARE_TTL;
}
function configured(secret: string | undefined): secret is string {
  return typeof secret === 'string' && Buffer.byteLength(secret) >= 32;
}
export function createShareToken(
  input: Pick<ShareSnapshot, 'lat' | 'lng' | 'score' | 'tier' | 'title' | 'isMock'>,
  secret = process.env.SHARE_SIGNING_SECRET,
  now = Math.floor(Date.now() / 1000),
): string | undefined {
  if (!configured(secret)) return undefined;
  const coordinates = normalizeCoordinates(input.lat, input.lng);
  if (!coordinates) return undefined;
  const payload: ShareSnapshot = { ...input, lat: Number(coordinates.lat.toFixed(6)), lng: Number(coordinates.lng.toFixed(6)),
    scoringVersion: SCORING_VERSION, issuedAt: now, expiresAt: now + SHARE_TTL };
  if (!valid(payload, now)) return undefined;
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
}
export function readSignedShareToken(token: string | undefined, secret = process.env.SHARE_SIGNING_SECRET,
  now = Math.floor(Date.now() / 1000)): ShareSnapshot | null {
  if (!token || !configured(secret) || token.length > 1600 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  try {
    const [body, signature] = token.split('.');
    const received = Buffer.from(signature, 'base64url');
    if (received.toString('base64url') !== signature) return null;
    const expected = createHmac('sha256', secret).update(body).digest();
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const value: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return valid(value, now) ? value : null;
  } catch { return null; }
}

// Snapshot freshness is separate from the authenticated location's lifetime.
export function verifyShareToken(token: string | undefined, secret = process.env.SHARE_SIGNING_SECRET,
  now = Math.floor(Date.now() / 1000)): ShareSnapshot | null {
  const snapshot = readSignedShareToken(token, secret, now);
  return snapshot && snapshot.expiresAt > now ? snapshot : null;
}
