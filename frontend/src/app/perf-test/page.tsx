"use client"

import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface TestResult {
  index: number;
  duration: number;
  status: string;
}

export default function PerfTestPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const runTest = async () => {
    setRunning(true);
    setResults([]);
    setProgress(0);

    const testResults: TestResult[] = [];

    for (let i = 1; i <= 100; i++) {
      const start = performance.now();
      try {
        const res = await fetch(`${API_BASE}/api/search?q=기흥&limit=30`);
        const end = performance.now();
        const duration = (end - start) / 1000;
        testResults.push({
          index: i,
          duration,
          status: res.ok ? 'OK' : `Error ${res.status}`
        });
      } catch (error) {
        const end = performance.now();
        testResults.push({
          index: i,
          duration: (end - start) / 1000,
          status: 'Failed'
        });
      }
      setProgress(i);
      setResults([...testResults]);
    }

    setRunning(false);
  };

  const slowResults = results.filter(r => r.duration > 0.5);
  const avgDuration = results.length > 0
    ? results.reduce((sum, r) => sum + r.duration, 0) / results.length
    : 0;
  const maxDuration = results.length > 0
    ? Math.max(...results.map(r => r.duration))
    : 0;
  const minDuration = results.length > 0
    ? Math.min(...results.map(r => r.duration))
    : 0;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold mb-6">API 성능 테스트 (브라우저)</h1>

      <button
        onClick={runTest}
        disabled={running}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg disabled:bg-gray-400 mb-6"
      >
        {running ? `테스트 중... ${progress}/100` : '100회 테스트 시작'}
      </button>

      {results.length > 0 && (
        <div className="mb-6 p-4 bg-white rounded-lg shadow">
          <h2 className="font-bold mb-2">결과 요약</h2>
          <p>최소: {minDuration.toFixed(4)}s</p>
          <p>최대: <span className={maxDuration > 1 ? 'text-red-600 font-bold' : ''}>{maxDuration.toFixed(4)}s</span></p>
          <p>평균: {avgDuration.toFixed(4)}s</p>
          <p className={slowResults.length > 0 ? 'text-red-600 font-bold' : ''}>
            0.5초 이상: {slowResults.length}회
          </p>
        </div>
      )}

      {slowResults.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 rounded-lg">
          <h2 className="font-bold text-red-600 mb-2">느린 요청 목록</h2>
          {slowResults.map(r => (
            <p key={r.index}>[{r.index}] {r.duration.toFixed(4)}s</p>
          ))}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4 max-h-96 overflow-y-auto">
        <h2 className="font-bold mb-2">전체 결과</h2>
        <div className="grid grid-cols-5 gap-2 text-sm">
          {results.map(r => (
            <div
              key={r.index}
              className={`p-1 rounded ${
                r.duration > 1 ? 'bg-red-200' :
                r.duration > 0.5 ? 'bg-yellow-200' :
                'bg-green-100'
              }`}
            >
              [{r.index}] {r.duration.toFixed(3)}s
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
