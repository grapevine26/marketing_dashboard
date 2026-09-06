"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * 현재 페이지의 origin. 서버 렌더링에서는 ""를, 클라이언트에서는 window.location.origin을 돌려준다.
 * (useEffect + setState 대신 useSyncExternalStore를 써서 하이드레이션 불일치와 불필요한 재렌더를 피한다)
 */
export function useOrigin(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => ""
  );
}
