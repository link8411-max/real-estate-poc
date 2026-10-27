import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    // /api/og/ 는 링크 미리보기 이미지라 크롤러(트위터 등)가 받아갈 수 있어야 한다.
    // /search·/compare는 막지 않는다: 크롤러가 페이지의 noindex(follow)를 읽어야 색인에서 빠진다.
    rules: { userAgent: "*", allow: ["/", "/api/og/"], disallow: ["/api/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
