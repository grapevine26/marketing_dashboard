import { describe, it, expect } from "vitest";
import { findDuplicates } from "@/lib/applicants/duplicates";
import { applicantsToCSV } from "@/lib/applicants/csv";
import { Applicant } from "@/lib/db/types";

function app(partial: Partial<Applicant>): Applicant {
  return {
    id: "id",
    campaign_id: "c",
    name: "이름",
    sns_link: "https://instagram.com/a",
    nationality: "KR",
    contact: "010-0000-0000",
    privacy_agreed: true,
    secondary_use_agreed: false,
    status: "applied",
    status_changed_by: "agency",
    applied_at: "2026-09-01T00:00:00Z",
    ...partial,
  };
}

describe("중복 감지", () => {
  it("연락처가 달라도 SNS 링크가 같으면 잡는다 (정규화 비교)", () => {
    const list = [
      app({ id: "1", name: "A", sns_link: "https://www.instagram.com/Same/", contact: "010-1111-1111" }),
      app({ id: "2", name: "B", sns_link: "http://instagram.com/same", contact: "010-2222-2222" }),
      app({ id: "3", name: "C", sns_link: "https://instagram.com/other", contact: "01011111111" }),
    ];
    const d = findDuplicates(list);
    expect(d.get("1")).toEqual(expect.arrayContaining([expect.stringContaining("동일 SNS 계정 (B)"), expect.stringContaining("동일 연락처 (C)")]));
    expect(d.get("2")).toEqual([expect.stringContaining("동일 SNS 계정 (A)")]);
    expect(d.get("3")).toEqual([expect.stringContaining("동일 연락처 (A)")]);
  });
});

describe("지원자 CSV", () => {
  it("BOM, 상태 라벨, 커스텀 답변, 개인정보 제외 옵션", () => {
    const list = [app({ id: "1", status: "reserved", custom_answers: { q1: "건성", q2: true } })];
    const full = applicantsToCSV(list, [{ id: "q1", label: "피부", type: "select", required: false }, { id: "q2", label: "동의", type: "checkbox", required: false }]);
    expect(full.charCodeAt(0)).toBe(0xfeff);
    expect(full).toContain('"예비선정"');
    expect(full).toContain('"건성"');
    expect(full).toContain('"예"');
    expect(full).toContain("010-0000-0000");

    const masked = applicantsToCSV(list, [], { includeContact: false });
    expect(masked).not.toContain("010-0000-0000");
    expect(masked).not.toContain("연락처");
  });
});
