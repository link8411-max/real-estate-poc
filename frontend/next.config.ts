import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Strict Mode 비활성화 (개발 모드에서 중복 API 호출 방지)
  reactStrictMode: false,
};

export default nextConfig;
