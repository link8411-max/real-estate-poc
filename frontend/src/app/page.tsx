"use client"

import { Search, TrendingUp, Building2, MapPin } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Transaction {
  id: number;
  apt_id: number;
  apt_name: string;
  dong: string;
  region_name: string;
  amount: number;
  area: number;
  floor: number;
  deal_date: string;
  summary_text?: string;
}

interface Stats {
  recent_transactions_30d: number;
  total_apartments: number;
}

export default function Home() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [txRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/api/transactions?limit=6`),
        fetch(`${API_BASE}/api/stats`)
      ]);

      if (txRes.ok) {
        setRecentTransactions(await txRes.json());
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch (error) {
      console.error('데이터 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      console.log('[Main] handleSearch, navigating to search, time:', new Date().toISOString());
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
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

  return (
    <main className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            수도권 실거래가
          </h1>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/browse" className="text-gray-600 hover:text-gray-900">지역탐색</a>
            <a href="/stats" className="text-gray-600 hover:text-gray-900">통계</a>
            <a href="/compare" className="text-gray-600 hover:text-gray-900">비교하기</a>
          </nav>
        </div>
      </header>

      {/* 메인 검색 영역 */}
      <section className="bg-gradient-to-b from-blue-600 to-blue-700 py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-2">
            아파트 실거래가 조회
          </h2>
          <p className="text-blue-100 mb-8">
            수도권 66개 시군구 실거래 데이터를 검색하세요
          </p>

          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="아파트 이름 또는 지역명 검색"
              className="w-full py-4 pl-12 pr-4 rounded-xl text-lg border-0 shadow-lg focus:ring-2 focus:ring-blue-300 focus:outline-none"
            />
          </form>

          <div className="mt-4 flex justify-center gap-2 flex-wrap">
            {['잠실', '반포', '강남', '판교', '분당'].map((keyword) => (
              <button
                key={keyword}
                onClick={() => router.push(`/search?q=${keyword}`)}
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm rounded-full transition"
              >
                {keyword}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 통계 */}
      {stats && (
        <section className="max-w-5xl mx-auto px-4 -mt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats.total_apartments.toLocaleString()}</p>
                  <p className="text-sm text-gray-500">등록 단지</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats.recent_transactions_30d.toLocaleString()}</p>
                  <p className="text-sm text-gray-500">최근 30일 거래</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 지역 탐색 */}
      <section className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">지역별 탐색</h3>
          <a href="/browse" className="text-sm text-blue-600 hover:underline">전체보기</a>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <a
            href="/browse?city=서울"
            className="bg-white rounded-xl p-4 border border-gray-100 hover:border-blue-200 hover:shadow-md transition text-center"
          >
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-2">
              <MapPin className="w-5 h-5 text-blue-600" />
            </div>
            <p className="font-semibold text-gray-900">서울</p>
            <p className="text-xs text-gray-500">25개 구</p>
          </a>
          <a
            href="/browse?city=경기"
            className="bg-white rounded-xl p-4 border border-gray-100 hover:border-green-200 hover:shadow-md transition text-center"
          >
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-2">
              <MapPin className="w-5 h-5 text-green-600" />
            </div>
            <p className="font-semibold text-gray-900">경기</p>
            <p className="text-xs text-gray-500">43개 시/구</p>
          </a>
          <a
            href="/browse?city=인천"
            className="bg-white rounded-xl p-4 border border-gray-100 hover:border-purple-200 hover:shadow-md transition text-center"
          >
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-2">
              <MapPin className="w-5 h-5 text-purple-600" />
            </div>
            <p className="font-semibold text-gray-900">인천</p>
            <p className="text-xs text-gray-500">10개 구/군</p>
          </a>
        </div>
      </section>

      {/* 최근 거래 */}
      <section className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">최근 거래</h3>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div className="h-6 bg-gray-200 rounded w-1/3"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentTransactions.map((tx) => (
              <a
                key={tx.id}
                href={`/apartment/${tx.apt_id}`}
                className="bg-white rounded-xl p-4 border border-gray-100 hover:border-blue-200 hover:shadow-md transition group"
              >
                <h4 className="font-semibold text-gray-900 group-hover:text-blue-600 transition truncate">
                  {tx.apt_name}
                </h4>
                <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{tx.region_name ? `${tx.region_name} ${tx.dong}` : tx.dong}</span>
                  <span className="mx-1">·</span>
                  <span>{tx.area}㎡</span>
                  <span className="mx-1">·</span>
                  <span>{tx.floor}층</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xl font-bold text-gray-900">
                    {formatPrice(tx.amount)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {tx.deal_date}
                  </span>
                </div>
                {tx.summary_text && (
                  <p className="mt-2 text-xs text-gray-500 truncate">
                    {tx.summary_text}
                  </p>
                )}
              </a>
            ))}
          </div>
        )}
      </section>

      {/* 푸터 */}
      <footer className="border-t border-gray-100 bg-white py-8 mt-8">
        <div className="max-w-5xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>수도권 실거래가 서비스</p>
          <p className="mt-1">데이터 출처: 국토교통부 실거래가 공개시스템</p>
        </div>
      </footer>
    </main>
  );
}
