export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-[var(--color-surface)] px-4 py-12 text-slate-200">
      <article className="mx-auto max-w-2xl space-y-6 glass-card p-6">
        <h1 className="text-2xl font-bold text-white">개인정보 처리방침 안내</h1>
        <p>자취 생존기 맵은 서비스 개선을 위해 익명화된 이용 이벤트를 Google Analytics로 측정할 수 있습니다.</p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
          <li>측정 항목은 분석 시작·완료·실패, 공유, PNG 저장, 재분석과 공유 링크 열기입니다.</li>
          <li>정확한 좌표, 주소, 검색어, 시설 정보, dynamicMessage, 정확한 점수는 분석 도구로 전송하지 않습니다.</li>
          <li>측정 ID가 없거나 개발 환경이면 분석 스크립트와 이벤트 전송을 사용하지 않습니다.</li>
          <li>브라우저의 쿠키 차단·삭제 및 추적 방지 설정으로 Google Analytics 쿠키를 거부할 수 있습니다.</li>
        </ul>
        <h2 className="font-bold">서비스 운영을 위한 일시 처리</h2>
        <p className="text-sm text-slate-300">시설 검색을 위해 선택한 좌표나 입력 주소를 카카오 로컬 API에 전달합니다. 운영 환경에서는 동일 좌표의 시설 정보를 서버 메모리에서 최대 10분 재사용합니다.</p>
        <p className="text-sm text-slate-300">과도한 요청을 줄이기 위해 Vercel이 전달한 IP를 서버 내부에서 일시적인 해시로 변환해 분당 요청 수를 제한합니다. 원본 IP나 해시는 GA4 또는 앱의 운영 로그에 기록하지 않습니다. 만료된 요청 집계는 이후 요청 시 제거되며 서버 재시작 시 초기화됩니다.</p>
        <p className="text-sm text-slate-300">앱 운영 로그에는 응답 상태, 공개 오류 코드, 처리 시간만 기록합니다. 호스팅 제공자의 기본 접속 로그는 별도 정책에 따라 처리될 수 있습니다.</p>
        <p className="text-xs text-slate-400">이 안내는 서비스의 데이터 측정 방식을 설명하며 법적 효력을 보장하는 문서가 아닙니다.</p>
        <a href="/" className="inline-block text-sm text-brand-400 underline">서비스로 돌아가기</a>
      </article>
    </main>
  );
}
