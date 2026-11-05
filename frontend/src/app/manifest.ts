import type { MetadataRoute } from "next";
import { HOME_TITLE, SITE_NAME } from "@/lib/seo";

// 휴대폰 홈 화면에 추가할 때 쓰는 이름·아이콘. 아이콘 파일은 public/icon-192.png·icon-512.png
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: HOME_TITLE,
    short_name: SITE_NAME,
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#2563EB",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
