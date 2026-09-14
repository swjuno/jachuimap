import { normalizeCoordinates, type Coordinates } from '@/lib/coordinates';
import type { TierResult } from '@/types/score';

// Six decimal places: roughly 0.1m, well below the scoring distance bands.
const COORDINATE_DECIMALS = 6;

export type SharedLocation =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'valid'; coordinates: Coordinates };

export function parseSharedLocation(search: string): SharedLocation {
  const params = new URLSearchParams(search);
  if (params.get('share') !== '1') return { kind: 'none' };
  const lat = params.get('lat');
  const lng = params.get('lng');
  if (!lat?.trim() || !lng?.trim() || params.getAll('lat').length !== 1 || params.getAll('lng').length !== 1) {
    return { kind: 'invalid' };
  }
  const coordinates = normalizeCoordinates(Number(lat), Number(lng));
  return coordinates ? { kind: 'valid', coordinates } : { kind: 'invalid' };
}

/** Consume before starting async work; effect replay cannot start another request. */
export function restoreSharedLocationOnce(
  consumed: { current: boolean },
  readSearch: () => string,
  analyze: (coordinates: Coordinates) => void,
): SharedLocation {
  if (consumed.current) return { kind: 'none' };
  consumed.current = true;
  const shared = parseSharedLocation(readSearch());
  if (shared.kind === 'valid') analyze(shared.coordinates);
  return shared;
}

export function buildShareUrl(href: string, coordinates: Coordinates, shareToken?: string): string {
  const valid = normalizeCoordinates(coordinates.lat, coordinates.lng);
  if (!valid) throw new Error('공유할 위치가 올바르지 않습니다.');
  const url = new URL(href);
  url.hash = '';
  if (shareToken && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(shareToken) && shareToken.length <= 1600) {
    url.pathname = '/share/' + shareToken;
    url.search = '';
    return url.toString();
  }
  url.pathname = '/';
  // Only location is shared; remove stale address, score and unrelated options.
  url.search = new URLSearchParams({
    lat: valid.lat.toFixed(COORDINATE_DECIMALS),
    lng: valid.lng.toFixed(COORDINATE_DECIMALS),
    share: '1',
  }).toString();
  return url.toString();
}

export interface ResultShareData {
  title: string;
  text: string;
  url: string;
}

export function buildResultShareData(
  tier: TierResult,
  url: string,
  isMock = false,
): ResultShareData {
  const characters = Array.from(tier.breakdown.dynamicMessage.trim());
  const commentary = characters.length > 160 ? `${characters.slice(0, 159).join('')}…` : characters.join('');
  return {
    title: tier.title,
    text: [
      isMock ? '데모 데이터 · 실제 선택한 위치의 분석 결과가 아닙니다.' : '',
      `🏠 이 동네 자취 생존점수는 ${tier.score}점, ${tier.tier}티어!`,
      commentary,
      '너라면 여기서 살 수 있어? 👀',
    ].filter(Boolean).join('\n'),
    url,
  };
}

interface SharePlatform {
  share?: (data: ResultShareData) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

export async function shareResult(
  data: ResultShareData,
  platform: SharePlatform,
): Promise<'shared' | 'copied' | 'cancelled'> {
  const copy = async (): Promise<'copied'> => {
    if (!platform.clipboard) throw new Error('이 브라우저에서는 클립보드에 복사할 수 없습니다.');
    await platform.clipboard.writeText(`${data.title}\n${data.text}\n${data.url}`);
    return 'copied';
  };

  if (typeof platform.share === 'function') {
    try {
      await platform.share(data);
      return 'shared';
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') {
        return 'cancelled';
      }
      // A real share failure can still succeed through the clipboard.
      if (platform.clipboard) return copy();
      throw error;
    }
  }
  return copy();
}

