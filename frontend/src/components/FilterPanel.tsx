"use client";

import { ChevronUp, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAreaUnit } from "@/lib/areaUnit";
import {
  AREA_PRESETS,
  areaPresetLabel,
  BUILT_PRESETS,
  builtFromYears,
  countActiveFilters,
  FILTER_KEYS,
  type MapMode,
  PRICE_STEPS_EOK,
  readMapFilters,
} from "@/lib/mapFilters";

type Patch = Record<string, string | number | undefined>;

const chip = (on: boolean) =>
  `rounded-lg border px-3 py-1.5 text-sm transition ${
    on ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
  }`;

const MODES: { mode: MapMode; label: string }[] = [
  { mode: "trade", label: "매매" },
  { mode: "rent", label: "전세" },
];

interface PriceSelectProps {
  label: string;
  value?: number;
  /** 이 값보다 낮은 선택지는 비활성화(최대 가격 쪽) */
  floor?: number;
  onChange: (v?: number) => void;
}

function PriceSelect({ label, value, floor, onChange }: PriceSelectProps) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
    >
      <option value="">{label.startsWith("최소") ? "최소" : "최대"}</option>
      {PRICE_STEPS_EOK.map((e) => (
        <option key={e} value={e * 10000} disabled={floor !== undefined && e * 10000 < floor}>
          {e}억
        </option>
      ))}
    </select>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-gray-500">{title}</p>
      {children}
    </div>
  );
}

/** 지도 필터. 상태는 URL 쿼리에 있다. 데스크톱(md+) 좌측 패널, 모바일은 하단 시트. */
export default function FilterPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [unit] = useAreaUnit();
  const [open, setOpen] = useState(false);
  const f = readMapFilters(new URLSearchParams(search.toString()));
  const active = countActiveFilters(f);

  const update = (patch: Patch) => {
    const next = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) next.delete(k);
      else next.set(k, String(v));
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  /** 최소가 현재 최대보다 크면 두 값을 바꿔 범위가 뒤집히지 않게 한다. */
  const setMinPrice = (v?: number) =>
    v !== undefined && f.maxPrice !== undefined && v > f.maxPrice
      ? update({ minPrice: f.maxPrice, maxPrice: v })
      : update({ minPrice: v });

  const reset = () => update(Object.fromEntries(["mode", ...FILTER_KEYS].map((k) => [k, undefined])));

  return (
    <aside className="absolute inset-x-0 bottom-0 z-10 rounded-t-2xl bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.08)] md:inset-x-auto md:bottom-auto md:left-3 md:top-3 md:w-64 md:rounded-2xl md:shadow-lg">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-900 md:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        필터 {active}
        <span className="ml-1 font-normal text-gray-500">· {f.mode === "rent" ? "전세" : "매매"}</span>
        <ChevronUp className={`ml-auto h-4 w-4 transition ${open ? "" : "rotate-180"}`} aria-hidden />
      </button>

      <div className={`${open ? "block" : "hidden"} max-h-[60dvh] space-y-4 overflow-y-auto px-4 pb-4 md:block md:max-h-none md:pt-4`}>
        <Section title="거래종류">
          <div role="radiogroup" aria-label="거래종류" className="flex gap-2">
            {MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                role="radio"
                aria-checked={f.mode === m.mode}
                onClick={() => update({ mode: m.mode === "rent" ? "rent" : undefined })}
                className={chip(f.mode === m.mode)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title={f.mode === "rent" ? "보증금 (전세)" : "가격대 (매매가)"}>
          <div className="flex items-center gap-2">
            <PriceSelect label="최소 가격" value={f.minPrice} onChange={setMinPrice} />
            <span className="text-gray-400">~</span>
            <PriceSelect label="최대 가격" value={f.maxPrice} floor={f.minPrice} onChange={(v) => update({ maxPrice: v })} />
          </div>
        </Section>

        <Section title="평형">
          <div className="flex flex-wrap gap-2">
            {AREA_PRESETS.map((p) => {
              const on = f.minArea === p.minArea && f.maxArea === p.maxArea;
              return (
                <button
                  key={p.pyeong}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update(on ? { minArea: undefined, maxArea: undefined } : { minArea: p.minArea, maxArea: p.maxArea })}
                  className={chip(on)}
                >
                  {areaPresetLabel(p, unit)}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="준공">
          <div className="flex flex-wrap gap-2">
            {BUILT_PRESETS.map((n) => {
              const year = builtFromYears(n);
              const on = f.builtFrom === year;
              return (
                <button key={n} type="button" aria-pressed={on} onClick={() => update({ builtFrom: on ? undefined : year })} className={chip(on)}>
                  {n}년 이내
                </button>
              );
            })}
          </div>
        </Section>

        <button type="button" onClick={reset} className="text-sm text-gray-500 underline-offset-2 hover:underline">
          초기화
        </button>
      </div>
    </aside>
  );
}
