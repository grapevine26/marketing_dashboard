import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SessionUser } from "./session";

/**
 * "지금 이 요청을 누가 하고 있는가" 를 요청 단위로 들고 다닌다.
 *
 * 감사 로그에 행위자 이름을 넣으려면 DB 함수가 사용자를 알아야 하는데, 변경 함수 50여 개에
 * 사용자 인자를 하나씩 더하는 건 호출부까지 전부 흔든다. 대신 액션이 시작할 때 여기에 담아두고
 * `insertAuditLog` 가 꺼내 쓴다. 함수 시그니처는 하나도 바뀌지 않는다.
 *
 * AsyncLocalStorage 는 요청마다 격리되므로 동시에 들어온 다른 사람의 요청과 섞이지 않는다.
 * 공개 라우트(지원폼·사전조사·승인 링크)는 로그인이 없으므로 비어 있고, 그때는 기존처럼
 * 행위자 이름 없이 기록된다.
 */
const store = new AsyncLocalStorage<SessionUser>();

/** 이 안에서 실행되는 모든 코드가 `getActor()` 로 사용자를 볼 수 있다. */
export function withActor<T>(user: SessionUser, fn: () => Promise<T>): Promise<T> {
  return store.run(user, fn);
}

/** 현재 요청의 사용자. 로그인 없이 들어온 공개 경로에서는 undefined. */
export function getActor(): SessionUser | undefined {
  return store.getStore();
}
