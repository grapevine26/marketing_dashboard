import { describe, it, expect } from "vitest";
import { hasTestDb } from "./test-db";
// 같은 시각을 **실제로** 만들려면 행을 직접 고쳐야 한다. insertAuditLog 는 created_at 을 받지 않는다.
import { db } from "@/lib/db/client";
import { stripEmojiForPdf, countEmojiForPdf } from "@/lib/reports/pdf";

const describeDb = describe.skipIf(!hasTestDb);
import {
  createCampaign,
  createReport,
  renameReport,
  deleteReport,
  getReportById,
  updateReportCustomSections,
  createSnsAccount,
  createSnsContent,
  saveSnsMediaAttachment,
  reorderSnsMediaAttachments,
  insertAuditLog,
  queryAuditLogs,
} from "@/lib/db";

/**
 * PDF 글꼴(IBM Plex Sans KR)에는 이모지 글리프가 없어 **빈칸으로 나간다.**
 * 그렇다고 기호를 다 지우면 안 된다 — `★ ▶ ■ ✓` 는 한국어 문서 글머리로 흔히 쓰이고
 * 이 글꼴에 있다. 지우면 오히려 문장이 망가진다.
 */
describe("PDF 이모지 걸러내기", () => {
  it("이모지만 지우고 글머리 기호는 남긴다", () => {
    // 지운 자리에 생긴 겹공백은 정리한다 — 안 하면 문장 가운데가 뻥 뚫려 보인다.
    expect(stripEmojiForPdf("성과 🎉 좋았습니다")).toBe("성과 좋았습니다");
    expect(stripEmojiForPdf("★ 핵심 ▶ 요약 ■ 끝 ✓")).toBe("★ 핵심 ▶ 요약 ■ 끝 ✓");
  });

  it("줄바꿈은 건드리지 않는다", () => {
    // 총평은 여러 줄로 쓴다. 공백을 정리한다고 줄까지 합치면 글이 뭉개진다.
    expect(stripEmojiForPdf("첫 줄 🎉\n둘째 줄\n\n넷째 줄")).toBe("첫 줄\n둘째 줄\n\n넷째 줄");
  });

  it("변형 선택자·피부색·ZWJ 조합도 통째로 지운다", () => {
    // `❤️` 는 기호 + U+FE0F 다. 앞 글자만 지우면 보이지 않는 글자가 남는다.
    expect(stripEmojiForPdf("좋아요 ❤️")).not.toContain("️");
    expect(countEmojiForPdf("👍🏽")).toBeGreaterThan(0);
    expect(countEmojiForPdf("👩‍👩‍👦")).toBeGreaterThan(0);
  });

  it("지울 것이 없으면 원문을 그대로 돌려준다", () => {
    // 공백 하나까지 사용자의 것이다. 괜히 손대면 안 된다.
    const 원문 = "  줄 앞뒤 공백과   가운데 공백  ";
    expect(stripEmojiForPdf(원문)).toBe(원문);
    expect(countEmojiForPdf(원문)).toBe(0);
    expect(countEmojiForPdf(null)).toBe(0);
  });
});

describeDb("보고서 제목 변경·삭제", () => {
  async function 보고서() {
    const camp = await createCampaign({ name: "D묶음 캠페인", company_name: "디사", campaign_type: "shipping" });
    return { camp, report: await createReport(camp.id) };
  }

  it("제목을 바꿔도 총평 잠금이 풀리지 않는다", async () => {
    // **이게 이번에서 가장 중요한 성질이다.**
    // 제목은 한 칸짜리 값이라 잠그지 않는 쪽이 자연스러워 보이는데, 그러면 구멍이 생긴다:
    //   A 가 화면을 연다(기준 10:00) → B 가 총평을 저장한다(10:05)
    //   → A 가 제목을 바꾼다(잠금 없으면 통과하고 기준이 앞당겨진다)
    //   → A 가 총평을 저장한다 → 기준이 맞으니 통과 → **B 의 총평이 조용히 사라진다**
    // 제목 변경이 총평 잠금을 푸는 열쇠가 되어서는 안 된다.
    const { report } = await 보고서();
    const 기준 = report.updated_at;

    // B 가 먼저 총평을 저장한다.
    await updateReportCustomSections(report.id, [{ id: "s1", title: "B", content: "B 가 먼저 쓴 총평" }]);

    // A 가 옛 기준으로 제목을 바꾸려 하면 거부되어야 한다.
    await expect(renameReport(report.id, "A 가 바꾼 제목", 기준)).rejects.toThrow(/먼저 저장했습니다/);

    const 지금 = await getReportById(report.id);
    expect(지금?.title, "제목이 바뀌면 안 된다").toBe(report.title);
    expect(지금?.custom_sections[0]?.content).toBe("B 가 먼저 쓴 총평");
  });

  it("최신 기준이면 제목이 바뀌고 기준 시각도 옮겨간다", async () => {
    const { report } = await 보고서();
    const renamed = await renameReport(report.id, "새 제목", report.updated_at);
    expect(renamed?.title).toBe("새 제목");
    // 안 옮기면 바로 뒤의 총평 저장이 자기 자신과 충돌한다.
    expect(renamed!.updated_at).not.toBe(report.updated_at);
  });

  it("삭제는 잠그지 않는다 — 막으면 지울 방법이 없던 문제로 되돌아간다", async () => {
    const { report } = await 보고서();
    await updateReportCustomSections(report.id, [{ id: "s1", title: "T", content: "누군가 고치는 중" }]);
    expect(await deleteReport(report.id)).toBe(true);
    expect(await getReportById(report.id)).toBeNull();
    // 없는 것을 또 지우면 false. 던지지 않는다.
    expect(await deleteReport(report.id)).toBe(false);
  });
});

