"use client";

import { useAreaUnit } from "@/lib/areaUnit";
import { formatArea } from "@/lib/format";

/** 서버 컴포넌트 안에서 평/㎡ 선택값에 맞춰 면적을 보여 주는 작은 클라이언트 조각 */
export default function HighArea({ area }: { area: number }) {
  const [unit] = useAreaUnit();
  return <>{formatArea(area, unit)}</>;
}
