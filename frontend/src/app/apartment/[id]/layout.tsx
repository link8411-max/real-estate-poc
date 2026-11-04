import type { Metadata } from "next";
import { fetchAptRent, fetchAptTrade } from "@/lib/data";
import { isMoved } from "@/lib/types";
import { aptDescription, aptTitle, latestJeonse } from "@/lib/seo";

/** 단지 페이지는 첫 요청 때 만들고 한 시간마다 다시 만든다(generateStaticParams 없음). */
export const revalidate = 3600;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const n = Number(id);
  const data = Number.isSafeInteger(n) && n > 0 ? await fetchAptTrade(n, { next: { revalidate } } as RequestInit) : null;
  if (!data || isMoved(data)) return { title: "아파트를 찾을 수 없습니다", robots: { index: false } };

  const apt = data.apartment;
  const latest = data.transactions.find((t) => !t.cancel_date);
  const title = aptTitle(apt, latest);
  // 전세가율은 trade 지표에 있으나 전세 가격은 rent.json에만 있다
  const rent = await fetchAptRent(apt.id, { next: { revalidate } } as RequestInit);
  const jeonse = rent && !isMoved(rent) ? latestJeonse(rent.rents, data.metrics) : null;
  const description = aptDescription(apt, data.area_stats, jeonse);
  const url = `/apartment/${apt.id}`;
  const image = `/api/og/${apt.id}`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: "article", url, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function ApartmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
