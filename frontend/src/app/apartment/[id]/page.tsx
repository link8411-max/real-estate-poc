"use client"

import { ArrowLeft, MapPin, Building2, TrendingUp, TrendingDown, Plus } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';

// 차트 컴포넌트 동적 로딩 (SSR 비활성화)
const PriceChart = dynamic(() => import('@/components/PriceChart'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-xl p-6 border border-gray-100">
      <div className="h-6 bg-gray-200 rounded w-1/4 mb-4 animate-pulse"></div>
      <div className="h-64 bg-gray-100 rounded animate-pulse"></div>
    </div>
  )
});

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Apartment {
  id: number;
  name: string;
  dong: string;
  lawd_cd: string;
  region_name: string;
  jibun: string;
  build_year: number;
}

interface Transaction {
  id: number;
  amount: number;
  area: number;
  floor: number;
  deal_date: string;
  summary_text?: string;
}

interface AreaStat {
  area: number;
  max_amount: number;
  min_amount: number;
  avg_amount: number;
  count: number;
  latest_amount: number | null;
  latest_date: string | null;
  recent_avg: number | null;
  peak_date: string | null;
}

interface Metrics {
  bargain_amount?: number;
  bargain_percent?: number;
  floor_premium?: number;
  recovery_rate?: number;
  peak_date?: string;
  dong_rank?: number;
  dong_total?: number;
  days_since_last_tx?: number;
}

interface ApartmentDetail {
  apartment: Apartment;
  transactions: Transaction[];
  area_stats: AreaStat[];
  metrics?: Metrics;
}

interface HistoryData {
  month: string;
  avg_amount: number;
  count: number;
  avg_area: number;
}

