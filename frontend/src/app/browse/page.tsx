"use client"

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MapPin, Building2, ChevronRight, ArrowLeft, TrendingUp } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface District {
  code: string;
  name: string;
  apt_count: number;
  tx_count: number;
}

interface RegionHierarchy {
  [city: string]: District[];
}

interface Apartment {
  id: number;
  name: string;
  dong: string;
  jibun: string;
  build_year: number;
  tx_count: number;
  max_amount: number;
  latest_amount: number;
  latest_area: number;
  latest_date: string;
}

interface RegionData {
  region_code: string;
  region_name: string;
  total: number;
  apartments: Apartment[];
}

export default function BrowsePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCity = searchParams.get('city');
  const selectedCode = searchParams.get('code');

  const [hierarchy, setHierarchy] = useState<RegionHierarchy | null>(null);
  const [regionData, setRegionData] = useState<RegionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHierarchy();
  }, []);

  useEffect(() => {
    if (selectedCode) {
      fetchRegionApartments(selectedCode);
    } else {
      setRegionData(null);
    }
  }, [selectedCode]);

  const fetchHierarchy = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/regions/hierarchy`);
      if (res.ok) {
        setHierarchy(await res.json());
      }
    } catch (error) {
      console.error('지역 정보 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRegionApartments = async (code: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/regions/${code}/apartments?limit=100`);
      if (res.ok) {
        setRegionData(await res.json());
      }
    } catch (error) {
      console.error('아파트 목록 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (amount: number) => {
    if (!amount) return '-';
    if (amount >= 10000) {
      const uk = Math.floor(amount / 10000);
      const man = amount % 10000;
      return man > 0 ? `${uk}억 ${man.toLocaleString()}` : `${uk}억`;
    }
    return `${amount.toLocaleString()}만`;
  };

  const handleCityClick = (city: string) => {
    router.push(`/browse?city=${encodeURIComponent(city)}`);
  };

  const handleDistrictClick = (code: string) => {
    router.push(`/browse?code=${code}`);
  };

  const handleBack = () => {
    if (selectedCode) {
      router.push(`/browse?city=${selectedCity || '서울'}`);
    } else if (selectedCity) {
      router.push('/browse');
    } else {
      router.push('/');
    }
  };

  // 로딩 상태
  if (loading && !hierarchy) {
    return (
      <main className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="h-6 bg-gray-200 rounded w-1/3 animate-pulse"></div>
          </div>
        </header>
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse"></div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // 아파트 목록 보기
  if (selectedCode && regionData) {
    return (
      <main className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="font-semibold text-gray-900">{regionData.region_name}</h1>
              <p className="text-sm text-gray-500">{regionData.total}개 단지</p>
            </div>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 py-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse"></div>
              ))}
            </div>
          ) : regionData.apartments.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Building2 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>아파트 데이터가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {regionData.apartments.map((apt) => (
                <a
                  key={apt.id}
                  href={`/apartment/${apt.id}`}
                  className="block bg-white rounded-xl p-4 border border-gray-100 hover:border-blue-200 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{apt.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {apt.dong} · {apt.build_year}년 · {apt.tx_count}건 거래
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-lg font-bold text-gray-900">{formatPrice(apt.latest_amount)}</p>
                      <p className="text-xs text-gray-500">
                        {apt.latest_area}㎡ · {apt.latest_date}
                      </p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  // 구/군 목록 보기
  if (selectedCity && hierarchy) {
    const districts = hierarchy[selectedCity] || [];

    return (
      <main className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="font-semibold text-gray-900">{selectedCity}</h1>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {districts.map((district) => (
              <button
                key={district.code}
                onClick={() => handleDistrictClick(district.code)}
                className="bg-white rounded-xl p-4 border border-gray-100 hover:border-blue-200 hover:shadow-md transition text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{district.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {district.apt_count > 0 ? `${district.apt_count.toLocaleString()}개 단지` : '데이터 없음'}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
                {district.tx_count > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
                    <TrendingUp className="w-3 h-3" />
                    {district.tx_count.toLocaleString()}건 거래
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // 시/도 선택 (메인)
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="p-2 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="font-semibold text-gray-900">지역별 탐색</h1>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {hierarchy && Object.entries(hierarchy).map(([city, districts]) => {
            const totalApt = districts.reduce((sum, d) => sum + d.apt_count, 0);
            const totalTx = districts.reduce((sum, d) => sum + d.tx_count, 0);

            return (
              <button
                key={city}
                onClick={() => handleCityClick(city)}
                className="bg-white rounded-xl p-6 border border-gray-100 hover:border-blue-200 hover:shadow-lg transition text-left"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    city === '서울' ? 'bg-blue-100' :
                    city === '경기' ? 'bg-green-100' : 'bg-purple-100'
                  }`}>
                    <MapPin className={`w-5 h-5 ${
                      city === '서울' ? 'text-blue-600' :
                      city === '경기' ? 'text-green-600' : 'text-purple-600'
                    }`} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{city}</h2>
                    <p className="text-sm text-gray-500">{districts.length}개 구/시</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-500">단지</p>
                    <p className="font-semibold text-gray-900">{totalApt.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-500">거래</p>
                    <p className="font-semibold text-gray-900">{totalTx.toLocaleString()}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
