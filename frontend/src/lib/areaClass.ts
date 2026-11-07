/**
 * 같은 평형대를 한 묶음으로 보는 규칙 (pipeline/area_class.py 와 같은 규칙).
 * 1. 서로 다른 면적 오름차순. 2. 앞 면적과 차이 < 1.0㎡ 이고 묶음 첫 면적과 차이 < 2.0㎡ 이면 같은 묶음.
 * 3. 라벨 = 거래 수가 가장 많은 면적의 버림 정수(동률이면 작은 면적).
 * 공용 픽스처: tests/fixtures/area_class_cases.json
 */
const STEP_GAP = 1.0;
const SPAN_GAP = 2.0;

export function areaClassMap(areas: Array<[number, number]>): Map<number, number> {
  const counts = new Map<number, number>();
  for (const [a, n] of areas) counts.set(a, (counts.get(a) ?? 0) + n);
  const out = new Map<number, number>();
  let group: number[] = [];
  const flush = () => {
    if (group.length === 0) return;
    let best = group[0];
    for (const a of group) if ((counts.get(a) ?? 0) > (counts.get(best) ?? 0)) best = a;
    const label = Math.floor(best);
    for (const a of group) out.set(a, label);
  };
  for (const a of [...counts.keys()].sort((x, y) => x - y)) {
    if (group.length > 0 && a - group[group.length - 1] < STEP_GAP && a - group[0] < SPAN_GAP) {
      group.push(a);
    } else {
      flush();
      group = [a];
    }
  }
  flush();
  return out;
}
