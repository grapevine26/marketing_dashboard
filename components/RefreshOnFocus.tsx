"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { shouldRefreshAfterHidden } from "@/lib/ui/refreshPolicy";

/**
 * 탭으로 돌아오면 화면을 최신으로 다시 불러온다.
 *
 * 브라우저 캐시를 1분으로 늘린 대가를 여기서 갚는다. 자리를 비운 사이 인플루언서가
 * 지원했거나 광고주가 시안을 승인했을 수 있는데, 돌아왔을 때 옛 화면을 보면 안 된다.
 *
 * router.refresh 는 서버 데이터만 다시 받는다. 입력 중이던 값은 그대로 남는다.
 */
export default function RefreshOnFocus() {
  const router = useRouter();
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now();
        return;
      }
      const since = hiddenAt.current;
      hiddenAt.current = null;
      if (shouldRefreshAfterHidden(since, Date.now())) {
        router.refresh();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [router]);

  return null;
}
