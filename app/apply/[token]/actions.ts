"use server";

import { getCampaignByToken, createApplicant } from "@/lib/db";
import { ActionResult, runAction, fail } from "@/lib/actions/result";
import { sendWebhookNotification } from "@/lib/notifications/webhook";
import {
  APPLY_SUBMIT,
  getClientIp,
  hitThrottle,
  isThrottled,
  publicSubmitKey,
  refundThrottle,
} from "@/lib/security/throttle";
import { revalidatePath } from "next/cache";

export async function submitApplicantAction(params: {
  token: string;
  name: string;
  sns_link: string;
  nationality: string;
  contact: string;
  follower_count?: number | null;
  category?: string | null;
  shipping_address?: string | null;
  visit_schedule?: string | null;
  visit_party_size?: number | null;
  custom_answers: Record<string, unknown>;
  privacy_agreed: boolean;
  secondary_use_agreed: boolean;
  honeypot?: string;
  allow_duplicate?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  // 허니팟(Honeypot) 스팸 방어: 숨김 필드가 채워진 경우 봇으로 간주하여 무음 성공 반환.
  // 돌려주는 id 는 진짜 저장했을 때와 구분되지 않아야 한다. 고정 문자열을 주면 봇이 한 번
  // 찔러보고 "이 필드가 허니팟이구나" 를 알아내 그 다음부터 비워서 보낸다.
  if (params.honeypot && params.honeypot.trim().length > 0) {
    return { ok: true, data: { id: crypto.randomUUID() } };
  }

  // **토큰을 먼저 확인한다.** 횟수 제한 키에 토큰이 들어가는데, 확인하지 않고 세면
  // 아무 문자열이나 보낼 때마다 auth_throttle 에 새 행이 하나씩 쌓인다. 키가 매번 달라
  // 어떤 제한에도 걸리지 않으므로, 그것만으로 DB 용량을 채워 로그인까지 멈출 수 있다.
  const campaign = await getCampaignByToken("apply_form", params.token);
  if (!campaign) return fail("유효하지 않은 지원 링크입니다.");
  // 끝난 뒤에는 옛 링크로 고쳐 쓰지 못하게 막는다. 화면과 같은 기준이다.
  if (campaign.status === "completed") return fail("종료된 캠페인입니다. 담당자에게 문의해주세요.");

  // 제출 횟수 제한. DB 로 센다 — 인메모리는 서버리스에서 요청마다 비워져 아무것도 막지 못한다.
  const submitKey = publicSubmitKey("apply", params.token, await getClientIp());
  if (await isThrottled([submitKey])) {
    return fail("단시간에 너무 많은 지원 요청이 발생했습니다. 10분 후 다시 시도해 주세요.");
  }
  // **부르기 전에** 센다. 동시에 여러 번 눌러도 상한을 넘지 않게 하려는 것이고,
  // 접수되지 않았으면 아래에서 돌려준다.
  await hitThrottle(submitKey, APPLY_SUBMIT);

  const res = await runAction(async () => {
    const applicant = await createApplicant({
      campaign_id: campaign.id,
      name: params.name,
      sns_link: params.sns_link,
      nationality: params.nationality,
      contact: params.contact,
      follower_count: params.follower_count,
      category: params.category,
      shipping_address: params.shipping_address,
      visit_schedule: params.visit_schedule,
      visit_party_size: params.visit_party_size,
      custom_answers: params.custom_answers,
      privacy_agreed: params.privacy_agreed,
      secondary_use_agreed: params.secondary_use_agreed,
      allow_duplicate: params.allow_duplicate,
    });
    return { id: applicant.id };
  });

  // **접수되지 않았으면 횟수를 돌려준다.**
  //
  // 여기서 실패하는 대부분은 지원자의 실수다 — SNS 주소에 https 를 안 붙였거나, 필수 질문을
  // 빠뜨렸거나, 중복 경고를 받고 다시 보내는 경우다. 그걸 전부 차감하면 **몇 번 틀린 정상
  // 지원자가 10분간 아예 못 내게 된다.** 게다가 국내 모바일 회선은 여러 명이 같은 IP 로
  // 보이므로(CGNAT), 오픈채팅에 뿌린 링크에서는 남의 실수로 내 차례가 막히기까지 한다.
  //
  // 세는 목적은 "같은 곳에서 진짜 접수를 쏟아내는 것" 을 막는 것이지 오타를 벌하는 것이 아니다.
  // 세는 것 자체를 뒤로 미루지 않는 이유는 위 주석대로 동시 제출 때문이다.
  if (!res.ok) {
    await refundThrottle(submitKey);
    return res;
  }

  if (campaign.webhook_url) {
    try {
      await sendWebhookNotification(campaign.webhook_url, {
        event: "applicant.applied",
        title: "새로운 인플루언서 지원 접수",
        message: `${params.name}님이 '${campaign.name}' 캠페인에 지원했습니다. (SNS: ${params.sns_link})`,
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        data: {
          applicant_id: res.data.id,
          name: params.name,
          sns_link: params.sns_link,
          follower_count: params.follower_count,
          category: params.category,
        },
      });
    } catch (err) {
      console.warn("[webhook] 지원 접수 웹훅 발송 오류:", err);
    }
  }
  revalidatePath(`/campaigns/${campaign.id}`);
  revalidatePath(`/campaigns/${campaign.id}/applicants`);
  return res;
}
