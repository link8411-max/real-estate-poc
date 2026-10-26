import type { Metadata } from "next";
import { fetchAptTrade } from "@/lib/data";
import { formatPrice } from "@/lib/format";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const n = Number(id);
  const data = Number.isSafeInteger(n) && n > 0 ? await fetchAptTrade(n) : null;
  if (!data) return { title: "아파트를 찾을 수 없습니다" };

  const apt = data.apartment;
  const latest = data.transactions.find((t) => !t.cancel_date);
  const title = `${apt.name} 실거래가`;
  const description = [
    `${apt.region_name} ${apt.dong} ${apt.name}`,
    latest && `최근 거래 ${formatPrice(latest.amount)} (${Math.round(latest.area)}㎡, ${latest.deal_date})`,
    apt.build_year && `${apt.build_year}년 준공`,
  ]
    .filter(Boolean)
    .join(". ");
  const image = `/api/og/${apt.id}`;

  return {
    title,
    description,
    openGraph: { title, description, type: "article", url: `/apartment/${apt.id}`, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function ApartmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
