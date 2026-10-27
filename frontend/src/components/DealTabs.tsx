"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useSyncExternalStore } from "react";

export type TabKey = "trade" | "jeonse" | "wolse";

const TABS: { key: TabKey; label: string }[] = [
  { key: "trade", label: "매매" },
  { key: "jeonse", label: "전세" },
  { key: "wolse", label: "월세" },
];

interface Props {
  panels: Record<TabKey, ReactNode>;
  /** 거래가 없는 전월세 탭. 매매는 항상 열 수 있다(빈 안내를 그 안에서 보여준다). */
  empty: { jeonse: boolean; wolse: boolean };
}

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
const readTab = () => new URLSearchParams(window.location.search).get("tab");
/** 서버 HTML(ISR)은 항상 매매 탭. useSearchParams를 쓰면 정적 렌더가 Suspense 경계까지 클라이언트로 미뤄져
 * 최근가·평형별 시세가 HTML에서 빠지므로, URL은 하이드레이션 뒤에 읽는다. */
const readTabServer = () => null;

/** 매매 | 전세 | 월세 세그먼트. 선택은 URL ?tab= 에 담는다. */
export default function DealTabs({ panels, empty }: Props) {
  const router = useRouter();
  const urlTab = useSyncExternalStore(subscribe, readTab, readTabServer);
  const [clicked, setClicked] = useState<TabKey | null>(null);
  const param = clicked ?? urlTab;
  const isEmpty = (k: TabKey) => k !== "trade" && empty[k];
  const active: TabKey = TABS.some((t) => t.key === param && !isEmpty(t.key)) ? (param as TabKey) : "trade";

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="거래 유형" className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {TABS.map(({ key, label }) => {
          const disabled = isEmpty(key);
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={key === active}
              disabled={disabled}
              title={disabled ? "거래 없음" : undefined}
              onClick={() => {
                setClicked(key);
                router.replace(`?tab=${key}`, { scroll: false });
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                key === active ? "bg-white text-blue-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
              } disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:text-gray-300`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{panels[active]}</div>
    </div>
  );
}
