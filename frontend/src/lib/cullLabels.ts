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

/** 라벨 알약의 대략적인 화면 박스: 폭 = 글자 수 × 7px + 16px, 높이 22px, 점 중심. */
export function labelBox(p: Point, label: string): Box {
  const w = label.length * CHAR_PX + PADDING_PX;
  return { left: p.x - w / 2, right: p.x + w / 2, top: p.y - HEIGHT_PX / 2, bottom: p.y + HEIGHT_PX / 2 };
}

const intersects = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * 화면에서 겹치는 라벨을 거른다. 가중치(거래 수) 내림차순으로 놓되, 이미 놓은 라벨과 겹치면 버린다.
 * 반환은 남은 항목(가중치 내림차순, 동률은 입력 순서).
 */
export function cullLabels<T>(
  items: readonly T[],
  project: (item: T) => Point,
  opts: { label: (item: T) => string; weight: (item: T) => number },
): T[] {
  const sorted = items
    .map((item, i) => ({ item, i, w: opts.weight(item) }))
    .sort((a, b) => b.w - a.w || a.i - b.i);
  const kept: T[] = [];
  const boxes: Box[] = [];
  for (const { item } of sorted) {
    const box = labelBox(project(item), opts.label(item));
    if (boxes.some((b) => intersects(b, box))) continue;
    boxes.push(box);
    kept.push(item);
  }
  return kept;
}
