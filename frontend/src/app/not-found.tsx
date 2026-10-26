import { SearchX } from "lucide-react";
import Link from "next/link";
import Fallback, { primaryButton } from "@/components/Fallback";

export default function NotFound() {
  return (
    <Fallback icon={SearchX} title="페이지를 찾을 수 없습니다" message="주소가 바뀌었거나 없는 페이지입니다.">
      <Link href="/" className={primaryButton}>
        홈으로
      </Link>
    </Fallback>
  );
}
