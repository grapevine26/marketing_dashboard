import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { GEMINI_MODEL, AI_FALLBACK_TEXT } from "./config";
import { snsIntakePrompt } from "./prompts";
import { withCache } from "./cache";

export interface SnsIntakeAssistRequest {
  question: string;
  userDraft?: string;
  context?: {
    companyName?: string;
    platform?: string;
    handle?: string;
  };
}

export interface SnsIntakeAssistResponse {
  suggestions: string[];
  recommendedDraft: string;
  fallback: boolean;
}

export async function assistSnsIntake(
  request: SnsIntakeAssistRequest
): Promise<SnsIntakeAssistResponse> {
  const fallback = (): SnsIntakeAssistResponse => ({
    suggestions: ["타겟 고객층과 톤앤매너", "중점 홍보 상품/프로모션 일정", "로고·컬러 등 디자인 가이드"],
    recommendedDraft: request.userDraft || AI_FALLBACK_TEXT,
    fallback: true,
  });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback();

  return withCache(
    "snsIntake",
    request,
    async () => {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: snsIntakePrompt({
            question: request.question,
            userDraft: request.userDraft,
            companyName: request.context?.companyName,
            platform: request.context?.platform,
            handle: request.context?.handle,
          }),
          config: {
            responseMimeType: "application/json",
            maxOutputTokens: 800,
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
        console.error("Gemini snsIntake assist error:", error);
        return fallback();
      }
    },
    (result) => !result.fallback
  );
}
