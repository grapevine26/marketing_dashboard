import type { ActionResult } from "./result";

/**
 * 서버 액션 호출이 통째로 거부되는 경우를 결과값으로 바꾼다.
 *
 * 액션 안에서 난 오류는 runAction 이 잡아 { ok: false } 로 돌려주지만, 요청 자체가
 * 실패하면(네트워크 끊김, 재배포 중, 502 등) 호출이 거부된다. 그러면 화면 코드의
 * setSaving(false) 같은 뒷정리에 도달하지 못해서, 버튼이 계속 눌린 상태로 잠기고
 * 아무 설명도 안 뜬다. 새로고침 전까지 아무것도 못 하게 된다.
 *
 * 여기서 감싸면 호출부는 평소처럼 res.ok 만 보면 된다. 흐름이 바뀌지 않는다.
 */
export async function safeCall<T>(promise: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await promise;
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `요청을 보내지 못했습니다. 연결을 확인하고 다시 시도해주세요. (${cause.slice(0, 120)})`,
    };
  }
}
