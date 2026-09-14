import { describe, it, expect } from "vitest";
import { hasTestDb } from "./test-db";
import { withActor } from "@/lib/auth/context";
import type { SessionUser } from "@/lib/auth/session";

/**
 * 감사 로그가 "누가 무엇을 했는지" 를 남기는지 본다.
 *
 * 행위자 이름은 DB 함수에 인자로 넘기지 않는다. 액션이 요청 컨텍스트에 담아두고
 * insertAuditLog 가 꺼내 쓴다. 그 연결이 실제로 도는지가 이 파일의 핵심이다.
 */
const actor: SessionUser = {
  id: "00000000-0000-4000-8000-00000000000a",
  username: "tester",
  display_name: "테스트 담당자",
  role: "admin",
  status: "active",
};

describe.skipIf(!hasTestDb)("감사 로그", () => {
  it("로그인한 사용자의 이름이 자동으로 들어간다", async () => {
    const { createCampaign, getAuditLogs } = await import("@/lib/db");

    const camp = await withActor(actor, () =>
      createCampaign({ name: "로그 검증", company_name: "브랜드", campaign_type: "shipping" })
    );

    const logs = await getAuditLogs({ campaign_id: camp.id });
    const created = logs.find((l) => l.action === "campaign.created");
    expect(created).toBeDefined();
    expect(created!.actor_name).toBe("테스트 담당자");
    expect(created!.summary).toContain("로그 검증");
  });

  it("로그인 없이 부르면 이름 없이 남는다", async () => {
    const { createCampaign, getAuditLogs } = await import("@/lib/db");

    // 공개 라우트(지원폼 등)가 부르는 상황. 컨텍스트가 비어 있다.
    const camp = await createCampaign({ name: "무명 검증", company_name: "브랜드", campaign_type: "shipping" });

    const created = (await getAuditLogs({ campaign_id: camp.id })).find((l) => l.action === "campaign.created");
    expect(created).toBeDefined();
    expect(created!.actor_name).toBeNull();
  });

  it("동시에 들어온 요청끼리 행위자가 섞이지 않는다", async () => {
    const { createCampaign, getAuditLogs } = await import("@/lib/db");
    const other: SessionUser = { ...actor, id: "00000000-0000-4000-8000-00000000000b", display_name: "다른 담당자" };

    const [a, b] = await Promise.all([
      withActor(actor, () => createCampaign({ name: "갑 캠페인", company_name: "브랜드", campaign_type: "shipping" })),
      withActor(other, () => createCampaign({ name: "을 캠페인", company_name: "브랜드", campaign_type: "visit" })),
    ]);

    const logA = (await getAuditLogs({ campaign_id: a.id })).find((l) => l.action === "campaign.created");
    const logB = (await getAuditLogs({ campaign_id: b.id })).find((l) => l.action === "campaign.created");
    expect(logA!.actor_name).toBe("테스트 담당자");
    expect(logB!.actor_name).toBe("다른 담당자");
  });

  it("캠페인 상태를 바꾸면 무엇으로 바뀌었는지 남는다", async () => {
    const { createCampaign, updateCampaign, getAuditLogs } = await import("@/lib/db");

    const camp = await withActor(actor, () =>
      createCampaign({ name: "상태 검증", company_name: "브랜드", campaign_type: "shipping" })
    );
    await withActor(actor, () => updateCampaign(camp.id, { status: "seeding" }));

    const entry = (await getAuditLogs({ campaign_id: camp.id })).find((l) => l.action === "campaign.status_changed");
    expect(entry).toBeDefined();
    expect(entry!.summary).toContain("시딩 진행중");
    expect(entry!.details).toMatchObject({ previous: "recruiting", next: "seeding" });
  });

  it("이름만 바꾸면 상태 변경으로 기록되지 않는다", async () => {
    const { createCampaign, updateCampaign, getAuditLogs } = await import("@/lib/db");

    const camp = await withActor(actor, () =>
      createCampaign({ name: "이름 검증", company_name: "브랜드", campaign_type: "shipping" })
    );
    await withActor(actor, () => updateCampaign(camp.id, { name: "바뀐 이름" }));

    const logs = await getAuditLogs({ campaign_id: camp.id });
    expect(logs.some((l) => l.action === "campaign.status_changed")).toBe(false);
    expect(logs.some((l) => l.action === "campaign.updated")).toBe(true);
  });

  it("광고주가 공개 링크로 하는 일은 company 로 남는다", async () => {
    const { createCampaign, savePreSurveyResponse, getPreSurveyQuestionsForCampaign, getAuditLogs } =
      await import("@/lib/db");

    const camp = await withActor(actor, () =>
      createCampaign({ name: "사전조사 검증", company_name: "브랜드", campaign_type: "shipping" })
    );
    const questions = await getPreSurveyQuestionsForCampaign(camp.id);
    const answers = Object.fromEntries(questions.map((q) => [q.id, "답변"]));
    await savePreSurveyResponse({ campaign_id: camp.id, answers, used_ai_assist: true });

    const entry = (await getAuditLogs({ campaign_id: camp.id })).find((l) => l.action === "pre_survey.submitted");
    expect(entry).toBeDefined();
    expect(entry!.actor_type).toBe("company");
    expect(entry!.summary).toContain("AI 추천");
  });

  it("PPT 템플릿을 올리고 지우면 각각 남는다", async () => {
    const { savePptTemplate, deletePptTemplate, getAuditLogs } = await import("@/lib/db");
    const pptx = Buffer.alloc(2048, 0x41);
    pptx.write("PK", 0, "latin1");

    const t = await withActor(actor, () =>
      savePptTemplate({ kind: "event", name: "검증 양식", file_buffer: pptx, placeholders: [] })
    );
    await withActor(actor, () => deletePptTemplate(t.id));

    const logs = await getAuditLogs({ limit: 50 });
    const uploaded = logs.find((l) => l.action === "ppt_template.uploaded");
    const deleted = logs.find((l) => l.action === "ppt_template.deleted");
    expect(uploaded?.actor_name).toBe("테스트 담당자");
    expect(uploaded?.summary).toContain("검증 양식");
    expect(deleted?.summary).toContain("검증 양식");
  });
});
