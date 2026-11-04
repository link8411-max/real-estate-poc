import { ImageResponse } from "next/og";
import { parseId, shareTx } from "@/lib/canceledShare";
import { fetchAptTrade } from "@/lib/data";
import { formatDeal, formatPrice } from "@/lib/format";
import { FONT_FAMILY, options } from "@/lib/ogFont";

// Node 런타임(엣지 아님). 폰트 로더는 lib/ogFont.ts.
async function message(text: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#F8FAFC",
          fontSize: 36,
          color: "#64748B",
          fontFamily: FONT_FAMILY,
        }}
      >
        {text}
      </div>
    ),
    { ...(await options()), headers: { "cache-control": "public, max-age=300" } },
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ aptId: string; txId: string }> }) {
  const p = await params;
  const aptId = parseId(p.aptId);
  const txId = parseId(p.txId);
  const data = aptId && txId ? await fetchAptTrade(aptId).catch(() => null) : null;
  const tx = data && txId ? shareTx(data, txId) : null;
  if (!data || !tx) return message("거래 정보를 찾을 수 없습니다");

  const header = !tx.canceled ? "실거래" : tx.isHigh ? "취소된 신고가" : "취소된 거래";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#111827",
          padding: 60,
          fontFamily: FONT_FAMILY,
          color: "#F9FAFB",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#9CA3AF" }}>{`zipsise.com · ${header}`}</div>
        <div style={{ display: "flex", marginTop: 30, fontSize: 56, fontWeight: 700 }}>
          {data.apartment.name} {tx.pyeong}평
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
          <span style={{ fontSize: 26, color: "#9CA3AF" }}>{tx.canceled ? "신고된 가격" : "거래 가격"}</span>
          <span
            style={{
              fontSize: 84,
              fontWeight: 700,
              color: tx.canceled ? "#FB7185" : "#F9FAFB",
              textDecoration: tx.canceled ? "line-through" : "none",
            }}
          >{formatPrice(tx.amount)}</span>
        </div>
        {tx.prevMax != null && (
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 20 }}>
            <span style={{ fontSize: 26, color: "#9CA3AF" }}>직전 최고가</span>
            <span style={{ fontSize: 44, fontWeight: 700, marginLeft: 20 }}>{formatPrice(tx.prevMax)}</span>
          </div>
        )}
        <div style={{ display: "flex", marginTop: "auto", fontSize: 30, color: "#D1D5DB" }}>
          {tx.canceled
            ? `${formatDeal(tx.dealDate)} 계약 → ${formatDeal(tx.cancelIso!)} 취소 (${tx.days}일)`
            : `${formatDeal(tx.dealDate)} 계약`}
        </div>
      </div>
    ),
    await options(),
  );
}
