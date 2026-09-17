import type { EventChecklistItem, EventInvitee, EventRsvpStatus, SnsContent } from "@/lib/db/types";
import { SNS_CONTENT_STATUS_LABELS } from "@/lib/db/types";
import type { ChartSpec, FillOptions, TableSpec } from "./engine";
import { CHART_PREFIX, TABLE_PREFIX } from "./markers";

/**
 * 카탈로그(`catalog.ts`)에 적힌 표·차트를 **실제 데이터로** 만든다.
 *
 * 결과보고서 것은 `lib/reports/pptx.ts` 에 있다. 스냅샷에서만 만들어지고 그 파일의 다른
 * 코드와 얽혀 있어서다. 여기 있는 것은 행사와 SNS — 둘 다 **지금 값**을 그대로 쓴다.
 *
 * 값이 없으면 빈 표를 돌려준다. 엔진이 "표시할 데이터가 없습니다." 로 바꿔 그린다.
 * 여기서 문구를 만들지 않는다 — 두 곳에서 만들면 언젠가 다른 말이 나온다.
 */

/**
 * RSVP 라벨.
 *
 * 화면(`EventDetailClient`)의 드롭다운은 "미응답 (대기)", "참석 확정 ✓" 처럼 **조작을 돕는
 * 장식**이 붙어 있다. 문서에 그대로 넣으면 광고주가 읽는 표에 체크 표시와 괄호가 나간다.
 * 그래서 문서용은 여기서 따로 둔다. 뜻이 갈린 것이 아니라 쓰임이 다른 것이다.
 */
const RSVP_LABEL: Record<EventRsvpStatus, string> = {
  pending: "미응답",
  attending: "참석",
  not_attending: "불참",
};

/** 행사 운영안에 넣을 수 있는 표. */
export function buildEventExtras(
  invitees: EventInvitee[],
  checklist: EventChecklistItem[]
): FillOptions {
  return {
    tables: {
      [`${TABLE_PREFIX}초청명단`]: buildInviteeTable(invitees),
      [`${TABLE_PREFIX}체크리스트`]: buildChecklistTable(checklist),
    },
  };
}

/**
 * 초청명단 표.
 *
 * **연락처를 넣지 않는다.** 이 PPT 는 담당자가 받아서 광고주에게 보내는 물건이고,
 * 이 앱은 광고주에게 나가는 모든 경로에서 연락처를 비운다(`sanitizeApplicantForCompany`).
 * 문서라고 예외를 두면 그 경계가 여기 한 곳에서 새고, 보낸 뒤에는 되돌릴 수 없다.
 */
export function buildInviteeTable(invitees: EventInvitee[]): TableSpec {
  return {
    headers: ["이름", "SNS 계정", "RSVP", "당일 참석"],
    colWeights: [1.8, 3.4, 1.2, 1.2],
    rows: invitees.map((i) => [
      i.name,
      i.sns_url || "-",
      RSVP_LABEL[i.rsvp_status],
      i.attended ? "참석" : "-",
    ]),
    overflowLabel: (hidden) => `외 ${hidden}명`,
  };
}

/** 준비 체크리스트 표. 화면과 같은 순서(sort_order)로 둔다. */
export function buildChecklistTable(items: EventChecklistItem[]): TableSpec {
  return {
    headers: ["준비 항목", "담당자", "마감일", "완료"],
    colWeights: [3.6, 1.6, 1.6, 1.0],
    rows: items.map((i) => [
      i.label,
      i.assignee || "-",
      i.due_date || "-",
      i.done ? "완료" : "-",
    ]),
    overflowLabel: (hidden) => `외 ${hidden}건`,
  };
}

/** SNS 제안서에 넣을 수 있는 표와 차트. */
export function buildSnsExtras(contents: SnsContent[]): FillOptions {
  return {
    tables: { [`${TABLE_PREFIX}콘텐츠`]: buildContentTable(contents) },
    charts: { [`${CHART_PREFIX}월별성과`]: buildMonthlyChart(contents) },
  };
}

/** 콘텐츠 캘린더 표. 발행 예정일 순. 날짜가 없는 것은 뒤로 민다. */
export function buildContentTable(contents: SnsContent[]): TableSpec {
  const sorted = [...contents].sort((a, b) =>
    (a.scheduled_on || "9999-99-99").localeCompare(b.scheduled_on || "9999-99-99")
  );
  return {
    headers: ["발행 예정일", "제목", "상태", "담당자"],
    colWeights: [1.6, 4.0, 1.3, 1.4],
    rows: sorted.map((c) => [
      c.scheduled_on || "미정",
      c.title,
      SNS_CONTENT_STATUS_LABELS[c.status],
      c.assignee || "-",
    ]),
    overflowLabel: (hidden) => `외 ${hidden}건`,
  };
}

/**
 * 월별 게시 건수·조회수 차트.
 *
 * **기준은 `scheduled_on`(발행 예정일)이다.** 계정 화면의 월별 성과와 같은 기준이어야 한다 —
 * 같은 달을 두고 화면과 문서가 다른 숫자를 말하면 어느 쪽이 맞는지 아무도 모른다.
 * 게시완료만 세는 것도 화면과 같다.
 */
export function buildMonthlyChart(contents: SnsContent[]): ChartSpec {
  const byMonth = new Map<string, { count: number; views: number }>();
  for (const c of contents) {
    if (c.status !== "posted") continue;
    const month = (c.scheduled_on || "").slice(0, 7); // YYYY-MM
    if (month.length !== 7) continue; // 예정일이 없으면 어느 달인지 알 수 없다. 세지 않는다.
    const cur = byMonth.get(month) ?? { count: 0, views: 0 };
    cur.count += 1;
    cur.views += c.view_count || 0;
    byMonth.set(month, cur);
  }
  const months = [...byMonth.keys()].sort();
  return {
    type: "bar",
    categories: months,
    series: [
      { name: "게시 건수", values: months.map((m) => byMonth.get(m)!.count) },
      { name: "조회수", values: months.map((m) => byMonth.get(m)!.views) },
    ],
    colors: ["2563EB", "F59E0B"],
  };
}
