import type { Metadata } from "next";
import { Suspense } from "react";
import SearchPanel from "@/components/SearchPanel";

/** 검색 결과는 색인하지 않는다(링크는 따라간다). ?q= 는 canonical에서 뺀다. */
export const metadata: Metadata = {
  title: "아파트 검색",
  alternates: { canonical: "/search" },
  robots: { index: false, follow: true },
};

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
