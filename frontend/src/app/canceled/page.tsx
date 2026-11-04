import type { Metadata } from "next";
import CanceledBoard from "@/components/CanceledBoard";
import { fetchCanceledRecent } from "@/lib/data";
import { kstToday } from "@/lib/metrics";
import { SITE_NAME } from "@/lib/seo";
import type { CanceledHigh } from "@/lib/types";

export const revalidate = 3600;

const TITLE = "취소된 신고가";
const DESCRIPTION = "신고가로 등록됐다가 거래 해제된 수도권 아파트 실거래 목록. 국토교통부 실거래가 공개 자료 기준.";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/canceled" },
    openGraph: { title: TITLE, description: DESCRIPTION, url: "/canceled", type: "website", siteName: SITE_NAME, locale: "ko_KR" },
    twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
  };
}

export default async function CanceledPage() {
  let items: CanceledHigh[] = [];
  try {
    const file = await fetchCanceledRecent({ next: { revalidate } } as RequestInit);
    items = file?.items ?? [];
  } catch {
    items = [];
  }
  return <CanceledBoard items={items} today={kstToday()} />;
}
