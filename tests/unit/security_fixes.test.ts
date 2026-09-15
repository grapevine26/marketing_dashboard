import { describe, it, expect, vi } from "vitest";

// 서버 액션은 저장 뒤 화면 캐시를 비우는데, 그건 요청 안에서만 되는 일이라 테스트에서는 터진다.
// 우리가 확인하려는 것은 캐시가 아니라 "끝난 캠페인이면 막히는가" 이므로 이 부분만 비워 둔다.
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
import { validateWebhookUrl, isDiscordWebhook, sendWebhookNotification } from "@/lib/notifications/webhook";
import { matchesMediaSignature, createCampaign, updateCampaignWebhookUrl, ValidationError } from "@/lib/db";
import { hasTestDb } from "./test-db";
import {
  toPublicCampaign,
  sanitizeApplicantForCompany,
  sanitizeSeedingForCompany,
  Campaign,
  Applicant,
  SeedingRecord,
} from "@/lib/db/types";

describe("웹훅 URL 검증 (SSRF 방지)", () => {
  it("허용 호스트의 https 만 통과한다", () => {
    expect(validateWebhookUrl("https://hooks.slack.com/services/T1/B1/xxx").ok).toBe(true);
    expect(validateWebhookUrl("https://discord.com/api/webhooks/123/abc").ok).toBe(true);
    expect(validateWebhookUrl("http://hooks.slack.com/services/T1/B1/xxx").ok).toBe(false);
    expect(validateWebhookUrl("https://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(validateWebhookUrl("https://example.com/hook").ok).toBe(false);
    expect(validateWebhookUrl("not a url").ok).toBe(false);
    expect(validateWebhookUrl("https://discord.com/other").ok).toBe(false);
  });

  it("Discord 웹훅을 구분한다", () => {
    expect(isDiscordWebhook("https://discord.com/api/webhooks/1/a")).toBe(true);
    expect(isDiscordWebhook("https://hooks.slack.com/services/a")).toBe(false);
  });

  it("sendWebhookNotification 은 허용되지 않은 주소로 요청을 보내지 않는다", async () => {
    const r = await sendWebhookNotification("https://internal.corp/hook", { event: "test.ping", title: "t", message: "m" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("지원하지 않는");
  });

  it.skipIf(!hasTestDb)("DB 저장 시에도 같은 검증을 거친다", async () => {
    const camp = await createCampaign({ name: "wh", company_name: "b", campaign_type: "shipping" });
    await expect(updateCampaignWebhookUrl(camp.id, "http://localhost:3000/x")).rejects.toBeInstanceOf(ValidationError);
    const ok = await updateCampaignWebhookUrl(camp.id, "https://hooks.slack.com/services/T/B/C");
    expect(ok?.webhook_url).toBe("https://hooks.slack.com/services/T/B/C");
  });
});

describe("공개 DTO", () => {
  it("PublicCampaign 에는 토큰·웹훅·템플릿이 없다", () => {
    const c = {
      id: "c", name: "n", company_name: "b", campaign_type: "shipping", status: "recruiting",
      pre_survey_token: "ps", apply_form_token: "ap", applicants_share_token: "as", seeding_sheet_share_token: "ss",
      webhook_url: "https://hooks.slack.com/services/SECRET", message_templates: { selected: "내부" }, created_at: "",
    } as Campaign;
    const pub = toPublicCampaign(c) as unknown as Record<string, unknown>;
    for (const k of ["webhook_url", "message_templates", "pre_survey_token", "apply_form_token", "applicants_share_token", "seeding_sheet_share_token"]) {
      expect(pub).not.toHaveProperty(k);
    }
  });

  it("sanitizeApplicantForCompany 는 연락처·주소·내부 메모를 비운다", () => {
    const a = { id: "a", campaign_id: "c", name: "n", sns_link: "https://x", nationality: "KR", contact: "010", shipping_address: "addr", agency_memo: "비밀", follower_count: 100, privacy_agreed: true, secondary_use_agreed: false, status: "applied", status_changed_by: "agency", applied_at: "" } as Applicant;
    const s = sanitizeApplicantForCompany(a);
    expect(s.contact).toBe("");
    expect(s.shipping_address).toBeUndefined();
    expect(s.agency_memo).toBeUndefined();
    expect(s.follower_count).toBe(100);
  });
});

describe("미디어 시그니처", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
  it("실제 내용과 MIME 이 맞아야 한다", () => {
    expect(matchesMediaSignature(png, "image/png")).toBe(true);
    expect(matchesMediaSignature(png, "image/jpeg")).toBe(false);
    expect(matchesMediaSignature(Buffer.from("MZ not an image at all"), "image/png")).toBe(false);
    expect(matchesMediaSignature(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]), "image/jpeg")).toBe(true);
    expect(matchesMediaSignature(Buffer.concat([Buffer.from("\0\0\0\x18ftypmp42", "latin1"), Buffer.alloc(16)]), "video/mp4")).toBe(true);
  });
});

describe("광고주 공유 관리시트에서 지우는 값", () => {
  /** 관리시트 한 줄의 시딩 기록. 배송지와 방문 일정은 지원자 쪽과 **별도로** 여기에도 있다. */
  const record: SeedingRecord = {
    id: "s1",
    campaign_id: "c1",
    applicant_id: "a1",
    progress_stage: "선정완료",
    upload_deadline: "2026-10-01",
    upload_link: "https://example.com/post",
    views: 1234,
    engagement: 56,
    notes: "택배 분실 이력 있음. 재발송 필요",
    shipping_address: "서울시 강남구 테헤란로 1길 2, 301호",
    visit_scheduled_at: "2026-10-05T10:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-02T00:00:00.000Z",
  };

  it("배송지·방문 일정·내부 비고를 비운다", () => {
    const clean = sanitizeSeedingForCompany(record);
    expect(clean.shipping_address).toBeUndefined();
    expect(clean.visit_scheduled_at).toBeUndefined();
    expect(clean.notes).toBeNull();

    // 직렬화했을 때 어디에도 원문이 남지 않아야 한다.
    // 화면에 안 그려도 서버가 내려보내면 페이지 안에 값이 실린다.
    const serialized = JSON.stringify(clean);
    expect(serialized).not.toContain("테헤란로");
    expect(serialized).not.toContain("택배 분실");
    expect(serialized).not.toContain("2026-10-05");
  });

  it("광고주가 봐야 하는 값은 그대로 둔다", () => {
    const clean = sanitizeSeedingForCompany(record);
    expect(clean.progress_stage).toBe("선정완료");
    expect(clean.upload_deadline).toBe("2026-10-01");
    expect(clean.upload_link).toBe("https://example.com/post");
    expect(clean.views).toBe(1234);
    expect(clean.engagement).toBe(56);
  });

  it("지원자와 시딩 기록 둘 다 씻어야 주소가 사라진다", () => {
    // 한쪽만 씻으면 다른 쪽에 그대로 남는다. 실제로 그 상태로 배포돼 있었다.
    const applicant = {
      id: "a1",
      campaign_id: "c1",
      name: "홍길동",
      contact: "010-1234-5678",
      sns_link: "https://instagram.com/x",
      status: "selected",
      applied_at: "2026-09-01T00:00:00.000Z",
      shipping_address: "서울시 강남구 테헤란로 1길 2, 301호",
    } as unknown as Applicant;

    const onlyApplicant = JSON.stringify({ applicant: sanitizeApplicantForCompany(applicant), seeding: record });
    expect(onlyApplicant).toContain("테헤란로");

    const both = JSON.stringify({
      applicant: sanitizeApplicantForCompany(applicant),
      seeding: sanitizeSeedingForCompany(record),
    });
    expect(both).not.toContain("테헤란로");
    expect(both).not.toContain("010-1234-5678");
  });
});

describe.skipIf(!hasTestDb)("끝난 캠페인·계약의 공개 링크", () => {
  it("캠페인을 종료하면 공유 링크로 더 이상 고칠 수 없다", async () => {
    const { createCampaign, updateCampaign } = await import("@/lib/db/campaigns");
    const { submitApplicantAction } = await import("@/app/apply/[token]/actions");

    const campaign = await createCampaign({
      name: "종료 확인용",
      company_name: "브랜드",
      campaign_type: "shipping",
    });

    const apply = {
      token: campaign.apply_form_token,
      name: "홍길동",
      nationality: "대한민국",
      contact: "010-1111-2222",
      sns_link: "https://instagram.com/probe",
      shipping_address: "서울시 1",
      privacy_agreed: true,
      secondary_use_agreed: false,
      custom_answers: {},
    };

    // 진행 중에는 지원이 된다.
    const before = await submitApplicantAction(apply);
    expect(before.ok).toBe(true);

    await updateCampaign(campaign.id, { status: "completed" });

    // 끝나면 같은 링크로 더 이상 받지 않는다. 링크는 살아 있지만 대상이 닫혔다.
    const after = await submitApplicantAction({ ...apply, sns_link: "https://instagram.com/probe2" });
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.error).toMatch(/종료된 캠페인/);
  }, 30_000);

  it("계약이 끝난 SNS 계정은 광고주가 시안을 승인할 수 없다", async () => {
    const { createSnsAccount, updateSnsAccount, createSnsContent } = await import("@/lib/db/sns");
    const { reviewSnsContentByTokenAction } = await import("@/app/sns-approval/[token]/actions");

    const account = await createSnsAccount({
      company_name: "브랜드",
      platform: "instagram",
      handle: "brand",
      starts_on: null,
      ends_on: null,
    });
    const content = await createSnsContent({
      account_id: account.id,
      title: "9월 1주차",
      scheduled_on: null,
      assignee: null,
      caption: null,
      hashtags: null,
      media_note: null,
    });
    await updateSnsAccount(account.id, { status: "ended" });

    const res = await reviewSnsContentByTokenAction({
      token: account.approval_token,
      contentId: content.id,
      decision: "approve",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/종료된 계약/);
  }, 30_000);
});

describe("공개 경로 목록", () => {
  it("내보내기는 열려 있지만 토큰이 없으면 라우트가 막는다", async () => {
    const { readFileSync } = await import("node:fs");

    // 광고주가 공유 화면에서 누르는 버튼이라 프록시는 열어야 한다.
    const proxy = readFileSync("proxy.ts", "utf8");
    expect(proxy).toContain('"/api/applicants/export"');
    expect(proxy).toContain('"/api/seeding-sheet/export"');

    // 열어둔 대신 라우트가 직접 막아야 한다. 둘 중 하나만 있으면 구멍이 된다.
    for (const p of ["app/api/applicants/export/route.ts", "app/api/seeding-sheet/export/route.ts"]) {
      const src = readFileSync(p, "utf8");
      expect(src).toContain("if (!token)");
      expect(src).toContain("requireApiUser()");
      // 토큰 모드에서는 개인정보를 씻는다.
      expect(src).toContain("sanitizeApplicantForCompany");
    }

    // 관리시트는 시딩 기록도 씻어야 한다. 배송지가 양쪽에 있다.
    const seeding = readFileSync("app/api/seeding-sheet/export/route.ts", "utf8");
    expect(seeding).toContain("sanitizeSeedingForCompany");
  });
});
