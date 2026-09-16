import { describe, it, expect, afterEach, vi } from "vitest";
import { hasTestDb } from "./test-db";

// DB 를 건드리는 스위트. 테스트 프로젝트(SUPABASE_TEST_*)가 없으면 건너뛴다.
const describeDb = describe.skipIf(!hasTestDb);

import { createCampaign, createSnsAccount } from "@/lib/db";
import { db, unwrap } from "@/lib/db/client";
import { getPublicAiAssistAction } from "@/app/pre-survey/[token]/actions";
import { assistSnsIntakeAction } from "@/app/sns-intake/actions";
import * as preAssistModule from "@/lib/ai/preSurveyAssist";
import * as snsAssistModule from "@/lib/ai/snsIntakeAssist";
import { isRefundableFallback } from "@/lib/ai/config";
import {
  AI_BY_QUESTION,
  aiQuestionKey,
  getThrottleCount,
  getThrottleCounts,
  isThrottled,
} from "@/lib/security/throttle";

/**
 * AI 추천 횟수 제한이 **실제로 잠기는 것과 같은 말을 하는가.**
 *
 * 두 가지를 고정한다.
 *
 * 1. 모델을 **부르지도 못했으면** 횟수를 차감하지 않는다.
 *    어시스트 함수는 throw 하지 않는다 — 키가 없어도, Gemini 가 죽어도 `fallback: true` 로
 *    조용히 돌아온다. 그래서 전에는 키가 빠진 배포에서 광고주가 버튼을 3번 누르는 순간
 *    그 질문이 24시간 잠겼고, 키를 고쳐 넣어도 풀리지 않았다.
 *    **다만 "불렀는데 결과가 나빴다"(bad-output)는 그대로 차감한다.** 그걸 돌려주면
 *    응답 파싱이 깨지도록 유도하는 입력을 반복해 상한을 무한히 우회할 수 있다.
 *
 * 2. 화면의 "남은 횟수"가 잠금을 함께 본다.
 *    창은 첫 호출부터, 잠금은 세 번째 호출부터 흐른다. 둘 다 24시간이라 창이 먼저 끝나고
 *    잠금이 뒤에 남는다. 창만 보면 화면은 "3회 가능"이라 하고 누르면 거부당한다.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** auth_throttle 행을 직접 만든다. 창과 잠금이 어긋난 상태는 실제 시간을 기다리지 않고는 못 만든다. */
async function putThrottleRow(
  key: string,
  row: { failures: number; windowStart: Date; lockedUntil: Date | null }
): Promise<void> {
  unwrap(
    await db()
      .from("auth_throttle")
      .upsert({
        key,
        failures: row.failures,
        window_start: row.windowStart.toISOString(),
        locked_until: row.lockedUntil ? row.lockedUntil.toISOString() : null,
      })
      .select("key")
  );
}

const HOUR = 60 * 60 * 1000;

describe("폴백 이유로 환불 여부를 가른다", () => {
  it("부르지 못한 경우만 돌려준다", () => {
    expect(isRefundableFallback("no-key")).toBe(true);
    expect(isRefundableFallback("call-failed")).toBe(true);
    // 이미 불렀다. 돈은 나갔고, 여기를 열면 상한 우회 경로가 된다.
    expect(isRefundableFallback("bad-output")).toBe(false);
    // 이유를 모르면 차감을 유지한다. 모르는 것을 환불로 치면 이유를 비운 응답 하나로 우회된다.
    expect(isRefundableFallback(undefined)).toBe(false);
  });
});

