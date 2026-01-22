import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://sudogwon.com';

export const metadata: Metadata = {
  title: {
    default: '수도권 아파트 실거래가 - 서울/경기/인천',
    template: '%s | 수도권 실거래가'
  },
  description: '서울, 경기, 인천 78개 지역 아파트 실거래가 조회. 전고점 대비, 급매 지수, 층별 프리미엄 등 차별화된 분석 제공.',
  keywords: ['아파트 실거래가', '부동산', '서울 아파트', '경기 아파트', '인천 아파트', '전세가', '매매가', '실거래', '부동산 시세'],
  authors: [{ name: '수도권 실거래가' }],
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: SITE_URL,
    siteName: '수도권 실거래가',
    title: '수도권 아파트 실거래가 - 서울/경기/인천',
    description: '서울, 경기, 인천 78개 지역 아파트 실거래가 조회. 전고점 대비, 급매 지수, 층별 프리미엄 등 차별화된 분석 제공.',
    images: [
      {
        url: `${SITE_URL}/og-default.png`,
        width: 1200,
        height: 630,
        alt: '수도권 아파트 실거래가'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: '수도권 아파트 실거래가',
    description: '서울, 경기, 인천 78개 지역 아파트 실거래가 조회'
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1
    }
  },
  verification: {
    // Google Search Console, Naver Webmaster Tools 등 추가 가능
    // google: 'your-google-verification-code',
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
