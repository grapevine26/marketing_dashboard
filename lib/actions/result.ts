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

/** ValidationError는 사용자에게 메시지를 그대로 보여주고, 그 외 에러는 일반 문구로 감춘다. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return ok(data);
  } catch (err) {
    if (err instanceof ValidationError) return fail(err.message);
    console.error("Action failed:", err);
    return fail("처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }
}
