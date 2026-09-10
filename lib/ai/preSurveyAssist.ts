import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { GEMINI_MODEL, AI_FALLBACK_TEXT } from "./config";
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
}

export async function assistPreSurvey(
  request: PreSurveyAssistRequest
): Promise<PreSurveyAssistResponse> {
  const fallback = (): PreSurveyAssistResponse => ({
    suggestions: ["핵심 소구점과 차별화 포인트", "타겟 고객층과 톤앤매너", "필수 키워드/해시태그와 주의사항"],
    recommendedDraft: request.userDraft || request.previousDraft || AI_FALLBACK_TEXT,
    fallback: true,
  });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback();

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
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
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

        const parsed = JSON.parse(response.text || "{}");
        if (typeof parsed.recommendedDraft !== "string" || !parsed.recommendedDraft.trim()) {
          return fallback();
        }
        return {
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String).slice(0, 5) : [],
          recommendedDraft: parsed.recommendedDraft,
          fallback: false,
        };
      } catch (error) {
        console.error("Gemini preSurvey assist error:", error);
        return fallback();
      }
    },
    (result) => !result.fallback,
    { bypass: shouldBypass }
  );
}
