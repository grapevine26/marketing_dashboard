import { describe, it, expect } from "vitest";
import { safeCall } from "@/lib/actions/safeCall";
import type { ActionResult } from "@/lib/actions/result";

/**
 * 서버 액션 호출 자체가 거부되면(네트워크 끊김, 재배포, 502) 화면 코드의 뒷정리에
 * 도달하지 못해 버튼이 잠긴 채로 남는다. 거부를 결과값으로 바꿔 그걸 막는다.
 */
describe("서버 액션 호출 보호", () => {
  it("성공 결과는 그대로 통과시킨다", async () => {
    const ok: ActionResult<{ id: string }> = { ok: true, data: { id: "c1" } };
    expect(await safeCall(Promise.resolve(ok))).toEqual(ok);
  });

  it("액션이 돌려준 실패도 그대로 통과시킨다", async () => {
    const failed: ActionResult<null> = { ok: false, error: "이름을 입력해주세요." };
    expect(await safeCall(Promise.resolve(failed))).toEqual(failed);
  });

  it("호출이 거부되면 실패 결과로 바꾼다", async () => {
    const res = await safeCall(Promise.reject(new Error("Failed to fetch")));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("요청을 보내지 못했습니다");
      expect(res.error).toContain("Failed to fetch");
    }
  });

  it("Error 가 아닌 것으로 거부돼도 처리한다", async () => {
    const res = await safeCall(Promise.reject("문자열 거부"));
    expect(res.ok).toBe(false);
  });

  it("아주 긴 오류 메시지는 잘라서 담는다", async () => {
    const res = await safeCall(Promise.reject(new Error("가".repeat(500))));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.length).toBeLessThan(200);
  });
});
