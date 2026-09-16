"use server";

// 규칙: 액션 본문 첫 문장은 `return runAction(...)`. 토큰 확인·DB 조회도 래퍼 안에서 해서 오류가 밖으로 새지 않게 한다.

import { getCampaignByToken, getApplicantById, updateApplicantStatus, getFormConfig, ValidationError } from "@/lib/db";
import { sanitizeApplicantForCompany, questionsSharedWithCompany } from "@/lib/db/types";
import { Applicant, ApplicantStatus } from "@/lib/db/types";
import { revalidatePath } from "next/cache";
import { ActionResult, runAction } from "@/lib/actions/result";
import { sendWebhookNotification } from "@/lib/notifications/webhook";
import {
  PUBLIC_BY_LINK,
  PUBLIC_SUBMIT,
  getClientIp,
  hitThrottle,
  isThrottled,
  publicLinkKey,
  publicSubmitKey,
} from "@/lib/security/throttle";

const APPLICANT_NOT_FOUND = "지원자가 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.";

/**
 * 광고주 공유 링크(/applicants/[token])에서의 최종선정/예비선정.
 * 토큰으로 캠페인을 확인하고, 지원자가 그 캠페인 소속일 때만 처리한다. 실행 주체는 "company"로 고정.
 * 광고주가 보는 화면이라 오류 문구는 전부 한국어로, 내부 정보 없이 돌려준다.
 */
export async function changeApplicantStatusByTokenAction(params: {
  token: string;
  applicantId: string;
  status: ApplicantStatus;
}): Promise<ActionResult<Applicant>> {
  return runAction(async () => {
    const campaign = await getCampaignByToken("applicants_share", params.token);
    if (!campaign) throw new ValidationError("유효하지 않은 공유 링크입니다. 담당자에게 새 링크를 요청해주세요.");
  // 끝난 뒤에는 옛 링크로 고쳐 쓰지 못하게 막는다. 화면과 같은 기준이다.
    if (campaign.status === "completed") throw new ValidationError("종료된 캠페인입니다. 담당자에게 문의해주세요.");

    // 다른 공개 폼(지원·사전조사·인테이크·승인)과 같은 횟수 제한을 건다. 여기만 빠져 있었다.
    //
    // 이 액션은 호출마다 상태를 바꾸고 **감사 로그를 한 줄 남기며**, selected 면
    // **광고주 웹훅까지 쏜다**. 링크를 받은 사람이 선정↔예비를 번갈아 누르면
    // 그때마다 전부 다시 일어난다 — 남의 슬랙 채널에 알림을 퍼붓는 데 쓸 수 있고,
    // 무료 요금제의 DB 용량을 감사 로그로 채우면 로그인 제한표까지 같은 DB 에서 멈춘다.
    //
    // **캠페인을 확인한 뒤**에 센다. 확인 전에 세면 아무 문자열이나 보낼 때마다
    // 제한표에 새 행이 쌓여, 막으려던 것을 그대로 당한다.
    const 제한키 = [
      publicSubmitKey("applicantpick", params.token, await getClientIp()),
      publicLinkKey("applicantpick", params.token),
    ];
    if (await isThrottled(제한키)) {
      throw new ValidationError("단시간에 너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.");
    }
    // 둘은 서로 다른 행이라 순서가 없다. 줄줄이 기다리면 광고주가 버튼을 누르고 기다리는
    // 시간만 왕복 한 번치 늘어난다. 같이 보낸다.
    await Promise.all([hitThrottle(제한키[0]!, PUBLIC_SUBMIT), hitThrottle(제한키[1]!, PUBLIC_BY_LINK)]);

    const applicant = await getApplicantById(params.applicantId);
    if (!applicant || applicant.campaign_id !== campaign.id) throw new ValidationError(APPLICANT_NOT_FOUND);

    const result = await updateApplicantStatus(params.applicantId, params.status, "company");
    if (!result) throw new ValidationError(APPLICANT_NOT_FOUND);

    // 웹훅은 부가 기능이다. 실패해도 선정은 이미 끝났으므로 경고만 남긴다.
    if (params.status === "selected" && campaign.webhook_url) {
      try {
        await sendWebhookNotification(campaign.webhook_url, {
          event: "applicant.selected",
          title: "인플루언서 최종선정 완료",
          message: `${applicant.name}님이 '${campaign.name}' 캠페인에 최종선정되었습니다. (광고주 선정)${applicant.sns_link ? ` (SNS: ${applicant.sns_link})` : ""}`,
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          data: { applicant_id: applicant.id, name: applicant.name, sns_link: applicant.sns_link },
        });
      } catch (err) {
        console.warn("[webhook] 광고주 최종선정 웹훅 발송 오류:", err);
      }
    }

    revalidatePath(`/applicants/${params.token}`);
    revalidatePath(`/campaigns/${campaign.id}`);
    revalidatePath(`/campaigns/${campaign.id}/applicants`);
    revalidatePath(`/campaigns/${campaign.id}/seeding-sheet`);
    // **돌려줄 때도 씻는다.** 화면을 그릴 때만 씻고 액션 응답을 그대로 주면,
    // 광고주가 버튼을 누르는 순간 그 지원자의 연락처·배송지·내부 메모가 브라우저로 돌아온다.
    // 화면에 그 칸을 안 그리는 것은 방어가 아니다. 응답 본문에 값이 실려 있다.
    //
    // 현재 질문 목록도 같이 넘긴다. 화면(page.tsx)과 기준이 다르면,
    // 첫 렌더에서는 빠졌던 옛 답변이 버튼 한 번에 응답으로 되돌아온다.
    const formConfig = await getFormConfig(campaign.id);
    const allowedQuestionIds = questionsSharedWithCompany(formConfig?.custom_questions || []).map((q) => q.id);
    return sanitizeApplicantForCompany(result.applicant, allowedQuestionIds);
  });
}
