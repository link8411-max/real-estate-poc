import type { Metadata } from "next";
import HighsBoard from "@/components/HighsBoard";
import { fetchHighItems } from "@/lib/highs";
import { SITE_NAME } from "@/lib/seo";

export const revalidate = 3600;

const TITLE = "최근 신고가";
const DESCRIPTION = "최근 30일 계약된 수도권 아파트 중 같은 단지·평형의 이전 최고가를 넘은 신고가 거래 목록. 국토교통부 실거래가 공개 자료 기준.";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/highs" },
    openGraph: { title: TITLE, description: DESCRIPTION, url: "/highs", type: "website", siteName: SITE_NAME, locale: "ko_KR" },
    twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
  };
}

export default async function HighsPage() {
  const items = await fetchHighItems({ next: { revalidate } } as RequestInit);
  return <HighsBoard items={items} />;
}
