import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    // /api/og/ 는 링크 미리보기 이미지라 크롤러(트위터 등)가 받아갈 수 있어야 한다.
    // /search·/compare는 막지 않는다: 크롤러가 페이지의 noindex(follow)를 읽어야 색인에서 빠진다.
    rules: [
      { userAgent: "*", allow: ["/", "/api/og/"], disallow: ["/api/"] },
      // 검색 유입과 무관한데 요청의 80%를 차지하던 수집기(2026-11-11, Vercel 무료 한도 초과 원인). vercel.json 에서도 거절한다.
      { userAgent: ["ExaSearchBot", "ElevenlabsCrawler", "SERankingBacklinksBot"], disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
