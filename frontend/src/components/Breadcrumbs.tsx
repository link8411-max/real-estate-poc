import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Crumb } from "@/lib/seo";

/** 화면용 경로 표시. 마지막 항목은 현재 페이지(링크 없음). */
export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="경로" className="text-xs text-gray-500">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => (
          <li key={c.url} className="inline-flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-gray-300" aria-hidden />}
            {i === items.length - 1 ? (
              <span aria-current="page" className="text-gray-700">
                {c.name}
              </span>
            ) : (
              <Link href={c.url} className="hover:text-blue-600">
                {c.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
