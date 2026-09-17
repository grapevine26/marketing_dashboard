import { describe, it, expect } from "vitest";
import { hasTestDb } from "./test-db";

// DB 를 건드리는 스위트. 테스트 프로젝트(SUPABASE_TEST_*)가 없으면 건너뛴다.
const describeDb = describe.skipIf(!hasTestDb);
import {
  getCampaigns,
  getApplicantsByCampaignId,
  countApplicantsByCampaign,
  countEventInvitees,
  updateEventInvitee,
  getFormConfig,
  getEventsByCampaignId,
  getEventInvitees,
  getSnsAccounts,
  getSnsContentsByAccountId,
  getSnsPlan,
  getSnsIntakeResponse,
  getPptTemplates,
  createCampaign,
  createApplicant,
  updateApplicantStatus,
  getSeedingRecordsByCampaignId,
  updateSeedingRecord,
  createReport,
  updateReportCustomSections,
  getReportById,
  buildReportSnapshot,
  createSnsAccount,
  createSnsContent,
  updateSnsContent,
  reviewSnsContent,
  saveSnsIntakeResponse,
  saveFormConfig,
  createEvent,
  addDirectEventInvitee,
  getCampaignById,
  deleteCampaign,
  deleteSnsAccount,
  updateCampaignMessageTemplates,
  updateApplicantAgencyMemo,
  getPreSurveyQuestionsForCampaign,
  updateCampaignPreSurveyQuestions,
  getSnsIntakeQuestionsForAccount,
  updateSnsAccountIntakeQuestions,
  getPreSurveyTemplate,
  getSnsIntakeTemplate,
  updatePreSurveyTemplate,
  updateSnsIntakeTemplate,
  getAuditLogs,
  ValidationError,
} from "@/lib/db";
import { OPTIMISTIC_LOCK_CONFLICT_MESSAGE } from "@/lib/db/optimistic-lock";

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

describeDb("행사별 초대 명단 수", () => {
  it("한 번의 조회로 행사마다 초청·참석확정·입장 수를 센다", async () => {
    const { camp } = await seedCampaign();
    const ev = await createEvent({ campaign_id: camp.id, name: "런칭 파티", event_at: null, venue: null, memo: null });

    const a = await addDirectEventInvitee({ event_id: ev.id, name: "가", sns_url: null, contact: null, memo: null });
    const b = await addDirectEventInvitee({ event_id: ev.id, name: "나", sns_url: null, contact: null, memo: null });
    await addDirectEventInvitee({ event_id: ev.id, name: "다", sns_url: null, contact: null, memo: null });

    // 둘은 참석하겠다고 했고, 그중 하나만 실제로 입장했다.
    await updateEventInvitee(a.id, { rsvp_status: "attending" });
    await updateEventInvitee(b.id, { rsvp_status: "attending" });
    await updateEventInvitee(a.id, { attended: true });

    const counts = await countEventInvitees();
    expect(counts.get(ev.id)).toEqual({ total: 3, attending: 2, attended: 1 });
  });

  it("초청자가 없는 행사는 아예 담기지 않는다", async () => {
    const { camp } = await seedCampaign();
    const ev = await createEvent({ campaign_id: camp.id, name: "빈 행사", event_at: null, venue: null, memo: null });
    const counts = await countEventInvitees();
    expect(counts.has(ev.id)).toBe(false);
  });
});

describeDb("캠페인별 지원자 수", () => {
  it("한 번의 조회로 캠페인마다 전체·최종선정 수를 센다", async () => {
    const a = await seedCampaign();
    const b = await seedCampaign();
    // b 쪽에만 한 명 더 넣고 그 중 하나를 최종선정한다.
    await createApplicant({
      campaign_id: b.camp.id,
      name: "김서연",
      sns_link: "https://instagram.com/seoyeon",
      nationality: "대한민국",
      contact: "010-3333-4444",
      shipping_address: "부산시",
      privacy_agreed: true,
      secondary_use_agreed: false,
      custom_answers: {},
    });
    await updateApplicantStatus(b.app.id, "selected", "agency");

    const counts = await countApplicantsByCampaign();
    expect(counts.get(a.camp.id)).toEqual({ total: 1, selected: 0 });
    expect(counts.get(b.camp.id)).toEqual({ total: 2, selected: 1 });
  });

  it("지원자가 없는 캠페인은 아예 담기지 않는다", async () => {
    // 읽는 쪽이 0 으로 다루면 된다. 없는 것과 0 을 구분할 일이 없어서 넣지 않는다.
    const camp = await createCampaign({ name: "빈 캠페인", company_name: "브랜드", campaign_type: "visit" });
    const counts = await countApplicantsByCampaign();
    expect(counts.has(camp.id)).toBe(false);
  });
});

