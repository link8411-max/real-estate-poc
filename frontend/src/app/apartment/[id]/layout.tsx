import type { Metadata } from "next";
import { fetchAptTrade } from "@/lib/data";
import { aptDescription, aptTitle } from "@/lib/seo";

/** 단지 페이지는 첫 요청 때 만들고 한 시간마다 다시 만든다(generateStaticParams 없음). */
export const revalidate = 3600;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const n = Number(id);
  const data = Number.isSafeInteger(n) && n > 0 ? await fetchAptTrade(n, { next: { revalidate } } as RequestInit) : null;
  if (!data) return { title: "아파트를 찾을 수 없습니다", robots: { index: false } };

  const apt = data.apartment;
  const latest = data.transactions.find((t) => !t.cancel_date);
  const title = aptTitle(apt, latest);
  const description = aptDescription(apt, data.area_stats);
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
