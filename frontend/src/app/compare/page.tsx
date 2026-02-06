"use client"

import { ArrowLeft, MapPin, Building2, TrendingUp, TrendingDown, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface CompareData {
  apartment: {
    id: number;
    name: string;
    dong: string;
    lawd_cd: string;
    jibun: string;
    build_year: number;
  };
  latest_transaction: {
    amount: number;
    area: number;
    deal_date: string;
    floor: number;
  } | null;
  peak_amount: number;
  transaction_count: number;
}

function CompareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idsParam = searchParams.get('ids');

  const [compareData, setCompareData] = useState<CompareData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (idsParam) {
      fetchCompareData(idsParam);
    } else {
      // localStorage에서 비교 목록 로드
      const saved = localStorage.getItem('compareList');
      if (saved) {
        const ids = JSON.parse(saved);
        if (ids.length >= 2) {
          router.replace(`/compare?ids=${ids.join(',')}`);
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    }
  }, [idsParam]);

  const fetchCompareData = async (ids: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/compare?apt_ids=${ids}`);
      if (res.ok) {
        setCompareData(await res.json());
      }
    } catch (error) {
      console.error('비교 데이터 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeFromCompare = (id: number) => {
    const saved = localStorage.getItem('compareList');
    if (saved) {
      const ids = JSON.parse(saved).filter((x: number) => x !== id);
      localStorage.setItem('compareList', JSON.stringify(ids));

      if (ids.length >= 2) {
        router.replace(`/compare?ids=${ids.join(',')}`);
      } else {
        setCompareData([]);
        router.replace('/compare');
      }
    }
  };

  const formatPrice = (amount: number | null | undefined) => {
    if (!amount) return '-';
    if (amount >= 10000) {
      const uk = Math.floor(amount / 10000);
      const man = amount % 10000;
      return man > 0 ? `${uk}억 ${man.toLocaleString()}만` : `${uk}억`;
    }
    return `${amount.toLocaleString()}만`;
  };

  // 평당가 계산 (3.3058㎡ = 1평)
  const calcPricePerPyeong = (amount: number | null | undefined, area: number | null | undefined) => {
    if (!amount || !area || area === 0) return null;
    const pyeong = area / 3.3058;
    return Math.round(amount / pyeong);
  };

  const formatPricePerPyeong = (pricePerPyeong: number | null) => {
    if (!pricePerPyeong) return '-';
    if (pricePerPyeong >= 10000) {
      const uk = Math.floor(pricePerPyeong / 10000);
      const man = pricePerPyeong % 10000;
      return man > 0 ? `${uk}억 ${man.toLocaleString()}만/평` : `${uk}억/평`;
    }
    return `${pricePerPyeong.toLocaleString()}만/평`;
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse"></div>
          </div>
        </header>
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-6 border border-gray-100 animate-pulse h-64"></div>
            <div className="bg-white rounded-xl p-6 border border-gray-100 animate-pulse h-64"></div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="font-semibold text-gray-900">단지 비교</h1>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {compareData.length >= 2 ? (
          <div className="space-y-6">
            {/* 비교 카드 */}
            <div className="grid grid-cols-2 gap-4">
              {compareData.map((data) => (
                <div
                  key={data.apartment.id}
                  className="bg-white rounded-xl p-5 border border-gray-100 relative"
                >
                  <button
                    onClick={() => removeFromCompare(data.apartment.id)}
                    className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 rounded-lg transition"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>

                  <h3 className="font-bold text-lg text-gray-900 pr-8 truncate">
                    {data.apartment.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{data.apartment.dong}</span>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div>
                      <p className="text-xs text-gray-500">최근 거래가</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatPrice(data.latest_transaction?.amount)}
                      </p>
                      {data.latest_transaction && (
                        <p className="text-xs text-gray-500">
                          {data.latest_transaction.area}㎡ · {data.latest_transaction.floor}층
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">전고점</p>
                      <p className="text-lg font-semibold text-gray-700">
                        {formatPrice(data.peak_amount)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 비교표 */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="p-4 text-left text-sm font-medium text-gray-500 w-1/4">항목</th>
                    {compareData.map((data) => (
                      <th key={data.apartment.id} className="p-4 text-center text-sm font-semibold text-gray-900">
                        {data.apartment.name.length > 10
                          ? data.apartment.name.substring(0, 10) + '...'
                          : data.apartment.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-50">
                    <td className="p-4 text-sm text-gray-500">위치</td>
                    {compareData.map((data) => (
                      <td key={data.apartment.id} className="p-4 text-center text-sm text-gray-900">
                        {data.apartment.dong}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="p-4 text-sm text-gray-500">준공년도</td>
                    {compareData.map((data) => (
                      <td key={data.apartment.id} className="p-4 text-center text-sm text-gray-900">
                        {data.apartment.build_year}년
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="p-4 text-sm text-gray-500">최근 거래가</td>
                    {compareData.map((data) => (
                      <td key={data.apartment.id} className="p-4 text-center font-semibold text-gray-900">
                        {formatPrice(data.latest_transaction?.amount)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="p-4 text-sm text-gray-500">면적</td>
                    {compareData.map((data) => (
                      <td key={data.apartment.id} className="p-4 text-center text-sm text-gray-900">
                        {data.latest_transaction?.area ? `${data.latest_transaction.area}㎡ (${(data.latest_transaction.area / 3.3058).toFixed(1)}평)` : '-'}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-50 bg-blue-50">
                    <td className="p-4 text-sm text-blue-700 font-medium">평당가</td>
                    {compareData.map((data) => {
                      const pricePerPyeong = calcPricePerPyeong(
                        data.latest_transaction?.amount,
                        data.latest_transaction?.area
                      );
                      return (
                        <td key={data.apartment.id} className="p-4 text-center font-semibold text-blue-700">
                          {formatPricePerPyeong(pricePerPyeong)}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="p-4 text-sm text-gray-500">전고점</td>
                    {compareData.map((data) => (
                      <td key={data.apartment.id} className="p-4 text-center text-sm text-gray-900">
                        {formatPrice(data.peak_amount)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="p-4 text-sm text-gray-500">전고점 대비</td>
                    {compareData.map((data) => {
                      const drop = data.peak_amount && data.latest_transaction?.amount
                        ? Math.round((1 - data.latest_transaction.amount / data.peak_amount) * 100)
                        : null;
                      return (
                        <td key={data.apartment.id} className="p-4 text-center">
                          {drop !== null ? (
                            <span className={`inline-flex items-center gap-1 font-semibold ${
                              drop > 0 ? 'text-blue-600' : 'text-red-600'
                            }`}>
                              {drop > 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                              {drop > 0 ? `-${drop}%` : `+${Math.abs(drop)}%`}
                            </span>
                          ) : '-'}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="p-4 text-sm text-gray-500">거래 건수</td>
                    {compareData.map((data) => (
                      <td key={data.apartment.id} className="p-4 text-center text-sm text-gray-900">
                        {data.transaction_count}건
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-2">
              비교할 단지가 없습니다
            </p>
            <p className="text-sm text-gray-400 mb-6">
              검색 후 단지 상세 페이지에서 &quot;비교 담기&quot;를 눌러주세요
            </p>
            <button
              onClick={() => router.push('/')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              단지 검색하기
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    }>
      <CompareContent />
    </Suspense>
  );
}