describeDb("Supabase DB", () => {
  it("첫 조회에 캠페인이 없고 내장 템플릿 3개가 있다", async () => {
    expect(await getCampaigns()).toHaveLength(0);
    const builtin = (await getPptTemplates()).filter((t) => t.builtin);
    expect(builtin).toHaveLength(3);
    expect(builtin.map((t) => t.kind).sort()).toEqual(["event", "report", "sns"]);
    expect(builtin.every((t) => !t.file_data)).toBe(true);
  });

  it("동시 생성 10건이 모두 저장된다", async () => {
    await Promise.all(
      Array.from({ length: 10 }).map((_, i) =>
        createCampaign({ name: `동시 ${i}`, company_name: "b", campaign_type: "shipping" })
      )
    );
    const all = await getCampaigns();
    expect(all.filter((c) => c.name.startsWith("동시 "))).toHaveLength(10);
  });
});

describeDb("지원자 선정", () => {
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
    await updateSeedingRecord(rec!.id, { progress_stage: "발송완료", views: 100 });
    await updateApplicantStatus(app.id, "applied", "agency");
    const after = await getSeedingRecordsByCampaignId(camp.id);
    expect(after).toHaveLength(1);
    expect(after[0]!.progress_stage).toBe("발송완료");
    await updateApplicantStatus(app.id, "selected", "agency");
    expect(await getSeedingRecordsByCampaignId(camp.id)).toHaveLength(1);
  });

  it("관리시트 수치는 음수/소수를 거부한다", async () => {
    const { camp, app } = await seedCampaign();
    await updateApplicantStatus(app.id, "selected", "agency");
    const [rec] = await getSeedingRecordsByCampaignId(camp.id);
    await expect(updateSeedingRecord(rec!.id, { views: -1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSeedingRecord(rec!.id, { upload_link: "not a url" })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSeedingRecord(rec!.id, { upload_deadline: "2026/09/01" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describeDb("신청폼 서버 검증", () => {
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

describeDb("결과보고서 스냅샷", () => {
  it("createReport가 snapshot_data와 metrics를 채운다", async () => {
    const { camp, app } = await seedCampaign();
    await updateApplicantStatus(app.id, "selected", "agency");
    const [rec] = await getSeedingRecordsByCampaignId(camp.id);
    await updateSeedingRecord(rec!.id, { progress_stage: "업로드완료", upload_link: "https://instagram.com/p/1", views: 1000, engagement: 50 });

    const report = await createReport(camp.id);
    expect(report.snapshot_data).toBeDefined();
    expect(report.generated_at).toBeTruthy();
    const m = report.snapshot_data!.metrics;
    expect(m).toMatchObject({ totalApplicants: 1, selectedCount: 1, completedUploads: 1, totalViews: 1000, totalEngagement: 50, avgEngagementRate: 5 });
    expect(report.snapshot_data!.applicants[0]!.seeding?.upload_link).toBe("https://instagram.com/p/1");
  });

  it("총평도 남의 저장을 덮어쓰지 않는다", async () => {
    // 총평은 **문서 전체를 통째로 덮어쓴다.** 이 표만 잠금이 없어서, 탭 두 개로 열어 놓고
    // 차례로 저장하면 뒤에 저장한 쪽이 앞사람이 쓴 것을 경고 없이 지웠다.
    const { camp } = await seedCampaign();
    const report = await createReport(camp.id);

    // A 가 화면을 열고 기준 시각을 쥔다.
    const 기준 = report.updated_at;

    // B 가 먼저 저장한다.
    const b = await updateReportCustomSections(report.id, [{ id: "sec_b", title: "B", content: "B 가 먼저 쓴 총평" }]);
    expect(b?.custom_sections[0]?.content).toBe("B 가 먼저 쓴 총평");

    // A 가 옛 기준으로 저장하면 거부된다.
    await expect(
      updateReportCustomSections(report.id, [{ id: "sec_a", title: "A", content: "A 가 나중에 쓴 총평" }], 기준)
    ).rejects.toThrow(/먼저 저장했습니다/);

    // B 의 글이 그대로 살아 있어야 한다.
    const 지금 = await getReportById(report.id);
    expect(지금?.custom_sections[0]?.content).toBe("B 가 먼저 쓴 총평");

    // 최신 기준으로 다시 저장하면 통과한다(= 화면이 빠져나올 수 있다).
    const 재시도 = await updateReportCustomSections(
      report.id,
      [{ id: "sec_a", title: "A", content: "A 가 나중에 쓴 총평" }],
      지금!.updated_at
    );
    expect(재시도?.custom_sections[0]?.content).toBe("A 가 나중에 쓴 총평");
    // 저장 성공이면 기준 시각도 옮겨져야 한다. 안 그러면 연달아 저장할 때 자기 자신과 충돌한다.
    expect(재시도!.updated_at).not.toBe(지금!.updated_at);
  });

  it("buildReportSnapshot은 순수 함수다", () => {
    const camp = { id: "c", name: "n", company_name: "b", campaign_type: "shipping", status: "recruiting", pre_survey_token: "", apply_form_token: "", applicants_share_token: "", seeding_sheet_share_token: "", created_at: "" } as const;
    const snap = buildReportSnapshot(camp, [], []);
    expect(snap.metrics.totalApplicants).toBe(0);
    expect(snap.metrics.avgEngagementRate).toBe(0);
  });
});

describeDb("SNS 승인", () => {
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
    const tmpl = await getSnsIntakeTemplate();
    const answers = Object.fromEntries(tmpl.questions.map((q) => [q.id, "답"]));
    const r = await saveSnsIntakeResponse({ account_id: acc.id, answers });
    expect(r.account_id).toBe(acc.id);
  });
});

describeDb("행사", () => {
  it("행사명/초대자 이름 필수, 날짜 형식 검증", async () => {
    const camp = await createCampaign({ name: "c", company_name: "b", campaign_type: "shipping" });
    await expect(createEvent({ campaign_id: camp.id, name: "  ", event_at: null, venue: null, memo: null })).rejects.toBeInstanceOf(ValidationError);
    await expect(createEvent({ campaign_id: camp.id, name: "e", event_at: "not-a-date", venue: null, memo: null })).rejects.toBeInstanceOf(ValidationError);
    const ev = await createEvent({ campaign_id: camp.id, name: "e", event_at: "2026-09-15T09:00:00.000Z", venue: null, memo: null });
    expect(ev.event_at).toBe("2026-09-15T09:00:00.000Z");
    await expect(addDirectEventInvitee({ event_id: ev.id, name: "", sns_url: null, contact: null, memo: null })).rejects.toBeInstanceOf(ValidationError);
    await expect(addDirectEventInvitee({ event_id: ev.id, name: "x", sns_url: "javascript:alert(1)", contact: null, memo: null })).rejects.toBeInstanceOf(ValidationError);
  });
});

describeDb("Phase 1: 캠페인/SNS 삭제 및 메모/템플릿", () => {
  it("deleteCampaign은 캠페인 및 지원자, 관리시트, 폼설정, 행사를 연쇄 삭제한다", async () => {
    const { camp, app } = await seedCampaign();
    await updateApplicantStatus(app.id, "selected", "agency");
    const ev = await createEvent({ campaign_id: camp.id, name: "팝업", event_at: null, venue: null, memo: null });
    await addDirectEventInvitee({ event_id: ev.id, name: "초대자", sns_url: null, contact: null, memo: null });

    expect(await getCampaignById(camp.id)).not.toBeNull();
    expect(await getApplicantsByCampaignId(camp.id)).toHaveLength(1);
    expect(await getSeedingRecordsByCampaignId(camp.id)).toHaveLength(1);
    expect(await getEventsByCampaignId(camp.id)).toHaveLength(1);

    const deleted = await deleteCampaign(camp.id);
    expect(deleted).toBe(true);

    expect(await getCampaignById(camp.id)).toBeNull();
    expect(await getApplicantsByCampaignId(camp.id)).toHaveLength(0);
    expect(await getSeedingRecordsByCampaignId(camp.id)).toHaveLength(0);
    expect(await getFormConfig(camp.id)).toBeNull();
    expect(await getEventsByCampaignId(camp.id)).toHaveLength(0);
    expect(await getEventInvitees(ev.id)).toHaveLength(0);
  });

  it("deleteSnsAccount는 SNS 계정과 콘텐츠, 기획안, 사전설문 응답을 연쇄 삭제한다", async () => {
    const acc = await createSnsAccount({
      company_name: "삭제테스트브랜드",
      platform: "instagram",
      handle: "delete_test",
      starts_on: null,
      ends_on: null,
    });
    await createSnsContent({
      account_id: acc.id,
      title: "콘텐츠 1",
      scheduled_on: null,
      assignee: null,
      caption: null,
      hashtags: null,
      media_note: null,
    });

    expect((await getSnsAccounts()).some((a) => a.id === acc.id)).toBe(true);
    expect(await getSnsContentsByAccountId(acc.id)).toHaveLength(1);
    expect(await getSnsPlan(acc.id)).not.toBeNull();

    const deleted = await deleteSnsAccount(acc.id);
    expect(deleted).toBe(true);

    expect((await getSnsAccounts()).some((a) => a.id === acc.id)).toBe(false);
    expect(await getSnsContentsByAccountId(acc.id)).toHaveLength(0);
    expect(await getSnsPlan(acc.id)).toBeNull();
    expect(await getSnsIntakeResponse(acc.id)).toBeNull();
  });

  it("updateCampaignMessageTemplates는 템플릿 문구를 저장하고 갱신한다", async () => {
    const { camp } = await seedCampaign();
    const tmpls = {
      selected: "축하합니다 {{이름}}님!",
      guideline: "가이드라인입니다: {{가이드링크}}",
    };
    const updated = await updateCampaignMessageTemplates(camp.id, tmpls);
    expect(updated?.message_templates?.selected).toBe("축하합니다 {{이름}}님!");
    expect(updated?.message_templates?.guideline).toBe("가이드라인입니다: {{가이드링크}}");

    const fetched = await getCampaignById(camp.id);
    expect(fetched?.message_templates?.selected).toBe("축하합니다 {{이름}}님!");
  });

  it("updateApplicantAgencyMemo는 에이전시 관리 메모를 저장하고 수정한다", async () => {
    const { app } = await seedCampaign();
    const updated = await updateApplicantAgencyMemo(app.id, "중요 인플루언서: 협의 완료");
    expect(updated?.agency_memo).toBe("중요 인플루언서: 협의 완료");

    const cleared = await updateApplicantAgencyMemo(app.id, null);
    expect(cleared?.agency_memo).toBeUndefined();
  });

  it("캠페인별 사전조사 문항을 개별 설정 및 공통 템플릿으로 리셋할 수 있다", async () => {
    const { camp } = await seedCampaign();
    const globalTmpl = await getPreSurveyTemplate();

    // 설정 전에는 공통 템플릿 문항을 반환한다
    const defaultQs = await getPreSurveyQuestionsForCampaign(camp.id);
    expect(defaultQs).toEqual(globalTmpl.questions);

    // 캠페인별 맞춤 문항 설정
    const customQs = [
      { id: "custom-1", question: "특별 요청 질문", placeholder: "내용 입력", type: "textarea", required: true },
      { id: "custom-2", question: "추가 문의", placeholder: undefined, type: undefined, required: false },
    ];
    const updatedCamp = await updateCampaignPreSurveyQuestions(camp.id, customQs);
    expect(updatedCamp?.pre_survey_questions).toEqual(customQs);

    const fetchedQs = await getPreSurveyQuestionsForCampaign(camp.id);
    expect(fetchedQs).toEqual(customQs);

    // null 로 리셋하면 다시 공통 템플릿 문항으로 돌아간다
    const resetCamp = await updateCampaignPreSurveyQuestions(camp.id, null);
    expect(resetCamp?.pre_survey_questions).toBeUndefined();

    const afterResetQs = await getPreSurveyQuestionsForCampaign(camp.id);
    expect(afterResetQs).toEqual(globalTmpl.questions);
  });

  it("SNS 계정별 사전설문 문항을 개별 설정 및 공통 템플릿으로 리셋할 수 있다", async () => {
    const acc = await createSnsAccount({
      company_name: "맞춤설문브랜드",
      handle: "custom_survey_brand",
      platform: "instagram",
      starts_on: null,
      ends_on: null,
    });
    const globalSnsTmpl = await getSnsIntakeTemplate();

    // 설정 전에는 공통 템플릿 문항을 반환한다
    const defaultQs = await getSnsIntakeQuestionsForAccount(acc.id);
    expect(defaultQs).toEqual(globalSnsTmpl.questions);

    // 계정별 맞춤 문항 설정
    const customQs = [
      { id: "sns-q1", question: "인스타그램 릴스 톤앤매너", placeholder: "참고 계정 등", required: true },
    ];
    const updatedAcc = await updateSnsAccountIntakeQuestions(acc.id, customQs);
    expect(updatedAcc?.intake_questions).toEqual(customQs);

    const fetchedQs = await getSnsIntakeQuestionsForAccount(acc.id);
    expect(fetchedQs).toEqual(customQs);

    // null 로 리셋하면 다시 공통 템플릿 문항으로 돌아간다
    const resetAcc = await updateSnsAccountIntakeQuestions(acc.id, null);
    expect(resetAcc?.intake_questions).toBeUndefined();

    const afterResetQs = await getSnsIntakeQuestionsForAccount(acc.id);
    expect(afterResetQs).toEqual(globalSnsTmpl.questions);
  });
});

describeDb("공용 질문 템플릿 동시 저장", () => {
  it("불러올 때 받은 기준 시각을 그대로 보내면 공용 질문 템플릿이 저장된다", async () => {
    // 행이 아직 없어도 읽는 순간 기본 질문으로 행을 만들고 그 행의 저장 시각을 함께 돌려준다.
    // 이게 비어 있으면 낙관적 잠금이 "행은 있는데 기준 시각이 없다" 로 보고 첫 저장부터 막는다.
    const opened = await getPreSurveyTemplate();
    expect(opened.updated_at).toBeTruthy();

    const saved = await updatePreSurveyTemplate(
      [{ id: "q1", question: "핵심 소구점은 무엇인가요?", placeholder: "예시", type: "textarea", required: true }],
      opened.updated_at
    );
    expect(saved.questions.map((q) => q.question)).toEqual(["핵심 소구점은 무엇인가요?"]);
    // 저장하면 기준 시각이 새로 바뀐다. 화면은 이 값을 들고 다음 저장을 한다.
    expect(saved.updated_at).not.toBe(opened.updated_at);

    const reloaded = await getPreSurveyTemplate();
    expect(reloaded.questions.map((q) => q.question)).toEqual(["핵심 소구점은 무엇인가요?"]);
    expect(reloaded.updated_at).toBe(saved.updated_at);

    // 새 기준 시각으로 이어서 저장하는 것도 된다(새로고침 없이 연속 저장).
    const again = await updatePreSurveyTemplate(
      [{ id: "q1", question: "두 번째 저장", placeholder: "", type: "textarea", required: true }],
      saved.updated_at
    );
    expect(again.questions.map((q) => q.question)).toEqual(["두 번째 저장"]);

    // SNS 사전설문 템플릿도 같은 방식으로 저장된다.
    const snsOpened = await getSnsIntakeTemplate();
    expect(snsOpened.updated_at).toBeTruthy();
    const snsSaved = await updateSnsIntakeTemplate(
      [{ id: "sq1", question: "브랜드 톤앤매너는 어떤가요?", placeholder: "예시", required: true }],
      snsOpened.updated_at
    );
    expect(snsSaved.questions.map((q) => q.question)).toEqual(["브랜드 톤앤매너는 어떤가요?"]);
    expect((await getSnsIntakeTemplate()).updated_at).toBe(snsSaved.updated_at);
  }, 30_000);

  it("남이 먼저 저장한 뒤에 저장하면 거부되고 앞사람 문항이 그대로 남는다", async () => {
    // 두 사람이 같은 설정 화면을 열었다. 둘 다 이 시각을 들고 있다.
    const opened = await getPreSurveyTemplate();

    const first = await updatePreSurveyTemplate(
      [{ id: "q1", question: "앞사람 문항", placeholder: "", type: "textarea", required: true }],
      opened.updated_at
    );
    expect(first.questions.map((q) => q.question)).toEqual(["앞사람 문항"]);

    // 뒤늦게 저장하는 사람은 낡은 시각을 들고 있어 거부된다.
    await expect(
      updatePreSurveyTemplate(
        [{ id: "q1", question: "뒷사람 문항", placeholder: "", type: "textarea", required: true }],
        opened.updated_at
      )
    ).rejects.toThrow(OPTIMISTIC_LOCK_CONFLICT_MESSAGE);

    // 기준 시각을 아예 안 보내도 거부한다. 행이 이미 있는데 기준이 없다는 건
    // 그 사이 누군가 처음 저장했다는 뜻이라 덮어쓰면 안 된다.
    await expect(
      updatePreSurveyTemplate([
        { id: "q1", question: "기준 없이", placeholder: "", type: "textarea", required: true },
      ])
    ).rejects.toThrow(OPTIMISTIC_LOCK_CONFLICT_MESSAGE);

    // DB 에는 앞사람 문항이 그대로다.
    const now = await getPreSurveyTemplate();
    expect(now.questions.map((q) => q.question)).toEqual(["앞사람 문항"]);
    expect(now.updated_at).toBe(first.updated_at);

    // 거부된 저장은 감사 로그를 남기지 않는다. 성공한 한 번만 기록되어 있어야 한다.
    const preSurveyLogs = (await getAuditLogs({ entity_types: ["campaign"], limit: 100 })).filter(
      (l) => l.action === "pre_survey_template.saved"
    );
    expect(preSurveyLogs).toHaveLength(1);

    // SNS 사전설문 템플릿도 같은 방식으로 막힌다.
    const snsOpened = await getSnsIntakeTemplate();
    const snsFirst = await updateSnsIntakeTemplate(
      [{ id: "sq1", question: "앞사람 SNS 문항", placeholder: "", required: true }],
      snsOpened.updated_at
    );
    await expect(
      updateSnsIntakeTemplate(
        [{ id: "sq1", question: "뒷사람 SNS 문항", placeholder: "", required: true }],
        snsOpened.updated_at
      )
    ).rejects.toThrow(OPTIMISTIC_LOCK_CONFLICT_MESSAGE);

    const snsNow = await getSnsIntakeTemplate();
    expect(snsNow.questions.map((q) => q.question)).toEqual(["앞사람 SNS 문항"]);
    expect(snsNow.updated_at).toBe(snsFirst.updated_at);

    const snsLogs = (await getAuditLogs({ entity_types: ["sns_account"], limit: 100 })).filter(
      (l) => l.action === "sns_intake_template.saved"
    );
    expect(snsLogs).toHaveLength(1);
  }, 30_000);
});

describeDb("동시 편집에서 남의 수정이 살아남는가", () => {
  it("안내문 템플릿은 보낸 종류만 바꾸고 나머지는 그대로 둔다", async () => {
    const { camp } = await seedCampaign();

    // A 가 최종선정 문구를, B 가 미선정 문구를 각각 저장한다.
    await updateCampaignMessageTemplates(camp.id, { selected: "A 가 쓴 최종선정 문구" });
    await updateCampaignMessageTemplates(camp.id, { rejected: "B 가 쓴 미선정 문구" });

    const after = await getCampaignById(camp.id);
    // 전에는 통째로 덮어써서 B 의 저장이 A 의 문구를 지웠다.
    expect(after?.message_templates?.selected).toBe("A 가 쓴 최종선정 문구");
    expect(after?.message_templates?.rejected).toBe("B 가 쓴 미선정 문구");
  });

  it("콘텐츠 수정은 보낸 칸만 바꾼다", async () => {
    const acc = await createSnsAccount({
      company_name: "브랜드",
      platform: "instagram",
      handle: "brand",
      starts_on: null,
      ends_on: null,
    });
    const content = await createSnsContent({
      account_id: acc.id,
      title: "원본 제목",
      scheduled_on: null,
      assignee: null,
      caption: "원본 캡션",
      hashtags: null,
      media_note: null,
    });

    // B 가 캡션을 바꾼다.
    await updateSnsContent(content.id, { caption: "B 가 쓴 카피" });
    // A 는 제목만 고쳐 보낸다(화면이 달라진 칸만 보내므로 caption 은 들어 있지 않다).
    await updateSnsContent(content.id, { title: "A 가 고친 제목" });

    const after = await getSnsContentsByAccountId(acc.id);
    const row = after.find((c) => c.id === content.id);
    expect(row?.title).toBe("A 가 고친 제목");
    // 화면이 caption 까지 함께 보내던 때에는 여기가 "원본 캡션" 으로 되돌아갔다.
    expect(row?.caption).toBe("B 가 쓴 카피");
  });
});

describeDb("같은 칸을 둘이 고칠 때", () => {
  async function 콘텐츠하나() {
    const acc = await createSnsAccount({
      company_name: "브랜드",
      platform: "instagram",
      handle: `brand_${Date.now()}`,
      starts_on: null,
      ends_on: null,
    });
    return createSnsContent({
      account_id: acc.id,
      title: "원본 제목",
      scheduled_on: null,
      assignee: null,
      caption: "원본 캡션",
      hashtags: null,
      media_note: null,
    });
  }

  it("내가 불러온 뒤 남이 저장했으면 덮어쓰지 않고 거부한다", async () => {
    const content = await 콘텐츠하나();
    // A 가 편집을 연다. 이때의 기준 시각을 들고 있는다.
    const A가본기준 = content.updated_at;

    // B 가 같은 칸을 고쳐 저장한다.
    await updateSnsContent(content.id, { caption: "B 가 쓴 카피" });

    // A 가 자기 캡션을 저장하려 한다 → 거부되어야 한다.
    await expect(
      updateSnsContent(content.id, { caption: "A 가 쓴 카피", expected_updated_at: A가본기준 })
    ).rejects.toThrow(/먼저 저장했습니다/);

    // 거부됐으니 B 의 글이 그대로 남아 있어야 한다.
    const after = (await getSnsContentsByAccountId(content.account_id)).find((c) => c.id === content.id);
    expect(after?.caption).toBe("B 가 쓴 카피");
  });

  it("아무도 안 건드렸으면 그대로 저장된다", async () => {
    const content = await 콘텐츠하나();
    const saved = await updateSnsContent(content.id, {
      caption: "A 가 쓴 카피",
      expected_updated_at: content.updated_at,
    });
    expect(saved?.caption).toBe("A 가 쓴 카피");
    // 저장하면 기준 시각이 새로 찍힌다(DB 트리거). 안 바뀌면 다음 저장이 충돌을 못 잡는다.
    expect(new Date(saved!.updated_at).getTime()).toBeGreaterThan(new Date(content.updated_at).getTime());
  });

  it("기준 시각을 안 보내면 잠그지 않는다", async () => {
    // 상태 드롭다운처럼 한 칸만 바꾸는 조작은 덮어쓸 남의 글이 없다.
    const content = await 콘텐츠하나();
    await updateSnsContent(content.id, { caption: "남이 먼저" });
    const saved = await updateSnsContent(content.id, { title: "기준 시각 없이" });
    expect(saved?.title).toBe("기준 시각 없이");
    expect(saved?.caption).toBe("남이 먼저");
  });
});
