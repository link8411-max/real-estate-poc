import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "지도",
  description: "지도에서 수도권 아파트 실거래가와 전세가를 한눈에 탐색하세요.",
  // 필터·좌표 쿼리(?lat=…)가 붙어도 정식 주소는 /map
  alternates: { canonical: "/map" },
};

/** 카카오맵 SDK는 KakaoMap 컴포넌트가 next/script로 이 경로에서만 불러온다. */
export default function MapLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
