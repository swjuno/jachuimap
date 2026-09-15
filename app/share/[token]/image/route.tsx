import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readSignedShareToken } from '@/lib/share-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const snapshot = readSignedShareToken((await params).token);
  if (!snapshot) return new Response('공유 링크를 확인해 주세요.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const font = await readFile(join(process.cwd(), 'public/fonts/NanumGothic-Bold.ttf'));
  const expired = snapshot.expiresAt <= Math.floor(Date.now() / 1000);
  const color = { S: '#fbbf24', A: '#a78bfa', B: '#60a5fa', C: '#fb923c', F: '#94a3b8' }[snapshot.tier];
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#0f172a',
      color: '#f8fafc', padding: '44px 64px', fontFamily: 'Nanum', border: `8px solid ${color}` }}>
      <div style={{ display: 'flex', fontSize: 32, justifyContent: 'space-between' }}>
        <span>자취 생존기 맵</span><span style={{ color }}>{snapshot.isMock ? '데모 데이터' : '공유 당시 결과'}</span>
      </div>
      {expired ? <div style={{ display: 'flex', fontSize: 60, marginTop: 80 }}>공유 결과가 만료되었습니다</div> : <div style={{ display: 'flex', alignItems: 'center', gap: 45, marginTop: 26 }}>
        <span style={{ fontSize: 148, color }}>{snapshot.score}</span>
        <span style={{ fontSize: 54 }}>/100</span>
        <span style={{ fontSize: 56, border: `3px solid ${color}`, borderRadius: 24, padding: '16px 28px', color }}>{snapshot.tier} 티어</span>
      </div>
      }
      <div style={{ display: 'flex', fontSize: 44, marginTop: 14 }}>{expired ? '같은 위치의 현재 점수를 확인하세요' : snapshot.title}</div>
      <div style={{ display: 'flex', fontSize: 36, marginTop: 28, color }}>너라면 여기서 살 수 있어?</div>
      <div style={{ display: 'flex', fontSize: 24, marginTop: 'auto', color: '#cbd5e1' }}>공유 당시 결과 · 현재 시설 정보에 따라 달라질 수 있음</div>
    </div>,
    { width: 1200, height: 630, fonts: [{ name: 'Nanum', data: font, weight: 700, style: 'normal' }],
      headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } },
  );
}
