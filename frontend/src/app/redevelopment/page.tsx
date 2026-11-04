import type { Metadata } from "next";
import ZonesBoard from "@/components/ZonesBoard";
import { fetchZoneItems } from "@/lib/redevelopment";
import { SITE_NAME } from "@/lib/seo";

export const revalidate = 3600;

const TITLE = "재건축·재개발 현황";
const DESCRIPTION = "서울·경기·인천 재건축·재개발 정비구역의 사업 추진 단계, 세대수, 사업시행자. 국토교통부 전국 도시정비사업 통합 데이터 기준.";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/redevelopment" },
    openGraph: { title: TITLE, description: DESCRIPTION, url: "/redevelopment", type: "website", siteName: SITE_NAME, locale: "ko_KR" },
    twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
  };
}

export default async function RedevelopmentPage() {
  // 파일이 아직 R2에 없어도 빈 상태로 렌더한다(500 아님)
  const zones = await fetchZoneItems({ next: { revalidate } } as RequestInit);
  return <ZonesBoard zones={zones} />;
}
