"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const PAGE_SIZE = 50;

/**
 * 목록을 PAGE_SIZE씩 늘려 보여주는 상태. resetKey가 바뀌면(평형·탭 변경) 렌더 중에 처음으로 되돌린다(이펙트 없이).
 * buttonRef가 화면에 들어오면 자동으로 눌러 무한 스크롤처럼 동작한다.
 */
export function useLoadMore<K>(total: number, resetKey: K) {
  const [shown, setShown] = useState({ key: resetKey, count: PAGE_SIZE });
  const count = shown.key === resetKey ? shown.count : PAGE_SIZE;
  const hasMore = count < total;
  const showMore = () =>
    setShown((s) => ({ key: resetKey, count: (s.key === resetKey ? s.count : PAGE_SIZE) + PAGE_SIZE }));

  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = buttonRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) el.click();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, count]);

  return { count, hasMore, showMore, buttonRef };
}

interface ButtonProps {
  remaining: number;
  onClick: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}

export function LoadMoreButton({ remaining, onClick, buttonRef }: ButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
    >
      더 보기 ({remaining.toLocaleString("en-US")}건 남음)
      <ChevronDown className="h-4 w-4" aria-hidden />
    </button>
  );
}
