import { describe, it, expect } from "vitest";
import { hasTestDb } from "./test-db";

// DB 를 건드리는 스위트. 테스트 프로젝트(SUPABASE_TEST_*)가 없으면 건너뛴다.
const describeDb = describe.skipIf(!hasTestDb);
import {
  createSnsAccount,
  createSnsContent,
  updateSnsContent,
  saveSnsIntakeResponse,
  getSnsIntakeResponse,
  updateSnsAccountIntakeQuestions,
  createCampaign,
  savePreSurveyResponse,
  getPreSurveyResponse,
  updateCampaignPreSurveyQuestions,
  getAuditLogs,
} from "@/lib/db";

async function 계정() {
  return createSnsAccount({
    company_name: "승인테스트사",
    platform: "instagram",
    handle: "approval_test",
    starts_on: "2026-09-01",
    ends_on: "2026-12-31",
  });
}

/** createSnsContent 는 모든 칸을 요구한다. 이 스위트가 보는 것은 상태 전이라 나머지는 기본값으로 채운다. */
async function 콘텐츠(accountId: string, fields: { title: string; caption?: string | null; hashtags?: string | null }) {
  return createSnsContent({
    account_id: accountId,
    title: fields.title,
    scheduled_on: null,
    assignee: null,
    caption: fields.caption ?? null,
    hashtags: fields.hashtags ?? null,
    media_note: null,
  });
}

/**
 * 광고주 승인은 **그 사람이 본 원고에 대한 것**이다.
 *
 * 전에는 승인이 끝난 뒤 직원이 캡션을 통째로 바꿔도 배지가 "승인완료" 로 남았고, 그대로
 * 게시완료까지 갔다. 광고주가 본 적 없는 글이 "컨펌 완료" 로 남는 셈이라 나중에 책임 문제가 된다.
 */
describeDb("승인 뒤 원고가 바뀌면 승인을 되돌린다", () => {
  it("캡션을 고치면 제작중으로 돌아가고 감사 로그가 따로 남는다", async () => {
    const acc = await 계정();
    const c = await 콘텐츠(acc.id, { title: "제형 릴스", caption: "광고주가 승인한 카피", hashtags: "#앰플" });
    await updateSnsContent(c.id, { status: "approved" });

    const after = await updateSnsContent(c.id, { caption: "몰래 바꾼 카피" });
    expect(after?.status, "승인이 그대로 남으면 안 된다").toBe("producing");

    const logs = await getAuditLogs({ account_id: acc.id });
    const 되돌림 = logs.filter((l) => l.action === "sns_content.approval_revoked");
    expect(되돌림.length, "되돌린 사실이 따로 기록돼야 한다").toBe(1);
    expect(되돌림[0]!.summary).toContain("캡션");
  });

  it("내부 메모만 고치면 승인이 유지된다", async () => {
    // 내부 메모·담당자는 광고주 승인 화면에 나가지 않는다. 바뀌어도 승인이 무효가 될 이유가 없다.
    const acc = await 계정();
    const c = await 콘텐츠(acc.id, { title: "메모만", caption: "원본" });
    await updateSnsContent(c.id, { status: "approved" });

    const after = await updateSnsContent(c.id, { media_note: "4K 원본 컷" });
    expect(after?.status).toBe("approved");
  });

  it("같은 값을 다시 보내면 승인이 유지된다", async () => {
    // 화면이 바뀐 칸만 보내지만, 같은 값을 보내는 경로가 생겨도 승인이 날아가면 안 된다.
    const acc = await 계정();
    const c = await 콘텐츠(acc.id, { title: "동일값", caption: "그대로" });
    await updateSnsContent(c.id, { status: "approved" });

    const after = await updateSnsContent(c.id, { caption: "그대로" });
    expect(after?.status).toBe("approved");
  });

  it("사람이 상태를 직접 지정하면 시스템이 덮어쓰지 않는다", async () => {
    // 승인본을 게시하며 뭔가를 같이 고치는 경우다. 사람이 고른 상태가 이긴다.
    const acc = await 계정();
    const c = await 콘텐츠(acc.id, { title: "게시", caption: "원본" });
    await updateSnsContent(c.id, { status: "approved" });

    const after = await updateSnsContent(c.id, { status: "posted", caption: "막판 오타 수정" });
    expect(after?.status).toBe("posted");
  });
});