describeDb("첨부 순서 변경", () => {
  const png = () =>
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);

  it("그 사이 추가된 첨부를 버리지 않고 뒤에 붙인다", async () => {
    // 화면이 배열을 통째로 보내면 그 사이 남이 붙인 첨부가 조용히 사라진다.
    // 그래서 **id 순서만** 받고 서버가 저장된 배열을 재배치한다.
    // 순서는 다시 바꾸면 되지만 사라진 첨부는 되살릴 수 없다.
    const acc = await createSnsAccount({
      company_name: "순서테스트사",
      platform: "instagram",
      handle: "reorder_test",
      starts_on: "2026-09-01",
      ends_on: "2026-12-31",
    });
    const c = await createSnsContent({
      account_id: acc.id,
      title: "순서",
      scheduled_on: null,
      assignee: null,
      caption: null,
      hashtags: null,
      media_note: null,
    });

    const a = await saveSnsMediaAttachment(c.id, { name: "a.png", buffer: png(), mime_type: "image/png", size: 72 });
    const b = await saveSnsMediaAttachment(c.id, { name: "b.png", buffer: png(), mime_type: "image/png", size: 72 });
    const 나중 = await saveSnsMediaAttachment(c.id, { name: "c.png", buffer: png(), mime_type: "image/png", size: 72 });

    // 화면은 a·b 만 알고 있던 상태에서 순서를 뒤집어 보낸다(c 는 그 사이 추가됨).
    const out = await reorderSnsMediaAttachments(c.id, [b.id, a.id]);
    expect(out!.map((m) => m.id)).toEqual([b.id, a.id, 나중.id]);
  });

  it("없는 id 와 중복 id 에도 첨부가 늘거나 줄지 않는다", async () => {
    const acc = await createSnsAccount({
      company_name: "순서테스트사2",
      platform: "instagram",
      handle: "reorder_test2",
      starts_on: "2026-09-01",
      ends_on: "2026-12-31",
    });
    const c = await createSnsContent({
      account_id: acc.id,
      title: "순서2",
      scheduled_on: null,
      assignee: null,
      caption: null,
      hashtags: null,
      media_note: null,
    });
    const a = await saveSnsMediaAttachment(c.id, { name: "a.png", buffer: png(), mime_type: "image/png", size: 72 });
    const b = await saveSnsMediaAttachment(c.id, { name: "b.png", buffer: png(), mime_type: "image/png", size: 72 });

    const out = await reorderSnsMediaAttachments(c.id, [b.id, b.id, "없는-id", a.id]);
    expect(out!.map((m) => m.id)).toEqual([b.id, a.id]);
  });
});

