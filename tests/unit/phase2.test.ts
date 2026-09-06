import { describe, it, expect } from "vitest";
import {
  createCampaign,
  createApplicant,
  updateApplicantStatus,
  updateApplicantAgencyMemo,
  createSnsAccount,
  createSnsContent,
  reviewSnsContent,
  recordAuditLog,
  getAuditLogs,
  updateCampaignWebhookUrl,
  ValidationError,
} from "@/lib/db";
import { sendWebhookNotification } from "@/lib/notifications/webhook";

describe("Phase 2: 감사 로그 (Audit Log)", () => {
  it("recordAuditLog과 getAuditLogs로 캠페인별/계정별 로그를 조회한다", async () => {
    const camp = await createCampaign({
      name: "감사로그테스트",
      company_name: "테스트사",
      campaign_type: "shipping",
    });

    await recordAuditLog({
      campaign_id: camp.id,
      entity_type: "campaign",
      entity_id: camp.id,
      action: "test.action",
      actor_type: "agency",
      summary: "테스트 활동 기록입니다.",
    });

    const logs = await getAuditLogs({ campaign_id: camp.id });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].summary).toBe("테스트 활동 기록입니다.");
    expect(logs[0].actor_type).toBe("agency");
  });

  it("지원자 선정, 메모 변경 시 감사 로그가 자동 생성된다", async () => {
    const camp = await createCampaign({
      name: "자동감사로그캠페인",
      company_name: "테스트",
      campaign_type: "shipping",
    });
    const app = await createApplicant({
      campaign_id: camp.id,
      name: "감사지원자",
      sns_link: "https://instagram.com/audit_test",
      nationality: "대한민국",
      contact: "010-3333-4444",
      shipping_address: "서울시 강남구 테헤란로 1",
      privacy_agreed: true,
      secondary_use_agreed: false,
      custom_answers: {},
    });

    await updateApplicantStatus(app.id, "selected", "company");
    await updateApplicantAgencyMemo(app.id, "통화 완료");

    const logs = await getAuditLogs({ campaign_id: camp.id });
    const summaries = logs.map((l) => l.summary);

    expect(summaries.some((s) => s.includes("광고주가 감사지원자님의 상태를 [최종선정](으)로 변경했습니다."))).toBe(true);
    expect(summaries.some((s) => s.includes("감사지원자님의 에이전시 메모를 수정했습니다."))).toBe(true);
  });

  it("SNS 시안 승인/수정요청 시 감사 로그가 자동 생성된다", async () => {
    const acc = await createSnsAccount({
      company_name: "SNS감사브랜드",
      platform: "instagram",
      handle: "sns_audit",
      starts_on: null,
      ends_on: null,
    });
    const content = await createSnsContent({
      account_id: acc.id,
      title: "감사용 시안",
      scheduled_on: null,
      assignee: null,
      caption: null,
      hashtags: null,
      media_note: null,
    });

    const { updateSnsContent } = await import("@/lib/db");
    await updateSnsContent(content.id, { status: "pending_approval" });
    await reviewSnsContent({
      accountId: acc.id,
      contentId: content.id,
      decision: "approve",
    });

    const logs = await getAuditLogs({ account_id: acc.id });
    expect(logs.some((l) => l.summary.includes("광고주가 [감사용 시안] 시안을 승인했습니다."))).toBe(true);
  });
});

describe("Phase 2: 웹훅 알림 (Webhook)", () => {
  it("updateCampaignWebhookUrl은 URL 유효성을 검증하고 감사 로그를 기록한다", async () => {
    const camp = await createCampaign({
      name: "웹훅테스트캠페인",
      company_name: "테스트",
      campaign_type: "shipping",
    });

    await expect(
      updateCampaignWebhookUrl(camp.id, "invalid-url")
    ).rejects.toBeInstanceOf(ValidationError);

    const updated = await updateCampaignWebhookUrl(
      camp.id,
      "https://hooks.slack.com/services/T00/B00/X00"
    );
    expect(updated?.webhook_url).toBe("https://hooks.slack.com/services/T00/B00/X00");

    const cleared = await updateCampaignWebhookUrl(camp.id, null);
    expect(cleared?.webhook_url).toBeUndefined();
  });

  it("sendWebhookNotification은 잘못된 URL에 대해 안전하게 실패를 반환한다", async () => {
    const res = await sendWebhookNotification("not-a-url", {
      event: "test.ping",
      title: "테스트",
      message: "메시지",
    });
    expect(res.ok).toBe(false);
  });
});
