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

검증: `npm test`, `npm run build`.

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
