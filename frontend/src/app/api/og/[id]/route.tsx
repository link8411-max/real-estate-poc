import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "@vercel/og";
import { fetchAptTrade } from "@/lib/data";
import { areaGroup, formatPrice } from "@/lib/format";

/**
 * Node 런타임(엣지 함수 크기 제한을 피함). 폰트는 파일에서 읽는다 — next.config 의 outputFileTracingIncludes 로 번들에 포함.
 * 한글 서브셋(KS X 1001 2,350자 + ASCII, scripts/make_og_font.sh로 생성, OFL). 기본 폰트에는 한글이 없다.
 */
const FONT_PATH = path.join(process.cwd(), "public/fonts/NotoSansKR-Bold-subset.woff");
let fontData: Promise<Buffer> | null = null;
const loadFont = () => {
  fontData ??= readFile(FONT_PATH);
  fontData.catch(() => (fontData = null)); // 실패하면 다음 요청에서 다시 시도
  return fontData;
};

const FONT_FAMILY = "NotoSansKR";

/** 폰트를 못 받으면 500 대신 기본 폰트로 그린다(한글은 깨지지만 이미지는 나간다). */
async function options() {
  const size = { width: 1200, height: 630 };
  try {
    return { ...size, fonts: [{ name: FONT_FAMILY, data: await loadFont(), weight: 700 as const, style: "normal" as const }] };
  } catch (e) {
    console.error("OG font load failed", e);
    return size;
  }
}

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
    await options(),
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const data = Number.isSafeInteger(id) && id > 0 ? await fetchAptTrade(id).catch(() => null) : null;
  if (!data) return message("아파트 정보를 찾을 수 없습니다");

  const apt = data.apartment;
  const latest = data.transactions.find((t) => !t.cancel_date);
  const recovery = data.metrics.recovery_rate;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#FFFFFF",
          padding: 60,
          fontFamily: FONT_FAMILY,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#64748B" }}>
          <span>{apt.region_name}</span>
          <span>수도권 아파트 실거래가</span>
        </div>
        <div style={{ display: "flex", marginTop: 30, fontSize: 60, fontWeight: 700, color: "#1E293B" }}>{apt.name}</div>
        {latest ? (
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 24 }}>
            <span style={{ fontSize: 76, fontWeight: 700, color: "#2563EB" }}>{formatPrice(latest.amount)}</span>
            <span style={{ fontSize: 30, color: "#64748B", marginLeft: 24 }}>
              {areaGroup(latest.area)}㎡ · {latest.deal_date}
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", marginTop: 24, fontSize: 36, color: "#94A3B8" }}>거래 정보 없음</div>
        )}
        {recovery != null && recovery < 100 && (
          <div style={{ display: "flex", marginTop: 36 }}>
            <span style={{ backgroundColor: "#DBEAFE", color: "#1D4ED8", padding: "12px 24px", borderRadius: 999, fontSize: 26 }}>
              전고점 대비 -{Math.round(100 - recovery)}%
            </span>
          </div>
        )}
        <div style={{ display: "flex", marginTop: "auto", paddingTop: 30, borderTop: "1px solid #E2E8F0", fontSize: 24, color: "#94A3B8" }}>
          {apt.build_year ? `${apt.build_year}년 준공` : ""}
        </div>
      </div>
    ),
    await options(),
  );
}
