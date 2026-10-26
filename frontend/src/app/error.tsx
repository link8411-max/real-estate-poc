"use client";

import { CloudOff } from "lucide-react";
import { useEffect } from "react";
import Fallback, { primaryButton } from "@/components/Fallback";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Fallback icon={CloudOff} title="데이터를 불러오지 못했습니다" message="잠시 후 다시 시도해 주세요.">
      <button type="button" onClick={reset} className={primaryButton}>
        다시 시도
      </button>
    </Fallback>
  );
}
