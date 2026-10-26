"use client";

import { useAreaUnit } from "@/lib/areaUnit";
import { formatArea, formatExactArea } from "@/lib/format";

/** 서버 컴포넌트 본문에서 면적을 사용자 단위로 그리는 작은 클라이언트 리프. exact: 개별 거래의 실제 면적. */
export default function AreaLabel({ m2, exact = false }: { m2: number; exact?: boolean }) {
  const [unit] = useAreaUnit();
  return <>{exact ? formatExactArea(m2, unit) : formatArea(m2, unit)}</>;
}
