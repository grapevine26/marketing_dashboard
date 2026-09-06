export interface WebhookPayload {
  event:
    | "applicant.applied"
    | "applicant.selected"
    | "seeding.deadline_approaching"
    | "seeding.uploaded"
    | "test.ping";
  title: string;
  message: string;
  campaign_id?: string;
  campaign_name?: string;
  data?: Record<string, unknown>;
  timestamp?: string;
}

export interface WebhookSendResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * 캠페인 웹훅 알림 발송 (Slack / Discord / 일반 웹훅 호환).
 * 타임아웃 5초 설정, 실패해도 호출자 흐름을 중단시키지 않음.
 */
export async function sendWebhookNotification(
  url: string,
  payload: WebhookPayload
): Promise<WebhookSendResult> {
  if (!url || !url.startsWith("http")) {
    return { ok: false, error: "유효하지 않은 웹훅 URL입니다." };
  }

  const timestamp = new Date().toISOString();
  const body = {
    // Slack / Discord 인커밍 웹훅 표준 본문 지원
    text: `🔔 [${payload.title}] ${payload.message}${
      payload.campaign_name ? ` (캠페인: ${payload.campaign_name})` : ""
    }`,
    event: payload.event,
    title: payload.title,
    message: payload.message,
    campaign_id: payload.campaign_id,
    campaign_name: payload.campaign_name,
    data: payload.data,
    timestamp,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status} 응답` };
    }
    return { ok: true, status: res.status };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "웹훅 전송 오류";
    return { ok: false, error: msg };
  }
}
