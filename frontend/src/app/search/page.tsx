"use client"

import { Search, MapPin, Building2, ArrowLeft, Calendar } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface SearchResult {
  id: number;
  name: string;
  dong: string;
  lawd_cd: string;
  region_name: string;
  build_year: number;
  tx_count: number;
  latest_amount: number;
  latest_area: number;
  latest_date: string;
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';

  console.log('[Search] Component rendered, query:', query, 'time:', new Date().toISOString());

  const [searchQuery, setSearchQuery] = useState(query);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log('[Search] useEffect triggered, query:', query, 'time:', new Date().toISOString());

    if (!query) return;

    const abortController = new AbortController();

    const doSearch = async () => {
      console.log('[Search] performSearch started, q:', query, 'time:', new Date().toISOString());
      setLoading(true);
      try {
        console.log('[Search] fetch started, time:', new Date().toISOString());
        const res = await fetch(
          `${API_BASE}/api/search?q=${encodeURIComponent(query)}&limit=30`,
          { signal: abortController.signal }
        );
        console.log('[Search] fetch completed, status:', res.status, 'time:', new Date().toISOString());
        if (res.ok) {
          const data = await res.json();
          console.log('[Search] json parsed, results:', data.length, 'time:', new Date().toISOString());
          setResults(data);
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('검색 실패:', error);
        }
      } finally {
        setLoading(false);
        console.log('[Search] performSearch finished, time:', new Date().toISOString());
      }
    };

    doSearch();

    return () => {
      abortController.abort();
    };
  }, [query]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const formatPrice = (amount: number) => {
    if (!amount) return '-';
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
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>

            <form onSubmit={handleSearch} className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="아파트 이름 또는 지역명 검색"
                className="w-full py-2.5 pl-10 pr-4 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none"
              />
            </form>
          </div>
        </div>
      </header>

      {/* 검색 결과 */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {query && (
          <p className="text-sm text-gray-500 mb-4">
            &quot;{query}&quot; 검색 결과 {results.length}건
          </p>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
                <div className="h-6 bg-gray-200 rounded w-1/4"></div>
              </div>
            ))}
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-3">
            {results.map((apt) => (
              <a
                key={apt.id}
                href={`/apartment/${apt.id}`}
                className="block bg-white rounded-xl p-4 border border-gray-100 hover:border-blue-200 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 text-lg">
                      {apt.name}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {apt.region_name ? `${apt.region_name} ${apt.dong}` : apt.dong}
                      </span>
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5" />
                        {apt.build_year}년
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {apt.tx_count}건 거래
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-gray-900">
                      {formatPrice(apt.latest_amount)}
                    </p>
                    {apt.latest_area && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {apt.latest_area}㎡ · {apt.latest_date}
                      </p>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : query ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500">
              &quot;{query}&quot;에 대한 검색 결과가 없습니다
            </p>
            <p className="text-sm text-gray-400 mt-2">
              다른 검색어로 시도해 보세요
            </p>
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-500">
              검색어를 입력해 주세요
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
