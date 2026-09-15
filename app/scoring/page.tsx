import type { Metadata } from 'next';
import { SCORE_MAX, TOTAL_SCORE_MAX, LIFESTYLE_MAX } from '@/lib/scoring';

export const metadata: Metadata = {
  title: '자취 생존점수 계산 기준과 데이터 출처',
  description: '100점 배점, 항목별 직선거리, 카카오 검색 범위와 데이터 한계를 설명합니다.',
  alternates: { canonical: '/scoring' },
};

const rows = [
  ['subway', '지하철', '350m 이내 20점 · 700m 이내 14점 · 1km 이내 8점. 기본점이 있고 2개 이상 노선이면 +2점.'],
  ['convenience', '편의점·빨래방', '편의점 150m 이내 10점 · 300m 이내 6점. 기본점이 있고 2개 이상 브랜드이면 +2점. 300m 내 코인빨래방은 별도로 +2점.'],
  ['martDaiso', '마트·다이소', '둘 중 가까운 시설이 400m 이내 10점 · 800m 이내 6점. 기본점이 있고 둘 다 있으면 +4점.'],
  ['deptStore', '백화점', '600m 이내 15점 · 1km 이내 10점 · 1.5km 이내 5점.'],
  ['cinema', '영화관', '500m 이내 10점 · 800m 이내 7점 · 1.2km 이내 4점.'],
  ['cafe', '카페', '150m 이내 7점 · 400m 이내 4점. 기본점이 있고 400m 내 스타벅스가 있으면 +2점.'],
  ['care', '올리브영·헬스장', '둘 중 가까운 시설이 250m 이내 6점 · 500m 이내 4점. 기본점이 있고 둘 다 있으면 +2점.'],
  ['medical', '병원·약국', '둘 중 가까운 시설이 250m 이내 8점 · 500m 이내 6점.'],
] as const;

export default function ScoringPage() {
  return <main className="mx-auto max-w-2xl px-4 py-10 text-slate-200 space-y-6">
    <h1 className="text-2xl font-bold">자취 생존점수는 어떻게 계산하나요?</h1>
    <p>생활시설 접근성을 {TOTAL_SCORE_MAX}점 만점으로 합산한 서비스 자체 기준입니다. 주거 안전·집 상태·임대료·소음·버스·경사도는 반영하지 않습니다.</p>
    <p>항목별 직선거리 기준 · 최대 1.5km. 가까운 거리 구간 하나만 적용하며 범위 밖의 기본점은 0점입니다.</p>
    <ul className="space-y-3">
      {rows.map(([key, label, rule]) => <li key={key} className="glass-card p-4 space-y-2">
        <h2 className="font-bold">{label} · 최대 {SCORE_MAX[key]}점</h2><p className="text-sm text-slate-300">{rule}</p>
      </li>)}
    </ul>
    <p>라이프스타일 소계 {LIFESTYLE_MAX}점. S 90~100 / A 75~89 / B 60~74 / C 45~59 / F 0~44.</p>
    <h2 className="text-xl font-bold">백화점이 왜 15점인가요?</h2>
    <p>현재 서비스는 쇼핑·문화시설 접근성을 라이프스타일에 포함해 백화점에 최대 15점을 부여합니다. 통계로 검증한 주거 만족도 예측값이 아닌 서비스의 배점 선택입니다. 본인에게 필요 없는 항목은 상세 점수에서 따로 확인하세요.</p>
    <h2 className="text-xl font-bold">0점이면 시설이 없다는 뜻인가요?</h2>
    <p>지정 범위·검색어·브랜드 필터 안에서 확인한 정보의 점수입니다. 영화관은 CGV·롯데시네마·메가박스를 대상으로 하며, 백화점 등에도 필터를 적용합니다. 검색당 최대 3페이지·45개 결과만 확인하므로 모든 시설을 보장하지 않습니다.</p>
    <p>12개 필수 조회 중 하나라도 실패하면 정상 점수 대신 재시도 안내를 제공합니다. REST 키가 없는 환경의 데모 점수는 선택한 위치의 평가가 아닙니다.</p>
    <h2 className="text-xl font-bold">데이터 출처와 최신성</h2>
    <p>카카오 로컬 API와 서비스에 포함된 지하철 노선 목록을 사용합니다. 시설 폐업·신규 등록·노선 변경 등이 늦게 반영될 수 있습니다. 동일 좌표의 시설 정보는 최대 10분 재사용하며, 중요한 시설은 방문 전에 직접 확인하세요.</p>
    <p>실제 이동 경로에는 횡단보도·출입구·담장 등이 영향을 줍니다. 직선거리만으로 도보 시간이나 거주 적합성을 판단하지 마세요.</p>
    <a href="/" className="inline-block text-brand-400 underline">지도에서 분석하기</a>
  </main>;
}
