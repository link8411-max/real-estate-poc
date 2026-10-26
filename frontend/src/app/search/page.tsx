import type { Metadata } from "next";
import { Suspense } from "react";
import SearchPanel from "@/components/SearchPanel";

export const metadata: Metadata = { title: "아파트 검색" };

export default function SearchPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold text-gray-900">아파트 검색</h1>
      <Suspense>
        <SearchPanel />
      </Suspense>
    </main>
  );
}
