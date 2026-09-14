import type { Metadata } from 'next';
import './globals.css';
import GoogleAnalytics from '@/components/GoogleAnalytics';

export const metadata: Metadata = {
  title: '자취 생존기 맵 | 내 자취방 인프라 생존 점수 측정기',
  description: '지하철, 편의점, 마트, 다이소, 올리브영까지! 항목별 직선거리 기준 · 최대 1.5km 인프라를 100점 만점으로 스캔해 드립니다.',
  metadataBase: new URL('https://jachuimap.vercel.app'),
  openGraph: {
    title: '자취 생존기 맵 🎯 내 방 인프라는 몇 점?',
    description: '편의점 슬세권부터 다이소, 지하철까지 1인 가구 맞춤 인프라 등급을 확인해보세요!',
    url: 'https://jachuimap.vercel.app',
    siteName: '자취 생존기 맵',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: '자취 생존기 맵 미리보기',
      },
    ],
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '자취 생존기 맵 🎯 내 방 인프라는 몇 점?',
    description: '편의점 슬세권부터 다이소, 지하철까지 100점 만점 인프라 스캔!',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      {/* suppressHydrationWarning 추가 */}
      <body className="antialiased" suppressHydrationWarning>
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
