import { ImageResponse } from "next/og";
import { parseId } from "@/lib/canceledShare";
import { fetchAptTrade } from "@/lib/data";
import { formatArea, formatPrice } from "@/lib/format";
import { BADGE_TEXT, highShareDiffText, highShareFooter, highShareTx, type HighShareTx } from "@/lib/highShare";
import { SUPPLY_ENABLED } from "@/lib/supply";
import { isMoved } from "@/lib/types";
import { FONT_FAMILY, options } from "@/lib/ogFont";

// Node 런타임(엣지 아님). 폰트 로더는 lib/ogFont.ts. 카드 C안: 흰 바탕, 왼쪽 숫자, 오른쪽 1년 흐름 선, 아래 출처 띠.
const BADGE_COLOR = { high: "#DC2626", up: "#EA580C" } as const;
const CHART_W = 380;
const CHART_H = 280;

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

/** 같은 평형 1년 거래 흐름 선과 이번 거래 점 (SVG) */
function Chart({ tx }: { tx: HighShareTx }) {
  const pts = tx.series;
  if (pts.length === 0) return null;
  const xs = pts.map((p) => Date.parse(p.date));
  const ys = pts.map((p) => p.amount);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const pad = 16;
  const px = (x: number) => (x1 === x0 ? CHART_W / 2 : pad + ((x - x0) / (x1 - x0)) * (CHART_W - 2 * pad));
  const py = (y: number) => (y1 === y0 ? CHART_H / 2 : CHART_H - pad - ((y - y0) / (y1 - y0)) * (CHART_H - 2 * pad));
  const line = pts.map((p) => `${px(Date.parse(p.date)).toFixed(1)},${py(p.amount).toFixed(1)}`).join(" ");
  const me = pts.findIndex((p) => p.date === tx.dealDate && p.amount === tx.amount);
  const color = tx.canceled ? "#9CA3AF" : tx.badge ? BADGE_COLOR[tx.badge] : "#111827";
  return (
    <svg width={CHART_W} height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
      <polyline points={line} fill="none" stroke="#94A3B8" strokeWidth={4} strokeLinejoin="round" />
      {me >= 0 && <circle cx={px(xs[me])} cy={py(ys[me])} r={12} fill={color} />}
    </svg>
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ aptId: string; txId: string }> }) {
  const p = await params;
  const aptId = parseId(p.aptId);
  const txId = parseId(p.txId);
  let raw = aptId && txId ? await fetchAptTrade(aptId).catch(() => null) : null;
  if (isMoved(raw)) raw = await fetchAptTrade(raw.moved_to).catch(() => null); // 합쳐진 단지: 남은 단지로 그린다
  const data = isMoved(raw) ? null : raw;
  const tx = data && txId ? highShareTx(data, txId) : null;
  if (!data || !tx) return message("거래 정보를 찾을 수 없습니다");

  const area = SUPPLY_ENABLED && tx.supply ? formatArea(tx.m2, "pyeong", tx.supply) : `${tx.m2}㎡`;
  const diff = highShareDiffText(tx);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#FFFFFF",
          fontFamily: FONT_FAMILY,
          color: "#111827",
        }}
      >
        <div style={{ display: "flex", flex: 1, padding: "52px 60px 0 60px" }}>
          <div style={{ display: "flex", flexDirection: "column", width: 700 }}>
            {tx.canceled ? (
              <div style={{ display: "flex" }}>
                <span style={{ fontSize: 30, color: "#FFFFFF", backgroundColor: "#6B7280", borderRadius: 10, padding: "6px 18px" }}>신고 후 취소</span>
              </div>
            ) : tx.badge ? (
              <div style={{ display: "flex" }}>
                <span style={{ fontSize: 30, color: "#FFFFFF", backgroundColor: BADGE_COLOR[tx.badge], borderRadius: 10, padding: "6px 18px" }}>
                  {BADGE_TEXT[tx.badge]}
                </span>
              </div>
            ) : null}
            <div style={{ display: "flex", marginTop: 26, fontSize: 50, fontWeight: 700 }}>{data.apartment.name}</div>
            <div style={{ display: "flex", marginTop: 10, fontSize: 32, color: "#4B5563" }}>
              {tx.floor != null ? `${area} · ${tx.floor}층` : area}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 26, whiteSpace: "nowrap" }}>
              <span
                style={{
                  fontSize: 76,
                  fontWeight: 700,
                  color: tx.canceled ? "#9CA3AF" : "#111827",
                  textDecoration: tx.canceled ? "line-through" : "none",
                }}
              >
                {formatPrice(tx.amount)}
              </span>
              {tx.direct && <span style={{ fontSize: 30, color: "#9CA3AF", marginLeft: 16, whiteSpace: "nowrap" }}>직거래</span>}
            </div>
            {diff && tx.badge && (
              <div style={{ display: "flex", marginTop: 12, fontSize: 36, fontWeight: 700, color: BADGE_COLOR[tx.badge] }}>{diff}</div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1 }}>
            <Chart tx={tx} />
            <span style={{ fontSize: 22, color: "#9CA3AF", marginTop: 8 }}>같은 평형 최근 1년 거래</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            padding: "22px 60px",
            backgroundColor: "#F3F4F6",
            fontSize: 26,
            color: "#4B5563",
          }}
        >
          {highShareFooter(tx)}
        </div>
      </div>
    ),
    // 기본값(1년 immutable)이면 취소·정정 뒤에도 낡은 "신고가" 카드가 CDN·브라우저에 남는다 → 10분
    { ...(await options()), headers: { "cache-control": "public, max-age=600, s-maxage=600" } },
  );
}
