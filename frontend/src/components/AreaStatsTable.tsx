"use client";

import { formatArea, formatDeal, formatManwon } from "@/lib/format";
import type { AreaStat } from "@/lib/types";

interface Props {
  stats: AreaStat[];
  selected: number | null;
  onSelect: (area: number | null) => void;
}

export default function AreaStatsTable({ stats, selected, onSelect }: Props) {
  const toggle = (area: number) => onSelect(selected === area ? null : area);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            <th className="py-2 pr-3 font-medium">평형</th>
            <th className="py-2 pr-3 text-right font-medium">최근 실거래</th>
            <th className="py-2 pr-3 text-right font-medium">최고가</th>
            <th className="py-2 text-right font-medium">거래</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => {
            const isSelected = selected === s.area;
            return (
              <tr
                key={s.area}
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => toggle(s.area)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(s.area);
                  }
                }}
                className={`cursor-pointer border-b border-gray-50 transition last:border-b-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  isSelected ? "bg-blue-50" : "hover:bg-gray-50"
                }`}
              >
                <td className={`py-3 pr-3 font-semibold ${isSelected ? "text-blue-700" : "text-gray-900"}`}>
                  {formatArea(s.area)}
                </td>
                <td className="py-3 pr-3 text-right">
                  <span className="font-semibold text-gray-900">{formatManwon(s.latest_amount)}</span>
                  <span className="ml-1 text-xs text-gray-400">{formatDeal(s.latest_date)}</span>
                </td>
                <td className="py-3 pr-3 text-right text-gray-700">{formatManwon(s.max_amount)}</td>
                <td className="py-3 text-right text-gray-500">{s.count.toLocaleString("en-US")}건</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
