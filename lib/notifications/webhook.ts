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
 * 허용하는 웹훅 호스트. 서버가 클라이언트가 준 임의 URL로 요청을 보내는 구조(SSRF)를 막기 위해
 * 알려진 인커밍 웹훅 서비스만 받는다. 새 서비스가 필요하면 여기에 추가한다.
 */
const ALLOWED_WEBHOOK_HOSTS = ["hooks.slack.com", "discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"];

/** 웹훅 URL 검증. 통과하면 정규화된 URL, 아니면 사람이 읽을 수 있는 이유를 돌려준다. */
export function validateWebhookUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "웹훅 URL 형식이 올바르지 않습니다." };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "웹훅 URL은 https로 시작해야 합니다." };
  }
  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_WEBHOOK_HOSTS.includes(host)) {
    return { ok: false, reason: `지원하지 않는 웹훅 주소입니다. (허용: ${ALLOWED_WEBHOOK_HOSTS.join(", ")})` };
  }
  if (host.includes("discord") && !parsed.pathname.startsWith("/api/webhooks/")) {
    return { ok: false, reason: "Discord 웹훅 URL은 /api/webhooks/ 로 시작해야 합니다." };
  }
  if (host === "hooks.slack.com" && !parsed.pathname.startsWith("/services/")) {
    return { ok: false, reason: "Slack 웹훅 URL은 /services/ 로 시작해야 합니다." };
  }
  return { ok: true, url: parsed.toString() };
}

export function isDiscordWebhook(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes("discord");
  } catch {
    return false;
  }
}

/**
 * 캠페인 웹훅 알림 발송 (Slack / Discord 인커밍 웹훅).
 * - Slack은 `text`, Discord는 `content`를 본문으로 읽는다. 둘 다 넣어 보낸다.
 * - 타임아웃 5초, 실패해도 호출자 흐름을 중단시키지 않는다.
 */
export async function sendWebhookNotification(
  url: string,
  payload: WebhookPayload
): Promise<WebhookSendResult> {
  const valid = validateWebhookUrl(url || "");
  if (!valid.ok) {
    return { ok: false, error: valid.reason };
  }

  const timestamp = new Date().toISOString();
  const text = `🔔 [${payload.title}] ${payload.message}${payload.campaign_name ? ` (캠페인: ${payload.campaign_name})` : ""}`;
  const body = isDiscordWebhook(valid.url)
    ? { content: text.slice(0, 2000), username: "마케팅 대시보드" }
    : {
        text,
        event: payload.event,
        title: payload.title,
        message: payload.message,
        campaign_id: payload.campaign_id,
        campaign_name: payload.campaign_name,
        data: payload.data,
        timestamp,
      };

  try {
    const res = await fetch(valid.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
