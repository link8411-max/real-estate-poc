"use client"

import { useState, useEffect } from 'react';
import { Database, Building2, Calendar, MapPin, RefreshCw, TrendingUp, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// 지역코드 -> 지역명 매핑
const REGION_NAMES: Record<string, string> = {
  "11110": "종로구", "11140": "중구", "11170": "용산구", "11200": "성동구",
  "11215": "광진구", "11230": "동대문구", "11260": "중랑구", "11290": "성북구",
  "11305": "강북구", "11320": "도봉구", "11350": "노원구", "11380": "은평구",
  "11410": "서대문구", "11440": "마포구", "11470": "양천구", "11500": "강서구",
  "11530": "구로구", "11545": "금천구", "11560": "영등포구", "11590": "동작구",
  "11620": "관악구", "11650": "서초구", "11680": "강남구", "11710": "송파구",
  "11740": "강동구",
  "41111": "수원장안", "41113": "수원권선", "41115": "수원영통", "41117": "수원팔달",
  "41131": "성남수정", "41133": "성남중원", "41135": "성남분당", "41150": "의정부",
  "41171": "안양만안", "41173": "안양동안", "41190": "부천", "41210": "광명",
  "41220": "평택", "41250": "동두천", "41271": "안산상록", "41273": "안산단원",
  "41281": "고양덕양", "41285": "고양일산동", "41287": "고양일산서", "41290": "과천",
  "41310": "구리", "41360": "남양주", "41370": "오산", "41390": "시흥",
  "41410": "군포", "41430": "의왕", "41450": "하남", "41461": "용인처인",
  "41463": "용인기흥", "41465": "용인수지", "41480": "파주", "41500": "이천",
  "41550": "안성", "41570": "김포", "41590": "화성", "41610": "광주",
  "41630": "양주", "41650": "포천", "41670": "여주", "41800": "연천",
  "41820": "가평", "41830": "양평",
  "28110": "인천중구", "28140": "인천동구", "28177": "미추홀", "28185": "연수구",
  "28200": "남동구", "28237": "부평구", "28245": "계양구", "28260": "인천서구",
  "28710": "강화군", "28720": "옹진군",
};

interface ProgressData {
  completed: string[];
  failed: { task: string; error: string }[];
  current: { lawd_cd: string; deal_ymd: string; region: string } | null;
  stats: { total_saved: number };
  summary: {
    completed_count: number;
    failed_count: number;
    total_expected: number;
    progress_percent: number;
  };
}

interface MonitorData {
  total_transactions: number;
  total_apartments: number;
  total_regions: number;
  regions: { lawd_cd: string; apt_count: number; tx_count: number }[];
  daily_stats: { deal_date: string; count: number }[];
  yearly_stats: { year: string; count: number }[];
  date_range: { min: string; max: string };
}

export default function MonitorPage() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = async () => {
    try {
      const [monitorRes, progressRes] = await Promise.all([
        fetch(`${API_BASE}/api/monitor`),
        fetch(`${API_BASE}/api/progress`)
      ]);

      if (monitorRes.ok) {
        setData(await monitorRes.json());
      }
      if (progressRes.ok) {
        setProgress(await progressRes.json());
      }
      setLastUpdate(new Date());
    } catch (error) {
      console.error('모니터링 데이터 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    if (autoRefresh) {
      const interval = setInterval(fetchData, 5000); // 5초마다 갱신
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const formatNumber = (n: number) => n?.toLocaleString() || '0';

  if (loading && !data) {
    return (
      <main className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-700 rounded w-1/4 mb-8"></div>
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-24 bg-gray-800 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  const collectedRegions = data?.regions?.filter(r => r.tx_count > 0).length || 0;

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">데이터 수집 모니터링</h1>
            <p className="text-gray-400 text-sm mt-1">
              {lastUpdate && `마지막 업데이트: ${lastUpdate.toLocaleTimeString()}`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              자동 갱신 (5초)
            </label>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition"
            >
              <RefreshCw className="w-4 h-4" />
              새로고침
            </button>
          </div>
        </div>

        {/* 수집 진행 상황 (progress.json 기반) */}
        {progress && (
          <div className="bg-gray-800 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                {progress.current ? (
                  <><Clock className="w-5 h-5 text-yellow-400 animate-pulse" /> 수집 진행 중</>
                ) : progress.summary.completed_count > 0 ? (
                  <><CheckCircle className="w-5 h-5 text-green-400" /> 수집 완료</>
                ) : (
                  <><AlertCircle className="w-5 h-5 text-gray-400" /> 대기 중</>
                )}
              </h3>
              {progress.current && (
                <span className="text-sm text-gray-400">
                  현재: {progress.current.region} {progress.current.deal_ymd}
                </span>
              )}
            </div>

            {/* 진행률 바 */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span>{progress.summary.progress_percent}% 완료</span>
                <span className="text-gray-400">
                  {formatNumber(progress.summary.completed_count)} / {formatNumber(progress.summary.total_expected)}
                </span>
              </div>
              <div className="h-4 bg-gray-700 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-green-500 transition-all duration-500"
                  style={{ width: `${(progress.summary.completed_count / progress.summary.total_expected) * 100}%` }}
                ></div>
                <div
                  className="h-full bg-red-500 transition-all duration-500"
                  style={{ width: `${(progress.summary.failed_count / progress.summary.total_expected) * 100}%` }}
                ></div>
              </div>
            </div>

            {/* 통계 */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-700/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-green-400 text-sm mb-1">
                  <CheckCircle className="w-4 h-4" /> 완료
                </div>
                <p className="text-2xl font-bold">{formatNumber(progress.summary.completed_count)}</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-red-400 text-sm mb-1">
                  <XCircle className="w-4 h-4" /> 실패
                </div>
                <p className="text-2xl font-bold">{formatNumber(progress.summary.failed_count)}</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                  <Clock className="w-4 h-4" /> 대기
                </div>
                <p className="text-2xl font-bold">
                  {formatNumber(progress.summary.total_expected - progress.summary.completed_count - progress.summary.failed_count)}
                </p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-blue-400 text-sm mb-1">
                  <Database className="w-4 h-4" /> 저장됨
                </div>
                <p className="text-2xl font-bold">{formatNumber(progress.stats?.total_saved || 0)}</p>
              </div>
            </div>

            {/* 실패 항목 */}
            {progress.failed && progress.failed.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
                  <XCircle className="w-4 h-4" /> 실패 항목 ({progress.failed.length}개)
                </h4>
                <div className="bg-gray-900 rounded-lg max-h-40 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="text-gray-500 sticky top-0 bg-gray-900">
                      <tr>
                        <th className="text-left px-3 py-2">지역</th>
                        <th className="text-left px-3 py-2">기간</th>
                        <th className="text-left px-3 py-2">오류</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progress.failed.slice(0, 20).map((item, idx) => {
                        const [code, ymd] = item.task.split('_');
                        return (
                          <tr key={idx} className="border-t border-gray-800">
                            <td className="px-3 py-2">{REGION_NAMES[code] || code}</td>
                            <td className="px-3 py-2">{ymd}</td>
                            <td className="px-3 py-2 text-red-400 truncate max-w-xs">{item.error}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 주요 지표 */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-2">
                <Database className="w-5 h-5 text-blue-400" />
                <span className="text-gray-400 text-sm">총 거래</span>
              </div>
              <p className="text-3xl font-bold">{formatNumber(data.total_transactions)}</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-2">
                <Building2 className="w-5 h-5 text-green-400" />
                <span className="text-gray-400 text-sm">총 아파트</span>
              </div>
              <p className="text-3xl font-bold">{formatNumber(data.total_apartments)}</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-2">
                <MapPin className="w-5 h-5 text-yellow-400" />
                <span className="text-gray-400 text-sm">수집 지역</span>
              </div>
              <p className="text-3xl font-bold">{collectedRegions} / 78</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-2">
                <Calendar className="w-5 h-5 text-purple-400" />
                <span className="text-gray-400 text-sm">데이터 기간</span>
              </div>
              <p className="text-lg font-bold">{data.date_range.min?.slice(0, 7)}</p>
              <p className="text-sm text-gray-400">~ {data.date_range.max}</p>
            </div>
          </div>
        )}

        {data && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* 최근 거래일별 */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-400" />
                최근 14일 거래
              </h3>
              <div className="space-y-2">
                {data.daily_stats.map((stat) => (
                  <div key={stat.deal_date} className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm">{stat.deal_date}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${Math.min((stat.count / 500) * 100, 100)}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium w-16 text-right">{formatNumber(stat.count)}건</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 연도별 통계 */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                연도별 거래량
              </h3>
              <div className="space-y-2">
                {data.yearly_stats.map((stat) => {
                  const maxCount = Math.max(...data.yearly_stats.map(s => s.count));
                  return (
                    <div key={stat.year} className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm">{stat.year}년</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500"
                            style={{ width: `${(stat.count / maxCount) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium w-20 text-right">{formatNumber(stat.count)}건</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 지역별 상세 */}
        {data && (
          <div className="bg-gray-800 rounded-xl p-5 mt-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-yellow-400" />
              지역별 수집 현황 (78개 지역)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {data.regions.map((region) => (
                <div
                  key={region.lawd_cd}
                  className={`p-2 rounded-lg text-center text-sm ${
                    region.tx_count > 0 ? 'bg-green-900/50 border border-green-700' : 'bg-gray-700/50'
                  }`}
                >
                  <p className="font-medium truncate">{REGION_NAMES[region.lawd_cd] || region.lawd_cd}</p>
                  <p className="text-xs text-gray-400">{formatNumber(region.tx_count)}건</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