describeDb("AI 추천 횟수: 못 부른 호출은 차감하지 않는다", () => {
  it("GEMINI_API_KEY 가 없으면 3번을 눌러도 사전조사 질문이 잠기지 않는다", async () => {
    // 테스트 환경은 setup.ts 가 키를 비워 둔다. 그 성질에 기대지 않고 여기서도 못박는다.
    vi.stubEnv("GEMINI_API_KEY", "");

    const camp = await createCampaign({
      name: "키없음캠페인",
      company_name: "테스트컴퍼니",
      campaign_type: "shipping",
    });
    const questionId = "q1";
    const key = aiQuestionKey("pre", camp.pre_survey_token, questionId);

    // 모킹하지 않는다. 진짜 assistPreSurvey 가 키를 못 찾고 폴백으로 돌아오는 길을 그대로 탄다.
    for (let i = 1; i <= AI_BY_QUESTION.maxHits; i++) {
      const res = await getPublicAiAssistAction({ token: camp.pre_survey_token, questionId });
      expect(res.ok, `${i}회차가 실패하면 안 된다`).toBe(true);
      if (!res.ok) return;
      expect(res.data.fallback).toBe(true);
      expect(res.data.fallbackReason).toBe("no-key");
      // 매번 환불되므로 사용 횟수는 계속 0 이다.
      expect(await getThrottleCount(key), `${i}회차 뒤 사용 횟수`).toBe(0);
    }

    // 여기가 원래 터지던 자리다. 전에는 4회차가 "질문당 최대 3회" 로 막혔고 24시간 갔다.
    expect(await isThrottled([key])).toBe(false);
    const fourth = await getPublicAiAssistAction({ token: camp.pre_survey_token, questionId });
    expect(fourth.ok).toBe(true);
    if (fourth.ok) expect(fourth.data.fallbackReason).toBe("no-key");
  });

  it("GEMINI_API_KEY 가 없으면 SNS 사전설문 질문도 잠기지 않는다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    const acc = await createSnsAccount({
      company_name: "키없음브랜드",
      platform: "instagram",
      handle: "no_key_brand",
      starts_on: null,
      ends_on: null,
    });
    const questionId = "sq1";
    const key = aiQuestionKey("sns", acc.intake_token, questionId);

    for (let i = 1; i <= AI_BY_QUESTION.maxHits; i++) {
      const res = await assistSnsIntakeAction({ token: acc.intake_token, questionId });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.fallbackReason).toBe("no-key");
    }

    expect(await getThrottleCount(key)).toBe(0);
    expect(await isThrottled([key])).toBe(false);
  });

  it("호출 도중 실패(call-failed)도 돌려준다 — 결과를 받지 못했다", async () => {
    const camp = await createCampaign({
      name: "호출실패캠페인",
      company_name: "테스트컴퍼니",
      campaign_type: "shipping",
    });
    vi.spyOn(preAssistModule, "assistPreSurvey").mockResolvedValue({
      suggestions: [],
      recommendedDraft: "",
      fallback: true,
      fallbackReason: "call-failed",
    });

    const res = await getPublicAiAssistAction({ token: camp.pre_survey_token, questionId: "q1" });
    expect(res.ok).toBe(true);

    expect(await getThrottleCount(aiQuestionKey("pre", camp.pre_survey_token, "q1"))).toBe(0);
  });
});

