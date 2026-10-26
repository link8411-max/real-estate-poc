"use client";

import { Calendar, Check, MapPin, Plus } from "lucide-react";
import { useSyncExternalStore } from "react";
import { getCompareIds, toggleCompare } from "@/lib/compare";
import type { Apartment } from "@/lib/types";

const EVENT = "compare-change";
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

export default function ApartmentHeader({ apartment }: { apartment: Apartment }) {
  const inCompare = useSyncExternalStore(
    subscribe,
    () => getCompareIds().includes(apartment.id),
    () => false,
  );

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-gray-900">{apartment.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-4 w-4" aria-hidden />
            {apartment.region_name} {apartment.dong}
            {apartment.jibun ? ` ${apartment.jibun}` : ""}
          </span>
          {apartment.build_year && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-4 w-4" aria-hidden />
              {apartment.build_year}년 준공
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        aria-pressed={inCompare}
        onClick={() => {
          toggleCompare(apartment.id);
          window.dispatchEvent(new Event(EVENT));
        }}
        className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
          inCompare ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        {inCompare ? <Check className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
        {inCompare ? "비교 담김" : "비교 담기"}
      </button>
    </div>
  );
}
