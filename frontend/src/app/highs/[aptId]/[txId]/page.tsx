import type { Metadata } from "next";
import Link from "next/link";
import { permanentRedirect, redirect } from "next/navigation";
import ShareButton from "@/components/ShareButton";
import { parseId } from "@/lib/canceledShare";
import { fetchAptTrade } from "@/lib/data";
import { formatArea, formatDeal, formatPrice, txGroup } from "@/lib/format";
import {
  BADGE_TEXT, highShareDiffText, highShareFooter, highShareTitle, highShareTx, type HighShareTx, SHARE_HIGHS_ENABLED,
} from "@/lib/highShare";
import { groupLabel, SUPPLY_ENABLED } from "@/lib/supply";
import { type AptTrade, isMoved } from "@/lib/types";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

export const revalidate = 3600;

/** 첫 요청 때 만들고 한 시간마다 다시 만든다(ISR). */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ aptId: string; txId: string }> };

const BADGE_CLASS = { high: "bg-red-600", up: "bg-orange-600" } as const;

const description = (tx: HighShareTx): string => {
  const diff = highShareDiffText(tx);
  const head = tx.canceled ? `${formatDeal(tx.dealDate)} 계약, 이후 취소.` : `${formatDeal(tx.dealDate)} 계약${diff ? `, ${diff}` : ""}.`;
  return `${head} 국토교통부 실거래가 신고 기준.`;
};

async function load(aptId: string, txId: string) {
  const a = parseId(aptId);
  const data = a ? await fetchAptTrade(a, { next: { revalidate } } as RequestInit).catch(() => null) : null;
  const t = parseId(txId);
  // 합쳐진 단지: 남은 단지의 같은 거래 주소로 영구 이동(거래가 없으면 거기서 단지 페이지로 간다)
  if (isMoved(data)) permanentRedirect(`/highs/${data.moved_to}/${t ?? txId}`);
  return { aptId: a, txId: t, data, tx: data && t ? highShareTx(data, t) : null };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { aptId, txId } = await params;
  const { txId: tid, data, tx } = await load(aptId, txId);
  if (!data || !tx) return { title: "거래를 찾을 수 없습니다", robots: { index: false } };
  const apt = data.apartment;
  const title = highShareTitle(apt.name, tx);
  const desc = description(tx);
  const image = `/api/og/highs/${apt.id}/${tid}`;
  return {
    title: { absolute: title },
    description: desc,
    alternates: { canonical: `/highs/${apt.id}/${tid}` },
    robots: { index: false },
    openGraph: {
      title,
      description: desc,
      type: "article",
      url: `/highs/${apt.id}/${tid}`,
      siteName: SITE_NAME,
      locale: "ko_KR",
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description: desc, images: [image] },
  };
}

/** 같은 단지 다른 평형의 최근 정상 거래 n건 */
function otherAreas(data: AptTrade, grp: number, n = 3) {
  return data.transactions
    .filter((t) => t.cancel_date == null && txGroup(t) !== grp)
    .sort((a, b) => (a.deal_date === b.deal_date ? b.id - a.id : a.deal_date < b.deal_date ? 1 : -1))
    .slice(0, n);
}

export default async function HighSharePage({ params }: Props) {
  const { aptId, txId } = await params;
  const { aptId: id, txId: tid, data, tx } = await load(aptId, txId);
  if (!data) redirect("/highs");
  if (!tx) redirect(`/apartment/${id}`);
  const apt = data.apartment;
  const title = highShareTitle(apt.name, tx);
  const image = `/api/og/highs/${apt.id}/${tid}`;
  const diff = highShareDiffText(tx);
  const area = SUPPLY_ENABLED && tx.supply ? formatArea(tx.m2, "pyeong", tx.supply) : `${tx.m2}㎡`;
  const meta = {
    title,
    description: description(tx),
    url: `${SITE_URL}/highs/${apt.id}/${tid}`,
    imageUrl: `${SITE_URL}${image}`,
  };
  const others = otherAreas(data, tx.m2);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- OG 카드 이미지를 그대로 보여준다 */}
      <img src={image} alt={title} width={1200} height={630} className="w-full rounded-2xl border border-gray-100" />
      <section className="space-y-2 rounded-2xl border border-gray-100 bg-white p-5">
        <div className="flex items-center gap-2">
          {tx.canceled ? (
            <span className="rounded bg-gray-500 px-2 py-0.5 text-xs font-medium text-white">신고 후 취소</span>
          ) : (
            tx.badge && <span className={`rounded px-2 py-0.5 text-xs font-medium text-white ${BADGE_CLASS[tx.badge]}`}>{BADGE_TEXT[tx.badge]}</span>
          )}
          <h1 className="text-sm text-gray-500">
            {apt.name} {area}
            {tx.floor != null && ` · ${tx.floor}층`}
          </h1>
        </div>
        <p className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold ${tx.canceled ? "text-gray-400 line-through" : "text-gray-900"}`}>{formatPrice(tx.amount)}</span>
          {tx.direct && <span className="text-sm text-gray-400">직거래</span>}
        </p>
        {diff && <p className={`text-sm font-semibold ${tx.badge === "high" ? "text-red-600" : "text-orange-600"}`}>{diff}</p>}
        <p className="text-xs text-gray-500">{highShareFooter(tx)}</p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {SHARE_HIGHS_ENABLED && tx.shareable && <ShareButton aptId={apt.id} meta={meta} imageUrl={image} />}
          <Link href={`/apartment/${apt.id}`} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            단지 전체 보기
          </Link>
          <Link href="/highs" className="text-sm text-blue-600 underline">
            최근 신고가 더 보기
          </Link>
        </div>
      </section>
      {others.length > 0 && (
        <section className="rounded-2xl border border-gray-100 bg-white p-5">
          <h2 className="mb-2 text-sm font-bold text-gray-900">이 단지 다른 평형 최근 거래</h2>
          <ul className="divide-y divide-gray-100 text-sm">
            {others.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-gray-700">
                <span>
                  <span className="text-gray-500">{formatDeal(t.deal_date)}</span>{" "}
                  {formatArea(txGroup(t), "pyeong", groupLabel(apt.area_types, txGroup(t)))}
                </span>
                <span className="font-semibold text-gray-900">
                  {formatPrice(t.amount)}
                  {t.direct && <span className="ml-1 text-xs font-normal text-gray-400">직거래</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-gray-500">신고 기준 숫자이며 이후 취소·정정으로 바뀔 수 있습니다. 국토교통부 실거래가 공개 자료 기준.</p>
    </div>
  );
}
