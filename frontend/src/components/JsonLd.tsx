import { jsonLdHtml } from "@/lib/seo";

/** 구조화 데이터. 서버 컴포넌트에서만 쓴다. */
export default function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }} />;
}
