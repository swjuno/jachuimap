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
        <p className="text-xs text-slate-400">이 안내는 서비스의 데이터 측정 방식을 설명하며 법적 효력을 보장하는 문서가 아닙니다.</p>
        <a href="/" className="inline-block text-sm text-brand-400 underline">서비스로 돌아가기</a>
      </article>
    </main>
  );
}
