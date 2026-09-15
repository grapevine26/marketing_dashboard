"use server";

import { revalidatePath } from "next/cache";
import { getSnsAccountByToken, reviewSnsContent, isSnsAccountClosed } from "@/lib/db";
import { ActionResult, runAction, fail } from "@/lib/actions/result";
import {
  PUBLIC_SUBMIT,
  getClientIp,
  hitThrottle,
  isThrottled,
  publicSubmitKey,
} from "@/lib/security/throttle";

/**
 * 광고주 승인/수정요청. 승인 토큰으로 계정을 확인한 뒤, 그 계정 소속이며 승인대기 상태인 콘텐츠만 처리한다.
 * 이미 처리된 콘텐츠는 changed=false로 돌아오고(멱등), 화면에서 목록에서 제거된다.
 */
export async function reviewSnsContentByTokenAction(data: {
  token: string;
  contentId: string;
  decision: "approve" | "request_changes";
  comment?: string;
}): Promise<ActionResult<{ changed: boolean; status: string }>> {
  const account = await getSnsAccountByToken("approval", data.token);
  if (!account) return fail("유효하지 않은 승인 링크입니다.");
  // 끝난 뒤에는 옛 링크로 고쳐 쓰지 못하게 막는다. 화면과 같은 기준이다.
  if (isSnsAccountClosed(account)) return fail("종료된 계약입니다. 담당자에게 문의해주세요.");
  if (data.decision === "request_changes" && !data.comment?.trim()) {
    return fail("수정 요청 사항을 입력해주세요.");
  }

  // 같은 성격의 다른 공개 폼(지원·사전조사·인테이크)과 같은 횟수 제한을 건다. 여기만 빠져 있었다.
  // 매 호출이 DB 조회와 감사 로그 삽입을 일으키므로, 링크를 받은 사람이 눌러대면 그대로 비용이 된다.
  // **계정을 확인한 뒤**에 센다. 확인 전에 세면 아무 문자열이나 보낼 때마다 제한표에 새 행이 쌓인다.
  const submitKey = publicSubmitKey("snsapproval", data.token, await getClientIp());
  if (await isThrottled([submitKey])) {
    return fail("단시간에 너무 많은 요청이 발생했습니다. 10분 후 다시 시도해 주세요.");
  }
  await hitThrottle(submitKey, PUBLIC_SUBMIT);

  const res = await runAction(async () => {
    const r = await reviewSnsContent({
      accountId: account.id,
      contentId: data.contentId,
      decision: data.decision,
      comment: data.comment,
    });
    return { changed: r.changed, status: r.content.status };
  });
  if (res.ok) {
    revalidatePath(`/sns-approval/${data.token}`);
    revalidatePath(`/sns/${account.id}`);
    revalidatePath("/");
  }
  return res;
}
