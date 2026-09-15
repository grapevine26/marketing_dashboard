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

  it("광고주에게는 연락처 사유를 빼고 SNS 중복만 준다", () => {
    // 연락처 값 자체는 무해화가 비우지만, "이 둘이 같은 번호를 썼다" 는 사실이 사유 문자열로
    // 나가면 가족·지인이 각자 계정으로 지원한 정상적인 경우까지 관계가 드러난다.
    // SNS 중복은 같은 채널로 두 번 응모한 것이라 부정이 명백해 광고주도 알아야 한다.
    const list = [
      app({ id: "1", name: "A", sns_link: "https://instagram.com/same", contact: "010-1111-1111" }),
      app({ id: "2", name: "B", sns_link: "https://instagram.com/same", contact: "010-2222-2222" }),
      app({ id: "3", name: "C", sns_link: "https://instagram.com/other", contact: "01011111111" }),
    ];

    const forCompany = findDuplicates(list, { includeContact: false });
    expect(forCompany.get("1")).toEqual([expect.stringContaining("동일 SNS 계정 (B)")]);
    expect(forCompany.get("2")).toEqual([expect.stringContaining("동일 SNS 계정 (A)")]);
    // 연락처만 겹치던 3번은 광고주 쪽에서 배지 자체가 사라진다.
    expect(forCompany.get("3")).toBeUndefined();
    expect(JSON.stringify([...forCompany.values()])).not.toContain("연락처");

    // 대행사 화면은 기본값 그대로 둘 다 본다.
    const forAgency = findDuplicates(list);
    expect(forAgency.get("3")).toEqual([expect.stringContaining("동일 연락처 (A)")]);
  });

  it("광고주 화면이 연락처 사유를 끄고 부른다", async () => {
    const { readFileSync } = await import("node:fs");
    // 여기서 인자를 빠뜨리면 기본값이 true 라 조용히 예전처럼 나간다.
    const src = readFileSync("app/applicants/[token]/page.tsx", "utf8");
    expect(src).toMatch(/findDuplicates\([^)]*includeContact:\s*false/);
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

  it("팔로워 수, 카테고리, 에이전시 메모가 CSV에 올바르게 포함되고 비공개 시 메모가 제외된다", () => {
    const list = [
      app({
        id: "1",
        follower_count: 52000,
        category: "뷰티/스킨케어",
        agency_memo: "원고료 10만원 협의 필요",
      }),
    ];
    const full = applicantsToCSV(list);
    expect(full).toContain('"52000"');
    expect(full).toContain('"뷰티/스킨케어"');
    expect(full).toContain('"원고료 10만원 협의 필요"');

    const masked = applicantsToCSV(list, [], { includeContact: false });
    expect(masked).toContain('"52000"');
    expect(masked).toContain('"뷰티/스킨케어"');
    expect(masked).not.toContain("원고료 10만원 협의 필요");
  });
});