export default function ApartmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const aptId = params.id as string;

  const [data, setData] = useState<ApartmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [compareList, setCompareList] = useState<number[]>([]);
  const [historyData, setHistoryData] = useState<HistoryData[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedArea, setSelectedArea] = useState<number | null>(null);

  // 거래내역 무한스크롤
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [txOffset, setTxOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const TX_LIMIT = 20;
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (aptId) {
      fetchApartmentDetail();
      fetchHistory();
      fetchTransactions(0, null);
      loadCompareList();
    }
  }, [aptId]);

  // 평수 선택 변경 시 차트 및 거래내역 다시 로드
  useEffect(() => {
    if (aptId) {
      fetchHistory(selectedArea);
      setTxOffset(0);
      setHasMore(true);
      setTransactions([]);
      fetchTransactions(0, selectedArea);
    }
  }, [selectedArea]);

  const fetchApartmentDetail = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/apartments/${aptId}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (error) {
      console.error('단지 정보 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (area?: number | null) => {
    setHistoryLoading(true);
    try {
      const areaParam = area ? `&area=${area}` : '';
      const res = await fetch(`${API_BASE}/api/apartments/${aptId}/history?months=240${areaParam}`);
      if (res.ok) {
        setHistoryData(await res.json());
      }
    } catch (error) {
      console.error('거래 이력 로딩 실패:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchTransactions = async (offset: number, area?: number | null) => {
    if (txLoading) return;
    setTxLoading(true);
    try {
      const areaParam = area ? `&area=${area}` : '';
      const res = await fetch(
        `${API_BASE}/api/apartments/${aptId}/transactions?limit=${TX_LIMIT}&offset=${offset}${areaParam}`
      );
      if (res.ok) {
        const data = await res.json();
        if (offset === 0) {
          setTransactions(data.transactions);
        } else {
          setTransactions(prev => [...prev, ...data.transactions]);
        }
        setTxTotal(data.total);
        setTxOffset(offset);
        setHasMore(offset + data.transactions.length < data.total);
      }
    } catch (error) {
      console.error('거래 내역 로딩 실패:', error);
    } finally {
      setTxLoading(false);
    }
  };

  // 무한스크롤 Intersection Observer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (txLoading) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !txLoading) {
        fetchTransactions(txOffset + TX_LIMIT, selectedArea);
      }
    }, { threshold: 0.1 });

    if (node) observerRef.current.observe(node);
  }, [txLoading, hasMore, txOffset, selectedArea]);

  const handleAreaSelect = (area: number) => {
    if (selectedArea === area) {
      setSelectedArea(null); // 같은 것 클릭하면 해제
    } else {
      setSelectedArea(area);
    }
  };

  const clearAreaFilter = () => {
    setSelectedArea(null);
  };

  // 선택된 평수로 거래 내역 필터링
  const getFilteredTransactions = () => {
    if (!data) return [];
    if (!selectedArea) return data.transactions;
    // ±2㎡ 범위로 필터링 (API와 동일한 로직)
    return data.transactions.filter(
      tx => tx.area >= selectedArea - 2 && tx.area <= selectedArea + 2
    );
  };

  const loadCompareList = () => {
    const saved = localStorage.getItem('compareList');
    if (saved) {
      setCompareList(JSON.parse(saved));
    }
  };

  const toggleCompare = () => {
    const id = parseInt(aptId);
    let newList: number[];

    if (compareList.includes(id)) {
      newList = compareList.filter(x => x !== id);
    } else {
      newList = [...compareList, id].slice(-2); // 최대 2개
    }

    setCompareList(newList);
    localStorage.setItem('compareList', JSON.stringify(newList));
  };

  const formatPrice = (amount: number) => {
    if (amount >= 10000) {
      const uk = Math.floor(amount / 10000);
      const man = amount % 10000;
      return man > 0 ? `${uk}억 ${man.toLocaleString()}만` : `${uk}억`;
    }
    return `${amount.toLocaleString()}만`;
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="h-6 bg-gray-200 rounded w-1/3 animate-pulse"></div>
          </div>
        </header>
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl p-6 border border-gray-100 animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/2 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">단지 정보를 찾을 수 없습니다</p>
          <button onClick={() => router.push('/')} className="text-blue-600 hover:underline">
            홈으로 돌아가기
          </button>
        </div>
      </main>
    );
  }

  const { apartment, transactions: initialTransactions, area_stats, metrics } = data;
  const isInCompare = compareList.includes(parseInt(aptId));

  // 최근 거래 정보 (초기 로드된 데이터 또는 페이징 데이터 사용)
  const latestTx = transactions.length > 0 ? transactions[0] : (initialTransactions.length > 0 ? initialTransactions[0] : null);
  const latestAmount = latestTx?.amount || 0;
  const latestArea = latestTx?.area || 0;

  // 같은 평수의 전고점 찾기 (±2㎡ 범위)
  const sameAreaStat = area_stats.find(
    s => Math.abs(s.area - latestArea) <= 2
  );
  const peakAmount = sameAreaStat?.max_amount || 0;
  const dropPercent = peakAmount > 0 && latestAmount > 0
    ? Math.round((1 - latestAmount / peakAmount) * 100)
    : 0;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="font-semibold text-gray-900 truncate max-w-[200px] sm:max-w-none">
              {apartment.name}
            </h1>
          </div>
          <button
            onClick={toggleCompare}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              isInCompare
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Plus className={`w-4 h-4 ${isInCompare ? 'rotate-45' : ''} transition-transform`} />
            {isInCompare ? '비교 취소' : '비교 담기'}
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* 기본 정보 */}
        <section className="bg-white rounded-xl p-6 border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{apartment.name}</h2>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              {apartment.region_name ? `${apartment.region_name} ${apartment.dong}` : apartment.dong} {apartment.jibun}
            </span>
            <span className="flex items-center gap-1">
              <Building2 className="w-4 h-4" />
              {apartment.build_year}년 준공
            </span>
          </div>
        </section>

        {/* 시세 요약 */}
        <section className="bg-white rounded-xl p-6 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-4">시세 요약</h3>

          {latestTx ? (
            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">최근 거래가</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {formatPrice(latestAmount)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {latestTx.area}㎡ · {latestTx.floor}층 · {latestTx.deal_date}
                  </p>
                </div>
                {dropPercent !== 0 && peakAmount > 0 && (
                  <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold ${
                    dropPercent > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {dropPercent > 0 ? (
                      <TrendingDown className="w-4 h-4" />
                    ) : (
                      <TrendingUp className="w-4 h-4" />
                    )}
                    {latestTx.area}㎡ 전고점 대비 {dropPercent > 0 ? `-${dropPercent}%` : `+${Math.abs(dropPercent)}%`}
                  </div>
                )}
              </div>

              {/* 전고점 바 */}
              {peakAmount > 0 && latestTx && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>최근 거래 ({latestTx.area}㎡)</span>
                    <span>{latestTx.area}㎡ 전고점 {formatPrice(peakAmount)} {sameAreaStat?.peak_date && `(${sameAreaStat.peak_date})`}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min((latestAmount / peakAmount) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* 인사이트 배지들 */}
              {metrics && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {metrics.bargain_percent !== undefined && metrics.bargain_percent < -5 && (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-red-100 text-red-700">
                      <span>🔥</span> 급매 {formatPrice(Math.abs(metrics.bargain_amount || 0))} 저렴
                    </span>
                  )}
                  {metrics.bargain_percent !== undefined && metrics.bargain_percent > 5 && (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-orange-100 text-orange-700">
                      <span>📈</span> 평균 대비 {metrics.bargain_percent.toFixed(1)}% 높음
                    </span>
                  )}
                  {metrics.recovery_rate !== undefined && metrics.recovery_rate < 80 && (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
                      <span>📉</span> 전고점 대비 {(100 - metrics.recovery_rate).toFixed(0)}% 하락
                    </span>
                  )}
                  {metrics.dong_rank !== undefined && metrics.dong_rank <= 3 && metrics.dong_total && (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-700">
                      <span>💰</span> {apartment.region_name?.split(' ')[1] || apartment.dong} 내 가성비 {metrics.dong_rank}위
                    </span>
                  )}
                  {metrics.days_since_last_tx !== undefined && metrics.days_since_last_tx > 180 && (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
                      <span>⏸️</span> {metrics.days_since_last_tx}일간 거래 없음
                    </span>
                  )}
                  {metrics.floor_premium !== undefined && Math.abs(metrics.floor_premium) > 5 && (
                    <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium ${
                      metrics.floor_premium > 0 ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'
                    }`}>
                      <span>{metrics.floor_premium > 0 ? '🏢' : '💵'}</span>
                      {metrics.floor_premium > 0
                        ? `고층 프리미엄 +${metrics.floor_premium.toFixed(1)}%`
                        : `저층 할인 ${metrics.floor_premium.toFixed(1)}%`
                      }
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500">거래 내역이 없습니다</p>
          )}
        </section>

        {/* 가격 추이 차트 */}
        <PriceChart data={historyData} loading={historyLoading} selectedArea={selectedArea} />

        {/* 평형별 시세 */}
        {area_stats.length > 0 && (
          <section className="bg-white rounded-xl p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">평형별 시세</h3>
              {selectedArea && (
                <button
                  onClick={clearAreaFilter}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  전체보기
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {area_stats.map((stat) => {
                const isSelected = selectedArea === stat.area;
                const displayPrice = stat.latest_amount || stat.recent_avg || Math.round(stat.avg_amount);
                return (
                  <button
                    key={stat.area}
                    onClick={() => handleAreaSelect(stat.area)}
                    className={`text-left rounded-lg p-3 transition border-2 ${
                      isSelected
                        ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500'
                        : 'bg-gray-50 border-transparent hover:border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <p className={`text-sm font-medium ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>
                      {stat.area}㎡
                    </p>
                    <p className={`text-lg font-bold mt-1 ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>
                      {formatPrice(displayPrice)}
                    </p>
                    <div className={`text-xs ${isSelected ? 'text-blue-600' : 'text-gray-500'}`}>
                      {stat.latest_date ? (
                        <span>최근 {stat.latest_date}</span>
                      ) : (
                        <span>{stat.count}건 거래</span>
                      )}
                    </div>
                    {stat.recent_avg && stat.latest_amount && stat.recent_avg !== stat.latest_amount && (
                      <p className={`text-xs mt-1 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`}>
                        3개월 평균 {formatPrice(stat.recent_avg)}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedArea && (
              <p className="mt-3 text-sm text-blue-600">
                {selectedArea}㎡ 평형 데이터만 표시 중
              </p>
            )}
          </section>
        )}

        {/* 거래 내역 */}
        <section className="bg-white rounded-xl p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              거래 내역
              {selectedArea && (
                <span className="ml-2 text-sm font-normal text-blue-600">
                  ({selectedArea}㎡)
                </span>
              )}
            </h3>
            <span className="text-sm text-gray-500">
              총 {txTotal.toLocaleString()}건
            </span>
          </div>

          {transactions.length > 0 ? (
            <>
              <div className="space-y-0 divide-y divide-gray-100">
                {transactions.map((tx) => {
                  // 선택된 평형 또는 해당 거래의 평형 기준 전고점 계산
                  const targetArea = selectedArea || Math.round(tx.area);
                  const areaStat = area_stats.find(s => Math.abs(s.area - targetArea) <= 2);
                  const peakAmount = areaStat?.max_amount || 0;
                  const dropPercent = peakAmount > 0 && tx.amount < peakAmount
                    ? Math.round((1 - tx.amount / peakAmount) * 100)
                    : 0;

                  return (
                    <div key={tx.id} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-sm text-gray-500 w-24">{tx.deal_date}</div>
                        <div className="text-sm">
                          <span className="text-gray-900">{tx.area}㎡</span>
                          <span className="text-gray-400 mx-1">·</span>
                          <span className="text-gray-500">{tx.floor}층</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">{formatPrice(tx.amount)}</p>
                        {peakAmount > 0 && dropPercent > 0 && (
                          <p className="text-xs text-blue-600">
                            전고점{areaStat?.peak_date && ` (${areaStat.peak_date})`} 대비 -{dropPercent}%
                          </p>
                        )}
                        {peakAmount > 0 && dropPercent <= 0 && tx.amount >= peakAmount && (
                          <p className="text-xs text-red-500">
                            신고가
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 무한스크롤 감지 요소 */}
              {hasMore && (
                <div ref={lastElementRef} className="py-4 text-center">
                  {txLoading ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      불러오는 중...
                    </div>
                  ) : (
                    <div className="h-4" />
                  )}
                </div>
              )}

              {/* 모든 데이터 로드 완료 */}
              {!hasMore && transactions.length > 0 && (
                <p className="py-4 text-center text-sm text-gray-400">
                  모든 거래 내역을 불러왔습니다
                </p>
              )}
            </>
          ) : txLoading ? (
            <div className="py-8 text-center">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-sm text-gray-500">거래 내역을 불러오는 중...</p>
            </div>
          ) : (
            <p className="text-gray-500">
              {selectedArea ? `${selectedArea}㎡ 평형의 거래 내역이 없습니다` : '거래 내역이 없습니다'}
            </p>
          )}
        </section>
      </div>

      {/* 비교하기 플로팅 버튼 */}
      {compareList.length >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2">
          <button
            onClick={() => router.push(`/compare?ids=${compareList.join(',')}`)}
            className="bg-blue-600 text-white px-6 py-3 rounded-full shadow-lg font-semibold hover:bg-blue-700 transition"
          >
            {compareList.length}개 단지 비교하기
          </button>
        </div>
      )}
    </main>
  );
}
