"use client";

import type { ReactNode } from "react";

interface Props {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}

/** 클릭·Enter·Space로 선택을 토글하는 표 행(평형표 공용). */
export default function SelectableRow({ selected, onSelect, children }: Props) {
  return (
    <tr
      aria-selected={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`cursor-pointer border-b border-gray-50 transition last:border-b-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
        selected ? "bg-blue-50" : "hover:bg-gray-50"
      }`}
    >
      {children}
    </tr>
  );
}
