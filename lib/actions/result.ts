import { ValidationError } from "@/lib/db";

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
 * 반복돼서 원인 한 줄을 같이 붙인다. 이 앱은 로그인이 없는 내부 도구고, 사용자가 서버
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
