"use client";

import { type AreaUnit, useAreaUnit } from "@/lib/areaUnit";

const OPTIONS: { unit: AreaUnit; label: string }[] = [
  { unit: "pyeong", label: "평" },
  { unit: "m2", label: "㎡" },
];

/** 헤더의 면적 단위 전환: 평 | ㎡ */
export default function AreaUnitToggle() {
  const [unit, setUnit] = useAreaUnit();
  return (
    <div role="radiogroup" aria-label="면적 단위" className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs">
      {OPTIONS.map((o) => {
        const checked = unit === o.unit;
        return (
          <button
            key={o.unit}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => setUnit(o.unit)}
            className={`rounded-md px-2.5 py-1 font-medium transition ${
              checked ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