describeDb("활동 기록 커서 넘기기", () => {
  it("새 기록이 끼어들어도 중복이나 누락이 없다", async () => {
    // 전에는 화면에 쌓인 개수를 offset 으로 넘겼다. 그 사이 새 로그가 맨 위에 끼면 창이 밀려
    // **이미 본 행이 다시 붙고** 밀려난 만큼은 그 세션에서 다시 못 봤다.
    const camp = await createCampaign({ name: "커서 캠페인", company_name: "커서사", campaign_type: "shipping" });
    const 남기기 = (n: string) =>
      insertAuditLog({
        campaign_id: camp.id,
        entity_type: "campaign",
        entity_id: camp.id,
        action: "test.cursor",
        actor_type: "agency",
        summary: n,
      });

    for (const n of ["1", "2", "3", "4", "5", "6"]) await 남기기(n);

    const 첫쪽 = await queryAuditLogs({ campaign_id: camp.id, limit: 3 });
    expect(첫쪽.rows.length).toBe(3);
    expect(첫쪽.nextCursor).not.toBeNull();

    // 첫 쪽을 본 뒤 새 기록이 끼어든다. 이게 옛 방식이 무너지던 자리다.
    await 남기기("새로 들어온 것");

    const 둘째쪽 = await queryAuditLogs({ campaign_id: camp.id, limit: 3, cursor: 첫쪽.nextCursor! });
    const 첫쪽ids = new Set(첫쪽.rows.map((r) => r.id));
    const 겹침 = 둘째쪽.rows.filter((r) => 첫쪽ids.has(r.id));
    expect(겹침, `이미 본 기록이 다시 나왔다: ${겹침.map((r) => r.summary).join(", ")}`).toEqual([]);

    // 두 쪽을 이어 붙이면 끊긴 곳이 없어야 한다(새로 들어온 것은 첫 쪽보다 위라 안 나온다).
    const 이어붙임 = [...첫쪽.rows, ...둘째쪽.rows].map((r) => r.summary);
    expect(이어붙임).toEqual(["6", "5", "4", "3", "2", "1"]);
  });

  it("같은 시각에 남은 기록도 빠짐없이 넘어간다", async () => {
    // `created_at` 이 같으면 정렬이 비결정적이라 커서가 헛돈다. id 로 동점을 고정한다.
    // 한 요청이 로그 여러 줄을 남기면 실제로 같은 밀리초에 몰린다.
    const camp = await createCampaign({ name: "동점 캠페인", company_name: "동점사", campaign_type: "shipping" });
    for (const n of ["A", "B", "C", "D"]) {
      await insertAuditLog({
        campaign_id: camp.id,
        entity_type: "campaign",
        entity_id: camp.id,
        action: "test.tie",
        actor_type: "agency",
        summary: n,
      });
    }
    // 넣을 때는 시각을 정할 수 없으므로(insertAuditLog 가 안 받는다) 넣은 뒤 같게 맞춘다.
    // 이렇게 해야 "한 요청이 로그 여러 줄을 남기는" 실제 상황과 같아진다.
    //
    // **기준 시각을 로컬 시계에서 만들면 안 된다.** 이 표의 created_at 은 DB 가 찍는데,
    // 앱 기계와 DB 시계는 몇 초씩 어긋난다. `new Date()` 로 잡으면 campaign.created 보다
    // 이전이 되어 정렬이 뒤집히고, 테스트가 구현이 아니라 시계 차이를 재게 된다(실제로 그랬다).
    // 그래서 DB 에 이미 있는 값에서 만든다.
    const 지금값 = await db()
      .from("audit_logs")
      .select("created_at")
      .eq("campaign_id", camp.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string }>();
    const 가장최신 = 지금값.data?.created_at;
    expect(가장최신, "로그를 넣지 못하면 이 테스트는 의미가 없다").toBeTruthy();
    const 같은시각 = new Date(Date.parse(가장최신!) + 1000).toISOString();

    const { error } = await db()
      .from("audit_logs")
      .update({ created_at: 같은시각 })
      .eq("action", "test.tie")
      .eq("campaign_id", camp.id);
    expect(error, `같은 시각으로 맞추지 못하면 이 테스트는 의미가 없다: ${error?.message}`).toBeNull();

    const 쪽1 = await queryAuditLogs({ campaign_id: camp.id, limit: 2 });
    const 쪽2 = await queryAuditLogs({ campaign_id: camp.id, limit: 2, cursor: 쪽1.nextCursor! });
    const 전부 = [...쪽1.rows, ...쪽2.rows].map((r) => r.summary).sort();
    const 진단 = JSON.stringify({
      쪽1: 쪽1.rows.map((r) => [r.summary, r.id]),
      커서: 쪽1.nextCursor,
      쪽2: 쪽2.rows.map((r) => [r.summary, r.id]),
    });
    expect(전부, 진단).toEqual(["A", "B", "C", "D"]);
  });
});
