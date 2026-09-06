import { describe, it, expect } from "vitest";
import {
  readDb,
  createCampaign,
  createApplicant,
  updateApplicantStatus,
  getSeedingRecordsByCampaignId,
  updateSeedingRecord,
  createReport,
  buildReportSnapshot,
  createSnsAccount,
  createSnsContent,
  updateSnsContent,
  reviewSnsContent,
  saveSnsIntakeResponse,
  saveFormConfig,
  createEvent,
  addDirectEventInvitee,
  ValidationError,
  mutateDb,
} from "@/lib/db";

async function seedCampaign() {
  const camp = await createCampaign({ name: "테스트 캠페인", company_name: "브랜드", campaign_type: "shipping" });
  const app = await createApplicant({
    campaign_id: camp.id,
    name: "홍길동",
    sns_link: "https://instagram.com/hong",
    nationality: "대한민국",
    contact: "010-1111-2222",
    shipping_address: "서울시",
    privacy_agreed: true,
    secondary_use_agreed: false,
    custom_answers: {},
  });
  return { camp, app };
}

describe("JSON DB", () => {
  it("초기 데이터가 샘플 캠페인과 내장 템플릿(파일 없이)을 갖는다", async () => {
    const db = await readDb();
    expect(db.campaigns.length).toBeGreaterThan(0);
    const builtin = db.ppt_templates.filter((t) => t.builtin);
    expect(builtin).toHaveLength(2);
    expect(builtin.every((t) => !t.file_data)).toBe(true);
  });

  it("쓰기는 직렬화되어 동시 요청이 유실되지 않는다", async () => {
    await Promise.all(
      Array.from({ length: 10 }).map((_, i) =>
        createCampaign({ name: `동시 ${i}`, company_name: "b", campaign_type: "shipping" })
      )
    );
    const db = await readDb();
    expect(db.campaigns.filter((c) => c.name.startsWith("동시 "))).toHaveLength(10);
  });
});

