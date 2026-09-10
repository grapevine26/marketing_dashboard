import { describe, it, expect } from "vitest";
import {
  COMMON_RULES,
  preSurveyPrompt,
  formIntroPrompt,
  eventPlanPrompt,
  snsCaptionPrompt,
  snsIntakePrompt,
  snsPlanPrompt,
} from "@/lib/ai/prompts";

describe("AI Prompts (lib/ai/prompts.ts)", () => {
  it("공통 작성 규칙(COMMON_RULES)에 핵심 제약이 명시되어 있다", () => {
    expect(COMMON_RULES).toContain("마크다운 문법");
    expect(COMMON_RULES).toContain("한국어로 작성");
    expect(COMMON_RULES).toContain("임의로 바꾸거나 지어내지 마세요");
  });

  it("사전조사(A) 프롬프트에 질문과 규칙이 포함된다", () => {
    const prompt = preSurveyPrompt({
      question: "주요 타겟 고객층은 누구인가요?",
      campaignName: "여름 립스틱 캠페인",
      companyName: "뷰티코스메틱",
      campaignType: "shipping",
      userDraft: "20대 여성",
    });
    expect(prompt).toContain("여름 립스틱 캠페인");
    expect(prompt).toContain("주요 타겟 고객층은 누구인가요?");
    expect(prompt).toContain("20대 여성");
    expect(prompt).toContain(COMMON_RULES);
  });

  it("신청폼 소개글(A) 프롬프트에 브랜드 정보가 들어간다", () => {
    const prompt = formIntroPrompt({
      campaignName: "선크림 체험단",
      companyName: "클린스킨",
      campaignType: "shipping",
      preSurveyAnswers: { "핵심 소구점": "백탁 없는 촉촉함" },
    });
    expect(prompt).toContain("선크림 체험단");
    expect(prompt).toContain("클린스킨");
    expect(prompt).toContain("백탁 없는 촉촉함");
    expect(prompt).toContain(COMMON_RULES);
  });

  it("행사 운영안(B) 프롬프트에 장소, 일시, 플레이스홀더가 포함된다", () => {
    const prompt = eventPlanPrompt({
      brandName: "럭셔리뷰티",
      eventName: "신제품 런칭 쇼케이스",
      eventAt: "2026-10-15 14:00",
      venue: "성수동 에스팩토리",
      placeholders: ["행사개요", "프로그램일정"],
    });
    expect(prompt).toContain("럭셔리뷰티");
    expect(prompt).toContain("성수동 에스팩토리");
    expect(prompt).toContain("행사개요");
    expect(prompt).toContain("프로그램일정");
    expect(prompt).toContain(COMMON_RULES);
  });

  it("SNS 캡션(C) 프롬프트에 플랫폼 및 해시태그 JSON 구조가 요구된다", () => {
    const prompt = snsCaptionPrompt({
      brandName: "글로우랩",
      platform: "Instagram",
      handle: "glowlab_kr",
      title: "신제품 수분세럼 출시",
    });
    expect(prompt).toContain("글로우랩");
    expect(prompt).toContain("Instagram");
    expect(prompt).toContain("glowlab_kr");
    expect(prompt).toContain("hashtags");
    expect(prompt).toContain(COMMON_RULES);
  });

  it("SNS 사전설문(C) 프롬프트에 질문과 브랜드 정보가 포함된다", () => {
    const prompt = snsIntakePrompt({
      question: "경쟁사 채널 대비 차별화 포인트는 무엇인가요?",
      companyName: "이너뷰티",
      platform: "Instagram",
      handle: "innerbeauty_official",
    });
    expect(prompt).toContain("경쟁사 채널 대비 차별화 포인트는 무엇인가요?");
    expect(prompt).toContain("이너뷰티");
    expect(prompt).toContain(COMMON_RULES);
  });

  it("SNS 채널 운영안(C) 프롬프트에 계약기간 및 월별 규칙이 포함된다", () => {
    const prompt = snsPlanPrompt({
      brandName: "오가닉푸드",
      platform: "Instagram",
      handle: "organic_kr",
      startsOn: "2026-09-01",
      endsOn: "2026-11-30",
      placeholders: ["월별운영전략"],
    });
    expect(prompt).toContain("오가닉푸드");
    expect(prompt).toContain("2026-09-01 ~ 2026-11-30");
    expect(prompt).toContain("월별운영전략");
    expect(prompt).toContain("실제로 포함되는 달");
    expect(prompt).toContain(COMMON_RULES);
  });

  it("사전설문 및 사전조사에서 isRegeneration이 true이면 대안 추천 요청 안내가 프롬프트에 포함된다", () => {
    const snsPrompt = snsIntakePrompt({
      question: "주요 타겟 고객층은 누구인가요?",
      companyName: "코스메틱",
      isRegeneration: true,
      previousDraft: "20대 초반 대학생 중심",
    });
    expect(snsPrompt).toContain("대안 추천 요청");
    expect(snsPrompt).toContain("20대 초반 대학생 중심");

    const prePrompt = preSurveyPrompt({
      question: "차별화 포인트는 무엇인가요?",
      companyName: "브랜드",
      isRegeneration: true,
      previousDraft: "천연 유기농 성분 100%",
    });
    expect(prePrompt).toContain("대안 추천 요청");
    expect(prePrompt).toContain("천연 유기농 성분 100%");
  });
});
