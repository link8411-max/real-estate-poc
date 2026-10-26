import { Building2 } from "lucide-react";
import Link from "next/link";
import Fallback, { primaryButton, secondaryButton } from "@/components/Fallback";

export default function ApartmentNotFound() {
  return (
    <Fallback icon={Building2} title="아파트를 찾을 수 없습니다" message="단지 번호가 잘못되었거나 더 이상 제공되지 않는 단지입니다.">
      <Link href="/search" className={primaryButton}>
        아파트 검색
      </Link>
      <Link href="/" className={secondaryButton}>
        홈으로
      </Link>
    </Fallback>
  );
}
