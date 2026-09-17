import { describe, it, expect } from "vitest";
import { PPT_CATALOG, catalogFor } from "@/lib/ppt/catalog";
import { CHART_PREFIX, TABLE_PREFIX } from "@/lib/ppt/markers";
import * as engine from "@/lib/ppt/engine";
import { buildEventExtras, buildInviteeTable, buildMonthlyChart, buildSnsExtras } from "@/lib/ppt/extras";
import { buildReportExtras } from "@/lib/reports/pptx";
import type { EventChecklistItem, EventInvitee, ReportSnapshot, SnsContent } from "@/lib/db/types";
import type { FillOptions } from "@/lib/ppt/engine";

/**
 * 표·차트는 **이름이 정해져 있어야** 동작한다. 그 이름이 사는 곳이 셋이다 —
 * 담당자가 보는 목록(`catalog.ts`), 실제로 데이터를 만드는 곳(`extras.ts`·`reports/pptx.ts`),
 * 그리고 담당자가 pptx 에 적은 글자.
 *
 * 앞의 둘이 어긋나면 **조용히 실패한다.** 화면에는 있는데 안 채워지거나(빈 상자로 나간다),
 * 채워지는데 아무도 이름을 몰라 못 쓴다. 둘 다 오류가 안 뜨므로 여기서 묶어 둔다.
 */

const 빈행사 = { invitees: [] as EventInvitee[], checklist: [] as EventChecklistItem[] };
const 빈스냅샷 = { applicants: [] } as unknown as ReportSnapshot;

/** 한 종류의 "실제로 채워지는 이름" 전부. */
function 채워지는이름(opts: FillOptions): string[] {
  return [...Object.keys(opts.tables ?? {}), ...Object.keys(opts.charts ?? {})].sort();
}

/** 카탈로그가 광고하는 이름 전부 (마커에서 `{{ }}` 를 벗긴 것). */
function 광고하는이름(kind: "event" | "sns" | "report"): string[] {
  return catalogFor(kind)
    .map((e) => e.marker.replace(/^\{\{|\}\}$/g, ""))
    .sort();
}

describe("카탈로그와 실제 데이터가 어긋나지 않는가", () => {
  it("행사: 목록에 적힌 것이 전부 채워진다", () => {
    expect(채워지는이름(buildEventExtras(빈행사.invitees, 빈행사.checklist))).toEqual(광고하는이름("event"));
  });

  it("SNS: 목록에 적힌 것이 전부 채워진다", () => {
    expect(채워지는이름(buildSnsExtras([]))).toEqual(광고하는이름("sns"));
  });

  it("보고서: 목록에 적힌 것이 전부 채워진다", () => {
    expect(채워지는이름(buildReportExtras(빈스냅샷))).toEqual(광고하는이름("report"));
  });

  it("마커 접두사가 엔진이 찾는 것과 같다", () => {
    // markers.ts 로 떼어 놓았다(클라이언트 번들에 JSZip 이 딸려가지 않게). 값이 갈리면
    // 카탈로그가 알려준 이름을 엔진이 못 알아본다.
    expect(TABLE_PREFIX).toBe(engine.TABLE_PREFIX);
    expect(CHART_PREFIX).toBe(engine.CHART_PREFIX);
  });

  it("모든 항목이 표 또는 차트 접두사로 시작한다", () => {
    for (const [kind, entries] of Object.entries(PPT_CATALOG)) {
      for (const e of entries) {
        const name = e.marker.replace(/^\{\{|\}\}$/g, "");
        expect(name.startsWith(TABLE_PREFIX) || name.startsWith(CHART_PREFIX), `${kind}: ${e.marker}`).toBe(true);
        // 접두사가 shape 와 맞아야 화면의 아이콘이 거짓말을 하지 않는다.
        expect(name.startsWith(TABLE_PREFIX)).toBe(e.shape === "table");
        expect(e.columns.length, `${e.marker} 에 설명이 없다`).toBeGreaterThan(0);
      }
    }
  });
});

describe("문서로 나가면 안 되는 값", () => {
  it("초청명단 표에 연락처가 들어가지 않는다", () => {
    // 이 PPT 는 담당자가 받아 **광고주에게 보낸다.** 앱은 광고주에게 나가는 모든 경로에서
    // 연락처를 비우는데(sanitizeApplicantForCompany), 문서라고 예외를 두면 그 경계가
    // 여기 한 곳에서 샌다. 보낸 뒤에는 되돌릴 수 없다.
    const 연락처 = "010-1234-5678";
    const table = buildInviteeTable([
      {
        id: "i1", event_id: "e1", applicant_id: null, name: "김서연",
        sns_url: "https://instagram.com/seoyeon", contact: 연락처,
        rsvp_status: "attending", attended: true, memo: "VIP", created_at: "2026-09-01T00:00:00Z",
      },
    ]);
    const 표전체 = [...table.headers, ...table.rows.flat()].join(" ");
    expect(표전체).not.toContain(연락처);
    expect(표전체).not.toContain("1234");
    expect(표전체, "메모도 내부용이라 나가면 안 된다").not.toContain("VIP");
    expect(표전체, "이름과 RSVP 는 나가야 쓸모가 있다").toContain("김서연");
    expect(표전체).toContain("참석");
  });
});

describe("SNS 월별 차트", () => {
  const 콘텐츠 = (p: Partial<SnsContent>): SnsContent =>
    ({ id: "c", account_id: "a", title: "t", scheduled_on: null, assignee: null,
       status: "posted", caption: null, hashtags: null, media_note: null,
       client_comment: null, view_count: 0, like_count: 0, comment_count: 0, ...p } as SnsContent);

  it("발행 예정일 기준으로 묶고, 게시완료만 센다", () => {
    // 화면(SnsAccountDetailClient)이 발행 예정일 기준이다. 문서가 다른 기준을 쓰면
    // 같은 달을 두고 화면과 PPT 가 다른 숫자를 말하게 된다.
    const chart = buildMonthlyChart([
      콘텐츠({ scheduled_on: "2026-08-10", view_count: 100 }),
      콘텐츠({ scheduled_on: "2026-08-20", view_count: 50 }),
      콘텐츠({ scheduled_on: "2026-09-01", view_count: 7 }),
      콘텐츠({ scheduled_on: "2026-09-02", status: "approved", view_count: 9999 }), // 게시 전
    ]);
    expect(chart.categories).toEqual(["2026-08", "2026-09"]);
    expect(chart.series[0]!.values, "게시 건수").toEqual([2, 1]);
    expect(chart.series[1]!.values, "조회수").toEqual([150, 7]);
  });

  it("예정일이 없으면 어느 달인지 알 수 없으므로 세지 않는다", () => {
    const chart = buildMonthlyChart([콘텐츠({ scheduled_on: null, view_count: 500 })]);
    expect(chart.categories).toEqual([]);
  });
});
