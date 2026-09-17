import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  AI_BY_QUESTION,
  APPLY_SUBMIT,
  LOGIN_BY_USERNAME,
  PUBLIC_BY_LINK,
  PUBLIC_SUBMIT,
} from "@/lib/security/throttle";
import { MAX_PPT_TEMPLATE_BYTES, MAX_SNS_MEDIA_BYTES } from "@/lib/db/types";

/**
 * 사용법 화면(`/guide`)에 **숫자로 박힌 사실**이 코드와 같은가.
 *
 * 이 문서는 이나영프로가 읽고 그대로 따라 하는 물건인데, 정적 JSX 라 코드가 바뀌어도
 * 조용히 낡는다. 실제로 그렇게 어긋났다 — 공개 폼 상한은 5회라고 적혀 있었지만 실제는
 * 10회였고, AI 는 "문항당 3회" 라고만 적혀 있어 **하루** 기준이라는 말이 빠져 있었다.
 * 담당자가 "5회 넘겼나?" 를 세고 있는데 실제로는 다른 이유로 막히는 상황이 된다.
 *
 * e2e(`tests/e2e/guide.spec.ts`)는 **이름**이 맞는지를 본다(버튼·링크 카드·단계).
 * 여기서는 **숫자**가 맞는지를 본다. 값을 코드 상수에서 만들어 비교하므로, 정책을 바꾸면
 * 이 테스트가 먼저 깨져서 문서를 같이 고치게 된다.
 *
 * 단계 목록처럼 코드에서 직접 import 해 그리는 것이 가장 좋지만(SEEDING_STAGES 가 그렇다),
 * 상한 숫자는 문장 속에 녹아 있어 그렇게 만들 수 없다. 대신 여기서 잡는다.
 */

/** 태그를 걷어내고 공백을 하나로 눌러 "화면에 읽히는 문장" 에 가깝게 만든다. */
function 읽히는문장(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
}

const 가이드 = 읽히는문장("app/(dashboard)/guide/page.tsx");
const 분 = (ms: number) => ms / 60000;
const MB = (bytes: number) => bytes / (1024 * 1024);

describe("사용법 화면의 숫자가 코드와 같은가", () => {
  it("공개 폼 제출 상한 (접속 위치 기준 / 링크 전체 기준)", () => {
    expect(분(PUBLIC_SUBMIT.windowMs), "문서는 '10분에' 라고 적는다").toBe(10);
    expect(가이드).toContain(`10분에 ${PUBLIC_SUBMIT.maxHits}회`);

    expect(분(PUBLIC_BY_LINK.windowMs), "문서는 '1시간에' 라고 적는다").toBe(60);
    expect(가이드).toContain(`1시간에 ${PUBLIC_BY_LINK.maxHits}회`);
  });

  it("지원폼은 따로 훨씬 높은 상한을 쓴다", () => {
    // 지원폼만 다른 정책을 쓴다는 것이 이 문단의 요점이다. 같아지면 문장을 다시 써야 한다.
    expect(APPLY_SUBMIT.maxHits).toBeGreaterThan(PUBLIC_SUBMIT.maxHits);
    expect(분(APPLY_SUBMIT.windowMs)).toBe(10);
    expect(가이드).toContain(`10분에 ${APPLY_SUBMIT.maxHits}건`);
  });

  it("AI 추천은 질문당 '하루' 몇 회인지까지 적는다", () => {
    // 창이 24시간이라 "문항당 3회" 만 적으면 언제 초기화되는지 알 수 없다.
    expect(AI_BY_QUESTION.windowMs).toBe(24 * 60 * 60 * 1000);
    const 문구 = `(질문마다 하루 ${AI_BY_QUESTION.maxHits}회)`;
    expect(가이드.split(문구).length - 1, "공유 링크 표 두 줄 모두").toBe(2);
    expect(가이드, "옛 표기가 남아 있으면 안 된다").not.toContain("문항당 최대");
  });

  it("로그인 잠금 횟수와 시간", () => {
    expect(가이드).toContain(
      `${LOGIN_BY_USERNAME.maxHits}회 틀리면 ${분(LOGIN_BY_USERNAME.lockMs)}분`
    );
  });

  it("업로드 용량 한도", () => {
    expect(가이드).toContain(`${MB(MAX_SNS_MEDIA_BYTES)}MB`);
    expect(가이드).toContain(`${MB(MAX_PPT_TEMPLATE_BYTES)}MB`);
  });
});

describe("사용법 화면이 옛 동작을 설명하고 있지 않은가", () => {
  it("SNS 월별 성과는 발행 예정일 기준이라고 적는다", () => {
    expect(가이드).toContain("월별 집계는 발행 예정일");
    expect(가이드, "상태 전환 월 기준으로 되돌아가면 안 된다").not.toContain("게시완료로 바뀐 달");
  });

  it("기본 내장 PPT 템플릿은 지울 수 있고 되살릴 수 있다고 적는다", () => {
    expect(가이드).toContain("되살리기");
    expect(가이드).not.toContain("기본 제공 템플릿은 지워지지 않습니다");
  });

  it("보고서는 이름을 바꾸고 지울 수 있다고 적는다", () => {
    expect(가이드).toContain("보고서 이름을 바꾸고");
    expect(가이드).toContain("삭제");
  });
});
