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
import { readZoneFilters, STAGE_NAMES, toggleIn, TYPE_GROUPS, zoneColor, ZONE_KEYS } from "@/lib/redevelopment";

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

/** 범례 견본: 유형 색상 + 단계가 진행될수록 진해지는 3칸(정비구역지정 → 관리처분인가 → 착공) */
function LegendRow({ group }: { group: string }) {
  return (
    <li className="flex items-center gap-2 text-sm text-gray-700">
      <span aria-hidden className="flex gap-1">
        {[2, 4.5, 7].map((o) => {
          const c = zoneColor(group, o);
          return <span key={o} className="block h-3 w-3 rotate-45 border-2" style={{ background: c.fill, borderColor: c.border }} />;
        })}
      </span>
      {group}
    </li>
  );
}

/** 지도 필터. 상태는 URL 쿼리에 있다. 데스크톱(md+) 좌측 패널, 모바일은 하단 시트. */
export default function FilterPanel({ onOpen }: { onOpen?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [unit] = useAreaUnit();
  const [open, setOpen] = useState(false);
  const f = readMapFilters(new URLSearchParams(search.toString()));
  const zf = readZoneFilters(new URLSearchParams(search.toString()));
  const active = countActiveFilters(f) + (zf.on ? 1 : 0);

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

  const reset = () => update(Object.fromEntries(["mode", ...FILTER_KEYS, ...ZONE_KEYS].map((k) => [k, undefined])));

  return (
    <aside className="absolute inset-x-0 bottom-0 z-10 rounded-t-2xl bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.08)] md:inset-x-auto md:bottom-auto md:left-3 md:top-3 md:w-64 md:rounded-2xl md:shadow-lg">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          // 시트를 여는 순간 지도 위에 떠 있던 미리보기 카드를 닫는다(겹쳐 쌓이지 않게)
          if (!open) onOpen?.();
          setOpen((o) => !o);
        }}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-900 md:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        필터 {active}
        <span className="ml-1 font-normal text-gray-500">· {f.mode === "rent" ? "전세" : "매매"}</span>
        <ChevronUp className={`ml-auto h-4 w-4 transition ${open ? "" : "rotate-180"}`} aria-hidden />
      </button>

      <div className={`${open ? "block" : "hidden"} max-h-[60dvh] space-y-4 overflow-y-auto px-4 pb-4 md:block md:max-h-[calc(100dvh-53px-5rem)] md:pt-4`}>
        <Section title="정비사업 (재건축·재개발)">
          <button type="button" aria-pressed={zf.on} onClick={() => update({ zones: zf.on ? undefined : 1 })} className={chip(zf.on)}>
            정비사업
          </button>
          {zf.on && (
            <div className="mt-3 space-y-3">
              <div role="group" aria-label="범례" className="rounded-lg bg-gray-50 p-2.5">
                <ul className="space-y-1">
                  {TYPE_GROUPS.map((t) => (
                    <LegendRow key={t} group={t} />
                  ))}
                </ul>
                <p className="mt-2 text-[11px] leading-snug text-gray-500">색이 진할수록 사업 단계가 진행된 구역입니다. 속이 빈 마름모는 위치가 동 단위 대략입니다.</p>
              </div>
              <button type="button" aria-pressed={zf.hideApts} onClick={() => update({ apts: zf.hideApts ? undefined : 0 })} className={chip(zf.hideApts)}>
                아파트 시세 숨기기
              </button>
              <div>
                <p className="mb-1.5 text-xs text-gray-500">유형 (여러 개 선택, 비우면 전체)</p>
                <div role="group" aria-label="정비사업 유형" className="flex flex-wrap gap-2">
                  {TYPE_GROUPS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={zf.types.includes(t)}
                      onClick={() => {
                        const next = toggleIn(zf.types, t, TYPE_GROUPS);
                        update({ zt: next.length ? next.join(",") : undefined });
                      }}
                      className={chip(zf.types.includes(t))}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs text-gray-500">단계 (여러 개 선택, 비우면 전체)</p>
                <div role="group" aria-label="정비사업 단계" className="flex flex-wrap gap-1.5">
                  {STAGE_NAMES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      aria-pressed={zf.stages.includes(st)}
                      onClick={() => {
                        const next = toggleIn(zf.stages, st, STAGE_NAMES);
                        update({ zs: next.length ? next.join(",") : undefined });
                      }}
                      className={`${chip(zf.stages.includes(st))} !px-2 !py-1 !text-xs`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Section>

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
