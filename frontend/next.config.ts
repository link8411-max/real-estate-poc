import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Strict Mode 비활성화 (개발 모드에서 중복 API 호출 방지)
  reactStrictMode: false,
  // OG 이미지 라우트는 Node 런타임에서 폰트를 fs 로 읽는다 → 서버리스 번들에 파일을 포함시킨다.
  outputFileTracingIncludes: {
    "/api/og/[id]": ["./public/fonts/NotoSansKR-Bold-subset.woff"],
  },
};

export default nextConfig;
