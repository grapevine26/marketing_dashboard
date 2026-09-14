import { ValidationError } from "@/lib/db";
import { requireAdmin, requireUser, type SessionUser } from "@/lib/auth/session";
import { withActor } from "@/lib/auth/context";

/**
 * 서버 액션 공통 반환 타입.
 * 명시적 반환 타입이 없으면 `result.ok` 내로잉이 깨져 프로덕션 빌드가 실패할 수 있으므로
 * 모든 액션은 `Promise<ActionResult<T>>`를 반환한다.
 */
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = null>(error: string): ActionResult<T> {
  return { ok: false, error };
}

/** 사용자에게 보여줄 원인 한 줄. 스택은 절대 넣지 않고 길이도 자른다. */
function briefCause(err: unknown): string {
  if (!(err instanceof Error)) return String(err).slice(0, 120);
  const message = err.message.replace(/\s+/g, " ").trim().slice(0, 160);
  return message ? `${err.name}: ${message}` : err.name;
}

/**
 * ValidationError는 사용자에게 메시지를 그대로 보여준다.
 *
 * 그 외 오류는 "처리 중 오류" 한 줄로만 감싸다가, 배포에서 원인을 짐작만 하게 되는 문제가
 * 반복돼서 원인 한 줄을 같이 붙인다. 이 앱은 승인된 직원만 쓰는 내부 도구고, 사용자가 서버
 * 로그를 직접 볼 수 없는 환경(휴대폰)에서 쓰기 때문에 이 편이 낫다고 판단했다.
 * 스택 트레이스나 환경 변수 값은 넣지 않는다.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return ok(data);
  } catch (err) {
    if (err instanceof ValidationError) return fail(err.message);
    console.error("Action failed:", err);
    return fail(`처리 중 오류가 발생했습니다. (${briefCause(err)})`);
  }
}

/**
 * 로그인한 사용자만 실행할 수 있는 액션.
 *
 * **대시보드 서버 액션은 전부 이걸 써야 한다.** 서버 액션은 화면을 거치지 않고 직접
 * 호출될 수 있어서, 화면에서 막는 것만으로는 부족하다. 여기가 진짜 경계다.
 * 공개 라우트(지원폼·사전조사·승인 링크)는 로그인 없이 열려야 하므로 맨 `runAction` 을 쓴다.
 *
 * 콜백이 현재 사용자를 받는다. 감사 로그에 "누가 했는지"를 남길 때 쓴다.
 *
 * 통과하지 못하면 `requireUser` 가 로그인·대기·차단 화면으로 보낸다(리다이렉트 예외를 던진다).
 * 그 예외는 Next.js 가 처리해야 하므로 잡지 않고 그대로 올려보낸다.
 */
export async function runAuthedAction<T>(
  fn: (user: SessionUser) => Promise<T>
): Promise<ActionResult<T>> {
  const user = await requireUser();
  // 사용자를 요청 컨텍스트에 담는다. 감사 로그가 "누가" 했는지 알아내는 통로다.
  return withActor(user, () => runAction(() => fn(user)));
}

/** 관리자만 실행할 수 있는 액션. 사용자 관리처럼 권한이 필요한 곳에 쓴다. */
export async function runAdminAction<T>(
  fn: (user: SessionUser) => Promise<T>
): Promise<ActionResult<T>> {
  const user = await requireAdmin();
  return withActor(user, () => runAction(() => fn(user)));
}