describeDb("AI 추천 횟수: 불렀는데 결과가 나쁘면 차감을 유지한다", () => {
  it("bad-output 은 돌려주지 않는다 (상한 우회 방어)", async () => {
    const camp = await createCampaign({
      name: "응답불량캠페인",
      company_name: "테스트컴퍼니",
      campaign_type: "shipping",
    });
    // 모델은 이미 응답했고 돈이 나갔다. JSON 이 깨졌거나 초안이 비어 있는 경우다.
    vi.spyOn(preAssistModule, "assistPreSurvey").mockResolvedValue({
      suggestions: [],
      recommendedDraft: "",
      fallback: true,
      fallbackReason: "bad-output",
    });

    const key = aiQuestionKey("pre", camp.pre_survey_token, "q1");
    for (let i = 1; i <= AI_BY_QUESTION.maxHits; i++) {
      const res = await getPublicAiAssistAction({ token: camp.pre_survey_token, questionId: "q1" });
      expect(res.ok).toBe(true);
      expect(await getThrottleCount(key), `${i}회차 뒤 사용 횟수`).toBe(i);
    }

    // 세 번 썼으면 잠긴다. 여기가 막히지 않으면 파싱을 깨뜨리는 입력으로 무한히 부를 수 있다.
    expect(await isThrottled([key])).toBe(true);
    const blocked = await getPublicAiAssistAction({ token: camp.pre_survey_token, questionId: "q1" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toContain("질문당 최대 3회");
  });

  it("이유가 없는 폴백(옛 응답 모양)도 차감을 유지한다", async () => {
    const acc = await createSnsAccount({
      company_name: "이유없음브랜드",
      platform: "instagram",
      handle: "no_reason_brand",
      starts_on: null,
      ends_on: null,
    });
    // fallbackReason 을 채우지 않는 호출부가 남아 있어도 방어가 느슨해지면 안 된다.
    vi.spyOn(snsAssistModule, "assistSnsIntake").mockResolvedValue({
      suggestions: [],
      recommendedDraft: "",
      fallback: true,
    });

    const res = await assistSnsIntakeAction({ token: acc.intake_token, questionId: "sq1" });
    expect(res.ok).toBe(true);
    expect(await getThrottleCount(aiQuestionKey("sns", acc.intake_token, "sq1"))).toBe(1);
  });
});

describeDb("화면의 남은 횟수가 실제 잠금과 같은 말을 하는가", () => {
  const token = "pre_usage_view_token";
  const lockedKey = aiQuestionKey("pre", token, "q1");
  const staleKey = aiQuestionKey("pre", token, "q2");

  it("창이 지났어도 아직 잠겨 있으면 '다 썼다'로 보고한다", async () => {
    // 재현하는 상황: 09:00 1회(창 시작) → 23:00 2회 → 23:30 3회(잠금은 다음날 23:30까지).
    // 다음날 09:00 이 지나면 창은 끝났지만 잠금은 14시간 30분 더 남는다.
    const now = Date.now();
    await putThrottleRow(lockedKey, {
      failures: AI_BY_QUESTION.maxHits,
      windowStart: new Date(now - 25 * HOUR),
      lockedUntil: new Date(now + 14.5 * HOUR),
    });

    // 실제로 막힌다.
    expect(await isThrottled([lockedKey])).toBe(true);
    // 화면도 같은 말을 해야 한다. 전에는 창만 보고 0(= "3회 가능")이라고 했다.
    const counts = await getThrottleCounts([lockedKey]);
    expect(counts.get(lockedKey) ?? 0).toBe(AI_BY_QUESTION.maxHits);
    // 단수 함수도 같은 규칙이어야 한다.
    expect(await getThrottleCount(lockedKey)).toBe(AI_BY_QUESTION.maxHits);
  });

  it("창이 지나고 잠기지도 않은 키는 0 으로 돌아간다", async () => {
    const now = Date.now();
    await putThrottleRow(staleKey, {
      failures: 2,
      windowStart: new Date(now - 25 * HOUR),
      lockedUntil: null,
    });

    expect(await isThrottled([staleKey])).toBe(false);
    const counts = await getThrottleCounts([staleKey]);
    expect(counts.get(staleKey) ?? 0).toBe(0);
    expect(await getThrottleCount(staleKey)).toBe(0);
  });

  it("여러 키를 섞어도 키마다 같은 규칙이 적용된다", async () => {
    const now = Date.now();
    const freshKey = aiQuestionKey("pre", token, "q3");
    await putThrottleRow(lockedKey, {
      failures: AI_BY_QUESTION.maxHits,
      windowStart: new Date(now - 25 * HOUR),
      lockedUntil: new Date(now + 14.5 * HOUR),
    });
    await putThrottleRow(staleKey, {
      failures: 2,
      windowStart: new Date(now - 25 * HOUR),
      lockedUntil: null,
    });
    await putThrottleRow(freshKey, {
      failures: 1,
      windowStart: new Date(now - 1 * HOUR),
      lockedUntil: null,
    });

    const counts = await getThrottleCounts([lockedKey, staleKey, freshKey]);
    expect(counts.get(lockedKey) ?? 0).toBe(AI_BY_QUESTION.maxHits);
    expect(counts.get(staleKey) ?? 0).toBe(0);
    expect(counts.get(freshKey) ?? 0).toBe(1);

    // 단수/복수가 갈라지지 않는지 나란히 본다.
    for (const key of [lockedKey, staleKey, freshKey]) {
      expect(await getThrottleCount(key), `${key} 는 단수/복수가 같아야 한다`).toBe(counts.get(key) ?? 0);
    }
  });
});
