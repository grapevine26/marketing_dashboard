"use server";

import { ActionResult, runAuthedAction } from "@/lib/actions/result";
import { updateMyDisplayName, changeMyPassword } from "@/lib/auth/profile";

/**
 * 내 정보 변경. 로그인한 본인만 자기 것을 바꾼다.
 *
 * 관리자 권한과 무관하다. 직원도 자기 이름과 비밀번호는 바꿀 수 있어야 한다.
 * 대상 id 를 받지 않는 이유가 여기 있다. 항상 "지금 로그인한 사람" 이 대상이다.
 * id 를 받으면 남의 것을 바꾸려는 요청을 막는 검사가 또 필요해진다.
 */

export async function updateMyNameAction(displayName: string): Promise<ActionResult<{ display_name: string }>> {
  return runAuthedAction(async (me) => {
    const next = await updateMyDisplayName(me, displayName);
    return { display_name: next };
  });
}

export async function changeMyPasswordAction(input: {
  current: string;
  next: string;
}): Promise<ActionResult<null>> {
  return runAuthedAction(async (me) => {
    await changeMyPassword(me, input.current, input.next);
    return null;
  });
}
