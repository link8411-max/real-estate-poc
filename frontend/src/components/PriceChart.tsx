"use client";

import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatManwon } from "@/lib/format";
import { type MonthPoint, slicePeriod } from "@/lib/history";

const PERIODS = [
  { label: "1년", years: 1 },
  { label: "3년", years: 3 },
  { label: "5년", years: 5 },
  { label: "전체", years: null },
] as const;

type Years = (typeof PERIODS)[number]["years"];

const eok = (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(1)}억` : `${Math.round(v / 1000) / 10}억`);

export default function PriceChart({ data, valueLabel = "평균가" }: { data: MonthPoint[]; valueLabel?: string }) {
  const [years, setYears] = useState<Years>(null);
  const shown = useMemo(() => slicePeriod(data, years), [data, years]);

  return (
    <div>
      <div className="mb-3 flex gap-1" role="group" aria-label="기간">
        {PERIODS.map((p) => (
          <button
            key={p.label}
            type="button"
            aria-pressed={p.years === years}
            onClick={() => setYears(p.years)}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
              p.years === years ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-500">표시할 거래가 없습니다</p>
      ) : (
        <div className="h-64 w-full min-w-0">
          <ResponsiveContainer width="100%" height={256} minWidth={0}>
            <ComposedChart data={shown} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} tickLine={false} minTickGap={24} />
              <YAxis
                yAxisId="avg"
                tickFormatter={eok}
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                tickLine={false}
                axisLine={false}
                width={48}
                domain={["auto", "auto"]}
              />
              <YAxis yAxisId="count" orientation="right" hide allowDecimals={false} />
              <Tooltip
                formatter={(value, name) =>
                  name === "avg" ? [formatManwon(Number(value)), valueLabel] : [`${value}건`, "거래"]
                }
                labelStyle={{ color: "#1E293B" }}
              />
              <Bar yAxisId="count" dataKey="count" fill="#BFDBFE" barSize={6} />
              <Line yAxisId="avg" type="monotone" dataKey="avg" stroke="#2563EB" strokeWidth={2} dot={shown.length < 3} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
