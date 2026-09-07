import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { validateWebhookUrl, isDiscordWebhook, sendWebhookNotification } from "@/lib/notifications/webhook";
import { matchesMediaSignature, createCampaign, updateCampaignWebhookUrl, getBackupDirPath, listBackups, ValidationError } from "@/lib/db";
import { toPublicCampaign, sanitizeApplicantForCompany, Campaign, Applicant } from "@/lib/db/types";

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

  it("DB 저장 시에도 같은 검증을 거친다", async () => {
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

describe("DB 백업", () => {
  it("저장할 때 backups/ 에 복사본이 생긴다", async () => {
    await createCampaign({ name: "b1", company_name: "b", campaign_type: "shipping" });
    await createCampaign({ name: "b2", company_name: "b", campaign_type: "shipping" });
    const dir = getBackupDirPath();
    expect(fs.existsSync(dir)).toBe(true);
    const backups = await listBackups();
    expect(backups.length).toBeGreaterThanOrEqual(1);
    expect(backups[0].file).toMatch(/^db-\d{8}-\d{6}\.json$/);
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, backups[0].file), "utf-8"));
    expect(Array.isArray(parsed.campaigns)).toBe(true);
  });
});
