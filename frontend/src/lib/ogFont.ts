import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * OG 라우트 공용 폰트. 폰트는 파일에서 읽는다 — next.config 의 outputFileTracingIncludes 로 번들에 포함.
 * 한글 서브셋(KS X 1001 2,350자 + ASCII, scripts/make_og_font.sh로 생성, OFL). 기본 폰트에는 한글이 없다.
 */
const FONT_PATH = path.join(process.cwd(), "public/fonts/NotoSansKR-Bold-subset.woff");
let fontData: Promise<Buffer> | null = null;
const loadFont = () => {
  fontData ??= readFile(FONT_PATH);
  fontData.catch(() => (fontData = null)); // 실패하면 다음 요청에서 다시 시도
  return fontData;
};

export const FONT_FAMILY = "NotoSansKR";

/** 폰트를 못 받으면 500 대신 기본 폰트로 그린다(한글은 깨지지만 이미지는 나간다). */
export async function options() {
  const size = { width: 1200, height: 630 };
  try {
    return { ...size, fonts: [{ name: FONT_FAMILY, data: await loadFont(), weight: 700 as const, style: "normal" as const }] };
  } catch (e) {
    console.error("OG font load failed", e);
    return size;
  }
}
