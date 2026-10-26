"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { getCompareIds } from "@/lib/compare";

const noSubscribe = () => () => {};

/** URL에 ids가 없을 때: 저장된 비교 목록이 있으면 ?ids=로 옮기고, 없으면 안내 */
export default function CompareFromStorage() {
  const router = useRouter();
  // 서버 렌더에서는 null(아직 모름), 브라우저에서는 "1,2" 또는 ""
  const saved = useSyncExternalStore(noSubscribe, () => getCompareIds().join(","), () => null);

  useEffect(() => {
    if (saved) router.replace(`/compare?ids=${saved}`);
  }, [saved, router]);

  return (
    <p className="py-16 text-center text-sm text-gray-500">
      {saved === ""
        ? "아파트 상세 페이지에서 “비교 담기”를 눌러 최대 2개 단지를 비교하세요"
        : "비교 목록을 불러오는 중…"}
    </p>
  );
}
