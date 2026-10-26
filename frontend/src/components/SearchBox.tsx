"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  defaultValue?: string;
  /** 있으면 입력마다 호출되고 Enter로 이동하지 않는다(검색 페이지). 없으면 Enter로 /search 이동(홈). */
  onChange?: (q: string) => void;
  autoFocus?: boolean;
  className?: string;
}

export default function SearchBox({ defaultValue = "", onChange, autoFocus, className = "" }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (onChange) return;
    const q = value.trim();
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          setValue(e.target.value);
          onChange?.(e.target.value);
        }}
        placeholder="아파트 이름, 동 이름, 초성(ㄹㅁㅇ) 검색"
        aria-label="아파트 검색"
        className="w-full rounded-xl border border-gray-200 bg-white py-4 pl-12 pr-4 text-lg shadow-sm placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </form>
  );
}
