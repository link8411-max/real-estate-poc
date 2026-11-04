import type { Metadata } from "next";
import CanceledBoard from "@/components/CanceledBoard";
import { fetchCanceledRecent } from "@/lib/data";
import { kstToday } from "@/lib/metrics";
import type { CanceledHigh } from "@/lib/types";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "취소된 신고가",
    description: "신고가로 등록됐다가 거래 해제된 수도권 아파트 실거래 목록. 국토교통부 실거래가 공개 자료 기준.",
    alternates: { canonical: "/canceled" },
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
