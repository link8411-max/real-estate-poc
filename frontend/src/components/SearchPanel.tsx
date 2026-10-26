"use client";

import { Building2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import SearchBox from "@/components/SearchBox";
import { fetchSearchIndex } from "@/lib/data";
import { searchIndex } from "@/lib/search";
import type { SearchIndexRow } from "@/lib/types";

/** 검색 페이지 본문: 색인을 한 번 받아 로컬에서 거르고, 입력은 200ms 뒤 URL(?q=)에 반영한다. */
export default function SearchPanel() {
  const router = useRouter();
  const urlQuery = useSearchParams().get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [rows, setRows] = useState<SearchIndexRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchSearchIndex().then(setRows, () => setFailed(true));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q === urlQuery.trim()) return;
    const t = setTimeout(
      () => router.replace(q ? `/search?q=${encodeURIComponent(q)}` : "/search", { scroll: false }),
      200,
    );
    return () => clearTimeout(t);
  }, [query, urlQuery, router]);

  const deferred = useDeferredValue(query);
  const results = useMemo(() => (rows ? searchIndex(rows, deferred) : []), [rows, deferred]);

  return (
    <>
      <SearchBox defaultValue={urlQuery} onChange={setQuery} autoFocus />
      <div className="mt-6">
        {failed ? (
          <p className="py-10 text-center text-sm text-red-600">검색 색인을 불러오지 못했습니다</p>
        ) : !rows ? (
          <p className="py-10 text-center text-sm text-gray-500">검색 색인을 불러오는 중…</p>
        ) : !deferred.trim() ? (
          <p className="py-10 text-center text-sm text-gray-500">아파트 이름, 동 이름, 초성으로 검색하세요</p>
        ) : results.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">&lsquo;{deferred.trim()}&rsquo; 검색 결과가 없습니다</p>
        ) : (
          <ul className="space-y-2">
            {results.map(([id, name, dong, , buildYear]) => (
              <li key={id}>
                <Link
                  href={`/apartment/${id}`}
                  className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 transition hover:border-blue-200 hover:shadow-md"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Building2 className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{name}</p>
                      <p className="text-xs text-gray-500">
                        {dong}
                        {buildYear ? ` · ${buildYear}년` : ""}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
