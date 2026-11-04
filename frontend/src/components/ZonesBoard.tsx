"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TypeDot, ZoneChip } from "@/components/ZoneChips";
import { formatHouseholds, SIDO_FILTERS, STAGES, summarize, TYPE_GROUPS, ZONE_DISCLAIMER } from "@/lib/redevelopment";
import type { Zone } from "@/lib/types";

const PAGE_SIZE = 100;

const chip = (on: boolean) =>
  `rounded-lg border px-3 py-1.5 text-sm transition ${
    on ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
  }`;

function Filter({ label, options, value, onChange, allLabel }: { label: string; options: readonly string[]; value: string | null; onChange: (v: string | null) => void; allLabel: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} className={chip(value === null)}>
        {allLabel}
      </button>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(value === o ? null : o)} className={chip(value === o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** 재건축·재개발 현황 목록: 요약 숫자, 단계별 막대, 지역·유형·단계 필터, 구역 목록. zones 가 비어도(파일 없음) 빈 상태로 그린다. */
export default function ZonesBoard({ zones }: { zones: Zone[] }) {
  const [sido, setSido] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const summary = useMemo(() => summarize(zones), [zones]);
  const sidoFull = SIDO_FILTERS.find((s) => s.label === sido)?.sido;
  const filtered = useMemo(
    () =>
      zones
        .filter((z) => (!sidoFull || z.sido === sidoFull) && (!group || z.type_group === group) && (!stage || z.stage === stage))
        .sort((a, b) => (b.stage_order ?? 0) - (a.stage_order ?? 0) || a.name.localeCompare(b.name, "ko")),
    [zones, sidoFull, group, stage],
  );

  // /redevelopment#zone-xxx 로 들어왔을 때 그 구역까지 목록을 펼치고 스크롤한다
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id.startsWith("zone-")) return;
    const idx = filtered.findIndex((z) => `zone-${z.zone_id}` === id);
    if (idx < 0) return;
    setLimit((l) => Math.max(l, idx + 1));
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView?.({ block: "center" }));
    // 처음 열릴 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetLimit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setLimit(PAGE_SIZE);
  };
  const maxStage = Math.max(1, ...STAGES.map((s) => summary.byStage[s.name] ?? 0));

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">재건축·재개발 현황</h1>
        <p className="text-sm text-gray-600">서울·경기·인천 정비구역의 사업 추진 단계를 모아 봅니다.</p>
        <p className="text-xs text-gray-500">{ZONE_DISCLAIMER}</p>
      </header>

      {zones.length === 0 ? (
        <p className="rounded-2xl border border-gray-100 bg-white py-12 text-center text-sm text-gray-500">정비사업 데이터가 아직 없습니다</p>
      ) : (
        <>
          <section aria-label="요약" className="grid grid-cols-3 gap-3">
            {[
              { n: summary.total, label: "전체" },
              { n: summary.byGroup["재건축"] ?? 0, label: "재건축" },
              { n: summary.byGroup["재개발"] ?? 0, label: "재개발" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-gray-100 bg-white p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{s.n.toLocaleString("en-US")}</p>
                <p className="text-sm text-gray-500">{s.label}</p>
              </div>
            ))}
          </section>

          <section aria-label="단계별 구역 수" className="rounded-2xl border border-gray-100 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">단계별 구역 수</h2>
            <ul className="space-y-1.5">
              {STAGES.map((s) => {
                const n = summary.byStage[s.name] ?? 0;
                return (
                  <li key={s.name} className="flex items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 text-gray-700">{s.name}</span>
                    <span className="h-3 flex-1 overflow-hidden rounded bg-gray-100">
                      <span className="block h-full rounded bg-blue-500" style={{ width: `${(n / maxStage) * 100}%` }} />
                    </span>
                    <span className="w-10 shrink-0 text-right tabular-nums text-gray-900">{n.toLocaleString("en-US")}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-label="필터" className="space-y-2">
            <Filter label="지역" allLabel="전체 지역" options={SIDO_FILTERS.map((s) => s.label)} value={sido} onChange={resetLimit(setSido)} />
            <Filter label="유형" allLabel="전체 유형" options={TYPE_GROUPS} value={group} onChange={resetLimit(setGroup)} />
            <Filter label="단계" allLabel="전체 단계" options={STAGES.map((s) => s.name)} value={stage} onChange={resetLimit(setStage)} />
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">
              구역 목록 <span className="text-sm font-normal text-gray-500">{filtered.length.toLocaleString("en-US")}곳 · 진행 단계 높은 순</span>
            </h2>
            {filtered.length === 0 ? (
              <p className="rounded-2xl border border-gray-100 bg-white py-10 text-center text-sm text-gray-500">조건에 맞는 구역이 없습니다</p>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white">
                {filtered.slice(0, limit).map((z) => (
                  <li key={z.zone_id} id={`zone-${z.zone_id}`} className="scroll-mt-24 space-y-1 px-4 py-3 target:bg-blue-50">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <TypeDot group={z.type_group} order={z.stage_order} />
                      <h3 className="min-w-0 text-sm font-semibold text-gray-900">{z.name}</h3>
                      <span className="text-xs text-gray-500">{z.sido.replace(/특별시|광역시|도$/, "")} {z.sigungu}</span>
                      <ZoneChip zone={z} />
                    </div>
                    <p className="text-xs text-gray-600">
                      {z.type} · 세대수 {formatHouseholds(z.households)}
                      {z.operator && <> · 사업시행자 {z.operator}</>}
                    </p>
                    {z.apt_ids.length > 0 && (
                      <p className="text-xs">
                        {z.apt_ids.map((id, i) => (
                          <Link key={id} href={`/apartment/${id}`} className="mr-2 text-blue-600 hover:underline">
                            {z.apt_ids.length > 1 ? `단지 ${i + 1} ›` : "매칭 단지 ›"}
                          </Link>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {filtered.length > limit && (
              <button type="button" onClick={() => setLimit((l) => l + PAGE_SIZE)} className="mt-3 w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm text-gray-700 hover:border-blue-300">
                더 보기 ({(filtered.length - limit).toLocaleString("en-US")}곳 남음)
              </button>
            )}
          </section>
        </>
      )}
    </main>
  );
}
