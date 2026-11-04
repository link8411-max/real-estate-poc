import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Strict Mode 비활성화 (개발 모드에서 중복 API 호출 방지)
  reactStrictMode: false,
  // OG 이미지 라우트는 Node 런타임에서 폰트를 fs 로 읽는다 → 서버리스 번들에 파일을 포함시킨다.
  outputFileTracingIncludes: {
    "/api/og/[id]": ["./public/fonts/NotoSansKR-Bold-subset.woff"],
    "/api/og/canceled/[aptId]/[txId]": ["./public/fonts/NotoSansKR-Bold-subset.woff"],
  },
  // 예전 주소(vercel.app)로 들어오면 같은 경로의 zipsise.com 으로 영구 이동 — 검색 노출·공유 링크를 새 주소로 모은다.
  // 미리보기 배포 주소는 건드리지 않는다.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "real-estate-poc-self.vercel.app" }],
        destination: "https://zipsise.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
