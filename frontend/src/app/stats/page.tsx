"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, TrendingDown, ArrowUpDown, MapPin } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface RegionStat {
  code: string;
  name: string;
  city: string;
  avg_price: number;
  tx_count: number;
  apt_count: number;
  yoy_change: number | null;
}

interface Summary {
  seoul_avg: number;
  gyeonggi_avg: number;
  incheon_avg: number;
}

interface StatsData {
  regions: RegionStat[];
  summary: Summary;
}

type SortKey = 'tx_count' | 'avg_price' | 'yoy_change' | 'name';
type SortOrder = 'asc' | 'desc';

export default function StatsPage() {
  const router = useRouter();
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('tx_count');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [cityFilter, setCityFilter] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stats/regions`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (error) {
      console.error('통계 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (amount: number) => {
    if (amount >= 10000) {
      const uk = Math.floor(amount / 10000);
      const man = amount % 10000;
      return man > 0 ? `${uk}억 ${man.toLocaleString()}만` : `${uk}억`;
    }
    return `${amount.toLocaleString()}만`;
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder(key === 'name' ? 'asc' : 'desc');
    }
  };

  const getSortedRegions = () => {
    if (!data) return [];
    let regions = [...data.regions];

    // 시/도 필터
    if (cityFilter) {
      regions = regions.filter(r => r.city === cityFilter);
    }

    // 정렬
    regions.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortKey) {
        case 'tx_count':
          aVal = a.tx_count;
          bVal = b.tx_count;
          break;
        case 'avg_price':
          aVal = a.avg_price;
          bVal = b.avg_price;
          break;
        case 'yoy_change':
          aVal = a.yoy_change ?? -999;
          bVal = b.yoy_change ?? -999;
          break;
        case 'name':
          aVal = a.name;
          bVal = b.name;
          break;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return regions;
  };

  // 상승률 Top 3, 하락률 Top 3
  const getTopChanges = () => {
    if (!data) return { top: [], bottom: [] };
    const withChange = data.regions.filter(r => r.yoy_change !== null);
    const sorted = [...withChange].sort((a, b) => (b.yoy_change ?? 0) - (a.yoy_change ?? 0));
    return {
      top: sorted.slice(0, 3),
      bottom: sorted.slice(-3).reverse()
    };
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse"></div>
          </div>
        </header>
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl p-6 border border-gray-100 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">데이터를 불러올 수 없습니다</p>
      </main>
    );
  }

  const { top, bottom } = getTopChanges();
  const sortedRegions = getSortedRegions();

  return (
    <main className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="font-semibold text-gray-900">지역별 시세 통계</h1>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* 시도별 평균가 */}
        <section className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-5 border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <MapPin className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-sm text-gray-500">서울 평균</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatPrice(data.summary.seoul_avg)}</p>
            <p className="text-xs text-gray-400 mt-1">최근 1년 거래 기준</p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <MapPin className="w-4 h-4 text-green-600" />
              </div>
              <span className="text-sm text-gray-500">경기 평균</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatPrice(data.summary.gyeonggi_avg)}</p>
            <p className="text-xs text-gray-400 mt-1">최근 1년 거래 기준</p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <MapPin className="w-4 h-4 text-purple-600" />
              </div>
              <span className="text-sm text-gray-500">인천 평균</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatPrice(data.summary.incheon_avg)}</p>
            <p className="text-xs text-gray-400 mt-1">최근 1년 거래 기준</p>
          </div>
        </section>

        {/* 상승/하락 Top 3 */}
        <section className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-5 border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-red-500" />
              상승률 Top 3
            </h3>
            <div className="space-y-2">
              {top.map((r, i) => (
                <div key={r.code} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-red-100 text-red-600 rounded text-xs flex items-center justify-center font-semibold">
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-700">{r.city} {r.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-red-600">+{r.yoy_change}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-blue-500" />
              하락률 Top 3
            </h3>
            <div className="space-y-2">
              {bottom.map((r, i) => (
                <div key={r.code} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-blue-100 text-blue-600 rounded text-xs flex items-center justify-center font-semibold">
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-700">{r.city} {r.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-blue-600">{r.yoy_change}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 필터 및 테이블 */}
        <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">전체 지역 목록</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setCityFilter(null)}
                className={`px-3 py-1.5 text-sm rounded-lg transition ${
                  !cityFilter ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                전체
              </button>
              {['서울', '경기', '인천'].map(city => (
                <button
                  key={city}
                  onClick={() => setCityFilter(city)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition ${
                    cityFilter === city ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-gray-700">
                      지역
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    <button onClick={() => handleSort('avg_price')} className="flex items-center gap-1 ml-auto hover:text-gray-700">
                      평균가
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    <button onClick={() => handleSort('tx_count')} className="flex items-center gap-1 ml-auto hover:text-gray-700">
                      거래량
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    <button onClick={() => handleSort('yoy_change')} className="flex items-center gap-1 ml-auto hover:text-gray-700">
                      전년비
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    상세
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedRegions.map(region => (
                  <tr key={region.code} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-400 mr-2">{region.city}</span>
                      <span className="font-medium text-gray-900">{region.name}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatPrice(region.avg_price)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {region.tx_count.toLocaleString()}건
                    </td>
                    <td className="px-4 py-3 text-right">
                      {region.yoy_change !== null ? (
                        <span className={`font-semibold ${
                          region.yoy_change > 0 ? 'text-red-600' : region.yoy_change < 0 ? 'text-blue-600' : 'text-gray-500'
                        }`}>
                          {region.yoy_change > 0 ? '+' : ''}{region.yoy_change}%
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => router.push(`/browse?code=${region.code}`)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        보기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-gray-100 text-sm text-gray-500 text-center">
            총 {sortedRegions.length}개 지역
          </div>
        </section>
      </div>
    </main>
  );
}
