# 자취 생존기 맵

항목별 직선거리 기준 · 최대 1.5km 내 인프라를 평가합니다. 도보 이동 거리와는 다릅니다.

## 점수 기준

| 항목 | 거리별 기본점 | 보너스 | 최대점 |
|---|---|---|---:|
| 지하철 | ≤350m: 20 / ≤700m: 14 / ≤1,000m: 8 | 기본점이 있고 2개 이상 노선이면 +2 | 22 |
| 편의점·빨래방 | 편의점 ≤150m: 10 / ≤300m: 6 | 기본점이 있고 2개 이상 브랜드 +2, 빨래방 존재 +2 | 14 |
| 마트·다이소 | 둘 중 최단거리 ≤400m: 10 / ≤800m: 6 | 기본점이 있고 둘 다 존재 +4 | 14 |
| 백화점 | ≤600m: 15 / ≤1,000m: 10 / ≤1,500m: 5 | 없음 | 15 |
| 영화관 | ≤500m: 10 / ≤800m: 7 / ≤1,200m: 4 | 없음 | 10 |
| 카페 | ≤150m: 7 / ≤400m: 4 | 기본점이 있고 스타벅스 존재 +2 | 9 |
| 올리브영·헬스장 | 둘 중 최단거리 ≤250m: 6 / ≤500m: 4 | 기본점이 있고 둘 다 존재 +2 | 8 |
| 병원·약국 | 둘 중 최단거리 ≤250m: 8 / ≤500m: 6 | 없음 | 8 |

거리 구간은 가까운 구간부터 적용하며, 범위 밖이거나 시설이 없으면 기본점은 0점입니다.
빨래방 보너스는 편의점이 없어도 적용합니다. 급행 별도 가점은 없습니다.
라이프스타일(백화점·영화관·카페·올리브영/헬스장·의료)은 50점,
전체는 22 + 14 + 14 + 50 = **100점**입니다. 별도 비율 정규화 없이 항목 점수를 합산합니다.

티어: **S 90~100 / A 75~89 / B 60~74 / C 45~59 / F 0~44**.
의료 배점 조정으로 500m 이내 의료시설이 있으면 기존보다 2점 높아집니다.
REST 키가 없는 데모 데이터는 기존 88점 A에서 **90점 S**가 되며 실제 위치의 점수가 아닙니다.

## Google Analytics 4 (선택)

GA4를 사용하려면 측정 ID를 환경변수로 등록합니다.

```bash
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

측정 ID가 없으면 GA 스크립트와 이벤트를 사용하지 않습니다. 개발·테스트 환경에서는 외부 이벤트를 전송하지 않으며, Vercel에서는 Project Settings → Environment Variables의 **Production** 환경에만 값을 등록하면 됩니다. 수집 이벤트는 분석 시작·완료·실패, 공유 클릭·완료·취소, PNG 저장, 재분석, 공유 링크 열기입니다.

서비스는 점수 구간·티어·공유 방식·모의 데이터 여부 같은 익명화된 이용 이벤트만 측정합니다. 정확한 점수, 좌표, 주소, 검색어, 시설명·개수, 분석 문구, 사용자 식별자와 이메일은 전송하지 않으며 광고 개인화 신호도 사용하지 않습니다.

실시간 확인은 GA4의 **Reports → Realtime**에서 이벤트 이름을 기준으로 확인할 수 있습니다. 로컬에서 동작을 점검할 때는 브라우저 콘솔이나 테스트 러너를 사용하세요.

검증: `npm test`, `npm run build`.

## 결과 공유

결과의 “카카오톡·DM으로 공유” 버튼은 실제 점수·티어·분석 문구와 위치 링크를 전달합니다.
시스템 공유 미지원 브라우저에서는 전체 문구와 URL을 복사합니다. “링크 복사”와 PNG 저장도 가능합니다.
공유 대상 앱은 기기에 설치된 앱과 브라우저 지원에 따라 다릅니다.

링크 예: `/?lat=37.556300&lng=126.923600&share=1`.
좌표는 소수점 6자리로 직렬화하며, 최초 진입 시 유효한 공유 좌표를 한 번만 자동 분석합니다.
점수·티어는 링크에서 가져오지 않고 서버에서 다시 계산하므로 시설 데이터가 바뀌면 결과도 달라질 수 있습니다.
잘못된 링크는 안내와 초기 화면을 표시하고, 조회 실패는 같은 위치로 재시도할 수 있습니다.
공유 링크에는 선택한 지도 위치가 포함됩니다. REST 키가 없으면 데모 표시가 유지됩니다.

공유 결과에는 서버에서 발급한 `/share/{shareToken}` 주소를 사용합니다. 토큰은 30일 동안만 유효하고 `SHARE_SIGNING_SECRET`으로 HMAC 서명됩니다. 서명은 위조를 막지만 토큰을 암호화하지 않으므로 토큰을 가진 사람은 공유 당시 좌표를 확인할 수 있습니다. 비밀키가 없으면 기존 `?lat=...&lng=...&share=1` 공유 방식으로 자동 대체됩니다. OG 미리보기는 토큰에 서명된 점수·티어만 사용하며 카카오 시설 검색을 실행하지 않습니다. 링크를 연 뒤에는 메인 화면이 좌표를 서버에 다시 보내 현재 시설 기준으로 재분석합니다.

Vercel Production 환경변수에는 다음 값을 등록합니다.

```bash
SHARE_SIGNING_SECRET=<위 명령으로 생성한 32바이트 이상 비밀값>
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

