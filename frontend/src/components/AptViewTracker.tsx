"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

/** 단지 페이지 조회를 apt_view 로 남긴다(지역별·단지별 관심도). 화면에는 아무것도 그리지 않는다. */
export default function AptViewTracker({ aptId, lawdCd }: { aptId: number; lawdCd: string }) {
  useEffect(() => {
    track("apt_view", { apt_id: String(aptId), region: lawdCd });
  }, [aptId, lawdCd]);
  return null;
}