/**
 * 문항을 바꾼 뒤 광고주가 재제출하면 옛 답변이 **영구 삭제**됐다.
 *
 * 답변을 지금 문항 목록으로 새로 조립해 통째로 덮어썼기 때문이다. 화면은 재제출 전까지
 * `(삭제된 질문 …)` 으로 보존해 보여주는데, 재제출 한 번이면 그 백업마저 사라졌다.
 */
describeDb("문항을 바꿔도 옛 답변이 남는다", () => {
  it("SNS 사전설문: 문항을 지우고 재제출해도 옛 답변이 보존된다", async () => {
    const acc = await 계정();
    await updateSnsAccountIntakeQuestions(acc.id, [
      { id: "q_keep", question: "유지될 질문", required: false },
      { id: "q_drop", question: "곧 지울 질문", required: false },
    ]);
    await saveSnsIntakeResponse({ account_id: acc.id, answers: { q_keep: "남는 답", q_drop: "사라지면 안 되는 답" } });

    // 담당자가 문항 하나를 지운다.
    await updateSnsAccountIntakeQuestions(acc.id, [{ id: "q_keep", question: "유지될 질문", required: false }]);
    // 광고주가 남은 칸만 고쳐 재제출한다.
    await saveSnsIntakeResponse({ account_id: acc.id, answers: { q_keep: "고친 답" } });

    const saved = (await getSnsIntakeResponse(acc.id))?.answers ?? {};
    expect(saved.q_keep).toBe("고친 답");
    expect(saved.q_drop, "지운 문항의 답변까지 사라지면 안 된다").toBe("사라지면 안 되는 답");
  });

  it("SNS 사전설문: 일부러 비운 칸은 비워진다", async () => {
    // 병합 때문에 "비우기" 가 막히면 안 된다. 빈 값으로 보내면 지워져야 한다.
    const acc = await 계정();
    await updateSnsAccountIntakeQuestions(acc.id, [{ id: "q1", question: "질문", required: false }]);
    await saveSnsIntakeResponse({ account_id: acc.id, answers: { q1: "처음 답" } });
    await saveSnsIntakeResponse({ account_id: acc.id, answers: { q1: "" } });

    const saved = (await getSnsIntakeResponse(acc.id))?.answers ?? {};
    expect(saved.q1).toBeUndefined();
  });

  it("사전조사: 문항을 지우고 재제출해도 옛 답변이 보존된다", async () => {
    // SNS 사전설문과 한 글자 차이인 같은 구조였다. 같이 고쳤으니 같이 고정한다.
    const camp = await createCampaign({
      name: "사전조사 병합 캠페인",
      company_name: "병합사",
      campaign_type: "shipping",
    });
    await updateCampaignPreSurveyQuestions(camp.id, [
      { id: "p_keep", question: "유지될 질문", required: false },
      { id: "p_drop", question: "곧 지울 질문", required: false },
    ]);
    await savePreSurveyResponse({
      campaign_id: camp.id,
      answers: { p_keep: "남는 답", p_drop: "사라지면 안 되는 답" },
      used_ai_assist: false,
    });

    await updateCampaignPreSurveyQuestions(camp.id, [{ id: "p_keep", question: "유지될 질문", required: false }]);
    await savePreSurveyResponse({ campaign_id: camp.id, answers: { p_keep: "고친 답" }, used_ai_assist: false });

    const saved = (await getPreSurveyResponse(camp.id))?.answers ?? {};
    expect(saved.p_keep).toBe("고친 답");
    expect(saved.p_drop, "지운 문항의 답변까지 사라지면 안 된다").toBe("사라지면 안 되는 답");
  });
});
