import type { Metadata } from "next";
import Link from "next/link";
import { permanentRedirect, redirect } from "next/navigation";
import ShareButton from "@/components/ShareButton";
import { parseId, shareArea, type ShareTx, shareTx } from "@/lib/canceledShare";
import { fetchAptTrade } from "@/lib/data";
import { formatArea, formatDeal, formatPrice } from "@/lib/format";
import { SUPPLY_ENABLED } from "@/lib/supply";
import { isMoved } from "@/lib/types";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

export const revalidate = 3600;

/** 첫 요청 때 만들고 한 시간마다 다시 만든다(ISR). */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ aptId: string; txId: string }> };

const shareTitle = (name: string, tx: ShareTx) =>
  `${name} ${shareArea(tx)} ${formatPrice(tx.amount)}${tx.canceled ? " 신고 후 취소" : ""}`;

const shareDescription = (tx: ShareTx) =>
  tx.canceled
    ? `${formatDeal(tx.dealDate)} 계약, ${formatDeal(tx.cancelIso!)} 취소. 국토교통부 실거래가 공개 자료 기준.`
    : "국토교통부 실거래가 공개 자료 기준.";

async function load(aptId: string, txId: string) {
  const a = parseId(aptId);
  const data = a ? await fetchAptTrade(a, { next: { revalidate } } as RequestInit).catch(() => null) : null;
  const t = parseId(txId);
  // 합쳐진 단지: 남은 단지의 같은 거래 주소로 영구 이동(거래가 없으면 거기서 단지 페이지로 간다)
  if (isMoved(data)) permanentRedirect(`/canceled/${data.moved_to}/${t ?? txId}`);
  return { aptId: a, txId: t, data, tx: data && t ? shareTx(data, t) : null };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { aptId, txId } = await params;
  const { txId: tid, data, tx } = await load(aptId, txId);
  if (!data || !tx) return { title: "거래를 찾을 수 없습니다", robots: { index: false } };
  const apt = data.apartment;
  const title = shareTitle(apt.name, tx);
  const description = shareDescription(tx);
  const image = `/api/og/canceled/${apt.id}/${tid}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/canceled/${apt.id}/${tid}` },
    robots: { index: false },
    openGraph: {
      title,
      description,
      type: "article",
      url: `/canceled/${apt.id}/${tid}`,
      siteName: SITE_NAME,
      locale: "ko_KR",
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function CanceledSharePage({ params }: Props) {
  const { aptId, txId } = await params;
  const { aptId: id, txId: tid, data, tx } = await load(aptId, txId);
  if (!data) redirect("/canceled");
  if (!tx) redirect(`/apartment/${id}`);
  const apt = data.apartment;
  const url = `${SITE_URL}/canceled/${apt.id}/${tid}`;
  const title = shareTitle(apt.name, tx);
  const meta = {
    title,
    description: shareDescription(tx),
    url,
    imageUrl: `${SITE_URL}/api/og/canceled/${apt.id}/${tid}`,
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <section className="space-y-2 rounded-2xl border border-gray-100 bg-white p-5">
        <p className="text-sm text-gray-500">
          {SUPPLY_ENABLED ? `${apt.name} ${formatArea(tx.m2, "pyeong", tx.supply)}` : `${apt.name} 전용 ${tx.pyeong}평`}
        </p>
        <p className="text-3xl font-bold text-gray-900">{formatPrice(tx.amount)}</p>
        <p className="text-sm text-gray-700">{formatDeal(tx.dealDate)} 계약</p>
        {tx.canceled ? (
          <>
            <p className="text-sm text-rose-600">
              {formatDeal(tx.cancelIso!)} 취소 ({tx.days}일 만에)
            </p>
            {tx.isHigh && tx.prevMax != null && tx.jump != null && (
              <p className="text-sm text-gray-700">
                당시 직전 최고가 {formatPrice(tx.prevMax)}보다 {formatPrice(tx.jump)} 높았던 거래
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-700">이 거래는 취소 내역이 없습니다</p>
        )}
        <div className="flex items-center gap-3 pt-2">
          <ShareButton aptId={apt.id} meta={meta} />
          <Link href={`/apartment/${apt.id}`} className="text-sm text-blue-600 underline">
            {apt.name} 시세 보기
          </Link>
          <Link href="/canceled" className="text-sm text-blue-600 underline">
            취소된 신고가 더 보기
          </Link>
        </div>
      </section>
      <p className="text-xs text-gray-500">거래 해제는 대출 불발·계약 합의 해지 등 여러 이유로 생깁니다. 국토교통부 실거래가 공개 자료 기준.</p>
    </div>
  );
}
