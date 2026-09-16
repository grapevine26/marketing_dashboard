import { GoogleGenAI, ThinkingLevel, type GenerateContentResponse } from "@google/genai";
import { GEMINI_MODEL, AI_FALLBACK_TEXT, type AiFallbackReason } from "./config";
import { preSurveyPrompt } from "./prompts";
import { withCache } from "./cache";

export interface PreSurveyAssistRequest {
  question: string;
  userDraft?: string;
  forceRefresh?: boolean;
  isRegeneration?: boolean;
  previousDraft?: string;
  context?: {
    campaignName?: string;
    companyName?: string;
    campaignType?: string;
  };
}

export interface PreSurveyAssistResponse {
  suggestions: string[];
  recommendedDraft: string;
  /** true면 AI 호출이 실패해 기본 문구로 대체된 것 */
  fallback: boolean;
  /**
   * 폴백이 된 이유. `fallback: true` 일 때만 채운다.
   *
   * 이 함수는 **절대 throw 하지 않는다.** 그래서 "키가 없어 부르지도 못했다" 와
   * "불렀는데 결과가 나빴다" 가 밖에서 보면 똑같이 `fallback: true` 였고, 부르는 쪽은
   * 둘을 구분할 수 없어 키가 빠진 환경에서도 사용 횟수를 차감했다. 3번이면 24시간 잠금이다.
   * 그 구분을 여기서 붙여 준다.
   */
  fallbackReason?: AiFallbackReason;
}

export async function assistPreSurvey(
  request: PreSurveyAssistRequest
): Promise<PreSurveyAssistResponse> {
  const fallback = (reason: AiFallbackReason): PreSurveyAssistResponse => ({
    suggestions: ["핵심 소구점과 차별화 포인트", "타겟 고객층과 톤앤매너", "필수 키워드/해시태그와 주의사항"],
    recommendedDraft: request.userDraft || request.previousDraft || AI_FALLBACK_TEXT,
    fallback: true,
    fallbackReason: reason,
  });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback("no-key");

  const shouldBypass = Boolean(request.forceRefresh || request.isRegeneration);
  const cachePayload = {
    question: request.question,
    userDraft: request.userDraft,
    context: request.context,
  };

  return withCache(
    "preSurvey",
    cachePayload,
    async () => {
      // **호출과 해석의 try 를 나눈다.** 하나로 묶으면 응답을 해석하다 난 예외까지
      // "못 불렀다" 로 뭉뚱그려져 환불 대상이 된다. 그러면 모델이 깨진 JSON 을 뱉도록
      // 유도하는 입력을 반복해 질문당 상한을 무한히 우회할 수 있다.
      let response: GenerateContentResponse;
      try {
        const ai = new GoogleGenAI({ apiKey });
        response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: preSurveyPrompt({
            question: request.question,
            userDraft: request.userDraft,
            campaignName: request.context?.campaignName,
            companyName: request.context?.companyName,
            campaignType: request.context?.campaignType,
            isRegeneration: request.isRegeneration,
            previousDraft: request.previousDraft,
          }),
          config: {
            responseMimeType: "application/json",
            maxOutputTokens: 800,
            temperature: shouldBypass ? 0.85 : 0.7,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        });
      } catch (error) {
        // 여기까지 오면 결과를 받지 못했다(네트워크·타임아웃·API 오류).
        console.error("Gemini preSurvey assist error:", error);
        return fallback("call-failed");
      }

      // 아래부터는 모델이 이미 응답했다. 무엇이 나오든 "불렀다" 로 센다.
      try {
        const parsed = JSON.parse(response.text || "{}");
        if (typeof parsed.recommendedDraft !== "string" || !parsed.recommendedDraft.trim()) {
          return fallback("bad-output");
        }
        return {
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String).slice(0, 5) : [],
          recommendedDraft: parsed.recommendedDraft,
          fallback: false,
        };
      } catch (error) {
        console.error("Gemini preSurvey 응답 해석 실패:", error);
        return fallback("bad-output");
      }
    },
    (result) => !result.fallback,
    { bypass: shouldBypass }
  );
}
