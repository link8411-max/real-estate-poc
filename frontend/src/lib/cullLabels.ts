export interface Point {
  x: number;
  y: number;
}

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const CHAR_PX = 7;
const PADDING_PX = 16;
const HEIGHT_PX = 22;
/** 두 줄 알약: 윗줄 10px + 아랫줄 12px 글자 + 위아래 패딩 */
const TWO_LINE_HEIGHT_PX = 32;
/** 윗줄(10px 글꼴) 글자 폭: 한글·㎡ 등은 10px, 숫자·기호는 5.5px */
const TOP_WIDE_PX = 10;
const TOP_NARROW_PX = 5.5;

const topWidth = (text: string) => [...text].reduce((w, c) => w + (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u3300-\u33ff]/.test(c) ? TOP_WIDE_PX : TOP_NARROW_PX), 0);

/**
 * 라벨 알약의 대략적인 화면 박스, 점 중심.
 * 한 줄: 폭 = 글자 수 × 7px + 16px, 높이 22px.
 * 두 줄(top 있음): 폭 = 두 줄 중 긴 쪽 + 16px, 높이 32px.
 */
export function labelBox(p: Point, label: string, top?: string | null): Box {
  const price = label.length * CHAR_PX;
  const w = (top ? Math.max(price, topWidth(top)) : price) + PADDING_PX;
  const h = top ? TWO_LINE_HEIGHT_PX : HEIGHT_PX;
  return { left: p.x - w / 2, right: p.x + w / 2, top: p.y - h / 2, bottom: p.y + h / 2 };
}

const intersects = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * 화면에서 겹치는 라벨을 거른다. 가중치(거래 수) 내림차순으로 놓되, 이미 놓은 라벨과 겹치면 버린다.
 * 반환은 남은 항목(가중치 내림차순, 동률은 입력 순서).
 */
export function cullLabels<T>(
  items: readonly T[],
  project: (item: T) => Point,
  opts: { label: (item: T) => string; weight: (item: T) => number; top?: (item: T) => string | null; occupied?: readonly Box[] },
): T[] {
  const sorted = items
    .map((item, i) => ({ item, i, w: opts.weight(item) }))
    .sort((a, b) => b.w - a.w || a.i - b.i);
  const kept: T[] = [];
  const boxes: Box[] = [];
  for (const { item, w } of sorted) {
    const box = labelBox(project(item), opts.label(item), opts.top?.(item));
    // occupied: 다른 레이어(정비사업)가 이미 차지한 자리. 가중치 무한(선택한 항목)은 피하지 않는다.
    if (w !== Infinity && opts.occupied?.some((b) => intersects(b, box))) continue;
    if (boxes.some((b) => intersects(b, box))) continue;
    boxes.push(box);
    kept.push(item);
  }
  return kept;
}
