import 'server-only';
import type { Metadata } from 'next';
import { readSignedShareToken } from '@/lib/share-token';

export function shareMetadata(
  token: string,
  secret = process.env.SHARE_SIGNING_SECRET,
  now = Math.floor(Date.now() / 1000),
): Metadata {
  const signed = readSignedShareToken(token, secret, now);
  const snapshot = signed && signed.expiresAt > now ? signed : null;
  const title = snapshot
    ? `${snapshot.isMock ? '데모 데이터 · ' : ''}${snapshot.score}점 · ${snapshot.tier} 티어 | 자취 생존기 맵`
    : signed ? '공유 결과가 만료되었습니다 | 자취 생존기 맵' : '공유 링크를 확인해 주세요 | 자취 생존기 맵';
  const description = snapshot
    ? `${snapshot.title} · 공유 당시 결과 · 현재 시설 정보에 따라 달라질 수 있음`
    : signed ? '같은 위치를 현재 시설 정보로 다시 분석할 수 있습니다.' : '유효하지 않은 공유 링크입니다. 지도에서 다시 분석해 주세요.';
  const images = signed ? [{ url: `/share/${token}/image`, width: 1200, height: 630, alt: title }] : [];
  return { title, description, robots: { index: false, follow: false }, referrer: 'no-referrer',
    openGraph: { title, description, type: 'website', images, url: signed ? `/share/${token}` : '/'},
    twitter: { card: 'summary_large_image', title, description, images } };
}
