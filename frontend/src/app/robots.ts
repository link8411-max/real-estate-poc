import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    // /api/og/ 는 링크 미리보기 이미지라 크롤러(트위터 등)가 받아갈 수 있어야 한다.
    rules: { userAgent: "*", allow: ["/", "/api/og/"], disallow: ["/api/", "/compare", "/search"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
