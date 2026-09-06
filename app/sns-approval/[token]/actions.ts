"use server";

import { revalidatePath } from "next/cache";
import { getSnsAccountByToken, reviewSnsContent } from "@/lib/db";
import { ActionResult, runAction, fail } from "@/lib/actions/result";

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
  if (data.decision === "request_changes" && !data.comment?.trim()) {
    return fail("수정 요청 사항을 입력해주세요.");
  }

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
