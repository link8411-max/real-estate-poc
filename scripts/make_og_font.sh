#!/usr/bin/env bash
# OG 이미지(/api/og/[id])용 한글 서브셋 폰트를 만든다 (Task 16b).
#
#   bash scripts/make_og_font.sh
#
# 필요: 워크트리 .venv 에 fonttools (.venv/bin/pip install fonttools brotli)
# 결과: frontend/public/fonts/NotoSansKR-Bold-subset.woff (+ OFL.txt)
# 글자: KS X 1001 완성형 한글 2,350자(EUC-KR 0xB0A1–0xC8FE) + ASCII + 가격·면적 표기 기호.
# satori(@vercel/og)는 woff2를 못 읽어 WOFF(zlib)로 낸다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/.venv/bin/python"
OUT_DIR="$ROOT/frontend/public/fonts"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

BASE="https://github.com/google/fonts/raw/main/ofl/notosanskr"
curl -fsSL -o "$WORK/NotoSansKR-VF.ttf" "$BASE/NotoSansKR%5Bwght%5D.ttf"
curl -fsSL -o "$WORK/OFL.txt" "$BASE/OFL.txt"

# 가변 폰트 → Bold(700) 고정 인스턴스
"$PY" -I -m fontTools.varLib.instancer "$WORK/NotoSansKR-VF.ttf" wght=700 -o "$WORK/NotoSansKR-Bold.ttf"

# 글자 목록: 완성형 2,350자 + 인쇄 가능 ASCII + 기호
"$PY" -I - "$WORK/chars.txt" <<'EOF'
import sys
hangul = []
for lead in range(0xB0, 0xC9):
    for trail in range(0xA1, 0xFF):
        try:
            hangul.append(bytes([lead, trail]).decode("euc-kr"))
        except UnicodeDecodeError:
            pass
assert len(hangul) == 2350, len(hangul)
ascii_ = "".join(chr(c) for c in range(0x20, 0x7F))
extra = "억만원㎡평·~–—…「」『』()%↑↓▲▼±×"
open(sys.argv[1], "w", encoding="utf-8").write("".join(hangul) + ascii_ + extra)
EOF

mkdir -p "$OUT_DIR"
"$PY" -I -m fontTools.subset "$WORK/NotoSansKR-Bold.ttf" \
  --text-file="$WORK/chars.txt" \
  --layout-features='*' \
  --no-hinting \
  --flavor=woff \
  --output-file="$OUT_DIR/NotoSansKR-Bold-subset.woff"
cp "$WORK/OFL.txt" "$OUT_DIR/OFL.txt"
ls -l "$OUT_DIR/NotoSansKR-Bold-subset.woff"