describe("지원자 선정", () => {
  it("selected가 되면 seeding_records가 생기고 상태 변경 주체/시각이 기록된다", async () => {
    const { camp, app } = await seedCampaign();
    const r = await updateApplicantStatus(app.id, "selected", "company");
    expect(r?.changed).toBe(true);
    expect(r?.applicant.status_changed_by).toBe("company");
    expect(r?.applicant.status_changed_at).toBeTruthy();
    expect(await getSeedingRecordsByCampaignId(camp.id)).toHaveLength(1);
  });

  it("같은 상태로 다시 바꾸면 멱등하다", async () => {
    const { app } = await seedCampaign();
    await updateApplicantStatus(app.id, "selected", "agency");
    const r = await updateApplicantStatus(app.id, "selected", "agency");
    expect(r?.changed).toBe(false);
  });

  it("선정 취소 시 seeding_records는 삭제되지 않는다", async () => {
    const { camp, app } = await seedCampaign();
    await updateApplicantStatus(app.id, "selected", "agency");
    const [rec] = await getSeedingRecordsByCampaignId(camp.id);
    await updateSeedingRecord(rec.id, { progress_stage: "발송완료", views: 100 });
    await updateApplicantStatus(app.id, "applied", "agency");
    const after = await getSeedingRecordsByCampaignId(camp.id);
    expect(after).toHaveLength(1);
    expect(after[0].progress_stage).toBe("발송완료");
    await updateApplicantStatus(app.id, "selected", "agency");
    expect(await getSeedingRecordsByCampaignId(camp.id)).toHaveLength(1);
  });

  it("관리시트 수치는 음수/소수를 거부한다", async () => {
    const { camp, app } = await seedCampaign();
    await updateApplicantStatus(app.id, "selected", "agency");
    const [rec] = await getSeedingRecordsByCampaignId(camp.id);
    await expect(updateSeedingRecord(rec.id, { views: -1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSeedingRecord(rec.id, { upload_link: "not a url" })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSeedingRecord(rec.id, { upload_deadline: "2026/09/01" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("신청폼 서버 검증", () => {
  it("개인정보 미동의, 필수값 누락, 접수 중단 상태를 거부한다", async () => {
    const camp = await createCampaign({ name: "c", company_name: "b", campaign_type: "visit" });
    const base = {
      campaign_id: camp.id,
      name: "a",
      sns_link: "https://x.com/a",
      nationality: "KR",
      contact: "010",
      visit_schedule: "9/10",
      secondary_use_agreed: false,
      custom_answers: {},
    };
    await expect(createApplicant({ ...base, privacy_agreed: false })).rejects.toThrow("개인정보");
    await expect(createApplicant({ ...base, privacy_agreed: true, visit_schedule: "" })).rejects.toThrow("방문 희망 일정");

    await saveFormConfig({
      campaign_id: camp.id,
      intro_text: "",
      custom_questions: [{ id: "q1", label: "피부타입", type: "select", required: true, options: ["건성", "지성"] }],
      is_published: true,
    });
    await expect(createApplicant({ ...base, privacy_agreed: true })).rejects.toThrow("피부타입");
    await expect(createApplicant({ ...base, privacy_agreed: true, custom_answers: { q1: "복합성" } })).rejects.toThrow("선택지");
    const ok = await createApplicant({ ...base, privacy_agreed: true, custom_answers: { q1: "건성" } });
    expect(ok.custom_answers?.q1).toBe("건성");

    await saveFormConfig({ campaign_id: camp.id, intro_text: "", custom_questions: [], is_published: false });
    await expect(createApplicant({ ...base, privacy_agreed: true })).rejects.toThrow("마감");
  });
});

describe("결과보고서 스냅샷", () => {
  it("createReport가 snapshot_data와 metrics를 채운다", async () => {
    const { camp, app } = await seedCampaign();
    await updateApplicantStatus(app.id, "selected", "agency");
    const [rec] = await getSeedingRecordsByCampaignId(camp.id);
    await updateSeedingRecord(rec.id, { progress_stage: "업로드완료", upload_link: "https://instagram.com/p/1", views: 1000, engagement: 50 });

    const report = await createReport(camp.id);
    expect(report.snapshot_data).toBeDefined();
    expect(report.generated_at).toBeTruthy();
    const m = report.snapshot_data!.metrics;
    expect(m).toMatchObject({ totalApplicants: 1, selectedCount: 1, completedUploads: 1, totalViews: 1000, totalEngagement: 50, avgEngagementRate: 5 });
    expect(report.snapshot_data!.applicants[0].seeding?.upload_link).toBe("https://instagram.com/p/1");
  });

  it("buildReportSnapshot은 순수 함수다", () => {
    const camp = { id: "c", name: "n", company_name: "b", campaign_type: "shipping", status: "recruiting", pre_survey_token: "", apply_form_token: "", applicants_share_token: "", seeding_sheet_share_token: "", created_at: "" } as const;
    const snap = buildReportSnapshot(camp, [], []);
    expect(snap.metrics.totalApplicants).toBe(0);
    expect(snap.metrics.avgEngagementRate).toBe(0);
  });
});

describe("SNS 승인", () => {
  async function seedSns() {
    const acc = await createSnsAccount({ company_name: "브랜드", platform: "instagram", handle: "brand", starts_on: null, ends_on: null });
    const content = await createSnsContent({ account_id: acc.id, title: "릴스", scheduled_on: null, assignee: null, caption: "c", hashtags: null, media_note: "내부메모" });
    return { acc, content };
  }

  it("승인대기 상태에서만 처리되고 이후 호출은 멱등하다", async () => {
    const { acc, content } = await seedSns();
    // planning 상태: 변화 없음
    const r0 = await reviewSnsContent({ accountId: acc.id, contentId: content.id, decision: "approve" });
    expect(r0.changed).toBe(false);
    expect(r0.content.status).toBe("planning");

    await updateSnsContent(content.id, { status: "pending_approval" });
    const r1 = await reviewSnsContent({ accountId: acc.id, contentId: content.id, decision: "request_changes", comment: "문구 수정" });
    expect(r1.changed).toBe(true);
    expect(r1.content.status).toBe("producing");
    expect(r1.content.client_comment).toBe("문구 수정");

    // producing 상태에서 승인 시도 → 무시
    const r2 = await reviewSnsContent({ accountId: acc.id, contentId: content.id, decision: "approve" });
    expect(r2.changed).toBe(false);
    expect(r2.content.status).toBe("producing");
  });

  it("다른 계정의 콘텐츠는 처리할 수 없다", async () => {
    const { content } = await seedSns();
    const other = await createSnsAccount({ company_name: "다른", platform: "youtube", handle: "o", starts_on: null, ends_on: null });
    await updateSnsContent(content.id, { status: "pending_approval" });
    await expect(reviewSnsContent({ accountId: other.id, contentId: content.id, decision: "approve" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("성과 수치는 게시완료에서만, 0 이상 정수만 허용한다", async () => {
    const { content } = await seedSns();
    await expect(updateSnsContent(content.id, { view_count: 10 })).rejects.toThrow("게시완료");
    await updateSnsContent(content.id, { status: "posted" });
    await expect(updateSnsContent(content.id, { view_count: -5 })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSnsContent(content.id, { status: "wrong" as never })).rejects.toBeInstanceOf(ValidationError);
    const ok = await updateSnsContent(content.id, { view_count: 120, like_count: 3, comment_count: 0 });
    expect(ok?.view_count).toBe(120);
  });

  it("사전설문은 필수 질문을 검증한다", async () => {
    const acc = await createSnsAccount({ company_name: "브랜드", platform: "instagram", handle: "b", starts_on: null, ends_on: null });
    await expect(saveSnsIntakeResponse({ account_id: acc.id, answers: {} })).rejects.toBeInstanceOf(ValidationError);
    const db = await readDb();
    const answers = Object.fromEntries(db.sns_intake_template.questions.map((q) => [q.id, "답"]));
    const r = await saveSnsIntakeResponse({ account_id: acc.id, answers });
    expect(r.account_id).toBe(acc.id);
  });
});

describe("행사", () => {
  it("행사명/초대자 이름 필수, 날짜 형식 검증", async () => {
    const camp = await createCampaign({ name: "c", company_name: "b", campaign_type: "shipping" });
    await expect(createEvent({ campaign_id: camp.id, name: "  ", event_at: null, venue: null, memo: null })).rejects.toBeInstanceOf(ValidationError);
    await expect(createEvent({ campaign_id: camp.id, name: "e", event_at: "not-a-date", venue: null, memo: null })).rejects.toBeInstanceOf(ValidationError);
    const ev = await createEvent({ campaign_id: camp.id, name: "e", event_at: "2026-09-15T09:00:00.000Z", venue: null, memo: null });
    expect(ev.event_at).toBe("2026-09-15T09:00:00.000Z");
    await expect(addDirectEventInvitee({ event_id: ev.id, name: "", sns_url: null, contact: null, memo: null })).rejects.toBeInstanceOf(ValidationError);
    await expect(addDirectEventInvitee({ event_id: ev.id, name: "x", sns_url: "javascript:alert(1)", contact: null, memo: null })).rejects.toBeInstanceOf(ValidationError);
  });

  it("mutateDb 안에서 던진 에러는 파일을 오염시키지 않는다", async () => {
    const before = (await readDb()).campaigns.length;
    await expect(
      mutateDb((db) => {
        db.campaigns.push({} as never);
        throw new ValidationError("중단");
      })
    ).rejects.toThrow("중단");
    // 캐시 객체가 변이되었을 수 있으므로 파일에서 다시 읽는다
    (globalThis as unknown as { _marketingDbCache?: unknown })._marketingDbCache = undefined;
    expect((await readDb()).campaigns.length).toBe(before);
  });
});
