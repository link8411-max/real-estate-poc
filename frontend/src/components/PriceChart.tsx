"use client"

import { useState } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface HistoryData {
  month: string;
  avg_amount: number;
  count: number;
  avg_area: number;
}

interface PriceChartProps {
  data: HistoryData[];
  loading?: boolean;
  selectedArea?: number | null;
}

const formatPrice = (value: number) => {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}억`;
  }
  return `${value.toLocaleString()}만`;
};

const formatMonth = (month: string) => {
  // "2024-01" -> "24.01"
  const parts = month.split('-');
  if (parts.length === 2) {
    return `${parts[0].slice(2)}.${parts[1]}`;
  }
  return month;
};

export default function PriceChart({ data, loading, selectedArea }: PriceChartProps) {
  const [period, setPeriod] = useState<12 | 24 | 36 | 0>(36);

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 border border-gray-100">
        <div className="h-6 bg-gray-200 rounded w-1/4 mb-4 animate-pulse"></div>
        <div className="h-64 bg-gray-100 rounded animate-pulse"></div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-4">가격 추이</h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          거래 내역이 부족하여 차트를 표시할 수 없습니다
        </div>
      </div>
    );
  }

  // 기간별 필터링
  const filteredData = period === 0 ? data : data.slice(-period);

  // Y축 범위 계산
  const amounts = filteredData.map(d => d.avg_amount).filter(a => a > 0);
  const minAmount = Math.min(...amounts) * 0.9;
  const maxAmount = Math.max(...amounts) * 1.1;

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">
          가격 추이
          {selectedArea && (
            <span className="ml-2 text-sm font-normal text-blue-600">
              ({selectedArea}㎡)
            </span>
          )}
        </h3>
        <div className="flex gap-1">
          {[
            { value: 12, label: '1년' },
            { value: 24, label: '2년' },
            { value: 36, label: '3년' },
            { value: 0, label: '전체' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value as 12 | 24 | 36 | 0)}
              className={`px-3 py-1 text-xs rounded-full transition ${
                period === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={filteredData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonth}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="price"
              orientation="left"
              domain={[minAmount, maxAmount]}
              tickFormatter={formatPrice}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <YAxis
              yAxisId="count"
              orientation="right"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number, name: string) => {
                if (name === '평균가') return [formatPrice(value), name];
                if (name === '거래량') return [`${value}건`, name];
                return [value, name];
              }}
              labelFormatter={(label) => `${label}`}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
            />
            <Bar
              yAxisId="count"
              dataKey="count"
              name="거래량"
              fill="#e0e7ff"
              radius={[2, 2, 0, 0]}
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="avg_amount"
              name="평균가"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#2563eb' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 요약 정보 */}
      <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
        <div className="text-center">
          <p className="text-xs text-gray-500">최고가</p>
          <p className="font-semibold text-gray-900">
            {formatPrice(Math.max(...amounts))}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">최저가</p>
          <p className="font-semibold text-gray-900">
            {formatPrice(Math.min(...amounts))}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">총 거래</p>
          <p className="font-semibold text-gray-900">
            {filteredData.reduce((sum, d) => sum + d.count, 0)}건
          </p>
        </div>
      </div>
    </div>
  );
}
