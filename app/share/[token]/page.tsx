import ShareRedirect from '@/components/ShareRedirect';
import { readSignedShareToken } from '@/lib/share-token';
import { shareMetadata } from '@/lib/share-metadata';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ token: string }> };
export async function generateMetadata({ params }: Props) {
  return shareMetadata((await params).token);
}
export default async function SharePage({ params }: Props) {
  const snapshot = readSignedShareToken((await params).token);
  if (!snapshot) return <main className="p-10 text-slate-200">
    <h1>유효하지 않은 공유 링크입니다.</h1>
    <a href="/">지도에서 다시 분석하기</a>
  </main>;
  const expired = snapshot.expiresAt <= Math.floor(Date.now() / 1000);
  const href = '/?' + new URLSearchParams({ lat: String(snapshot.lat), lng: String(snapshot.lng), share: '1' });
  return <main className="p-10 text-slate-200">
    {expired ? <><h1>공유 결과가 만료되었습니다.</h1><p>같은 위치를 현재 시설 정보로 다시 분석합니다.</p></> : <>
    <h1>{snapshot.isMock ? '데모 데이터 · ' : ''}{snapshot.score}/100 · {snapshot.tier} 티어</h1>
    <p>{snapshot.title}</p>
    <p>공유 당시 결과 · 현재 시설 정보에 따라 달라질 수 있음</p>
    </>}
    <ShareRedirect href={href} />
  </main>;
}
