"use client";

import { useSyncExternalStore } from "react";

/**
 * 브라우저에서 그려지기 시작했는지 알려준다.
 *
 * 포털(모달)처럼 `document` 가 있어야 하는 것을 서버 렌더에서 건너뛰려고 쓴다.
 * 전에는 `useEffect(() => setMounted(true), [])` 로 했는데, React 19 는 이 방식을
 * "효과 안에서 상태를 바꿔 렌더를 한 번 더 돌린다"고 경고한다. 실제로도 첫 화면을 그린 뒤
 * 다시 그리게 되어 한 프레임 낭비다.
 *
 * `useSyncExternalStore` 는 서버와 클라이언트에 각각 다른 값을 주는 것이 본래 용도라
 * 상태를 바꾸지 않고 같은 일을 한다. 구독할 것이 없으므로 구독 함수는 비워 둔다.
 */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
