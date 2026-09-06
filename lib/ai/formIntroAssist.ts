import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { GEMINI_MODEL } from "./config";
import { formIntroPrompt } from "./prompts";
import { withCache } from "./cache";

export interface FormIntroAssistRequest {
  campaignName: string;
  companyName: string;
  campaignType: string;
  /** {질문 문구: 답변} 형태로 넘길 것 (labelAnswers 참고) */
  preSurveyAnswers?: Record<string, string>;
}

export interface FormIntroAssistResponse {
  text: string;
  fallback: boolean;
}

export async function generateFormIntro(
  request: FormIntroAssistRequest
): Promise<FormIntroAssistResponse> {
  const fallbackText = `안녕하세요! ${request.companyName}의 ${request.campaignName} 체험단에 오신 것을 환영합니다 ✨\n\n솔직하고 감각적인 리뷰 콘텐츠를 함께 만들어갈 인플루언서 분들의 많은 관심과 지원 부탁드립니다.`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { text: fallbackText, fallback: true };

  return withCache(
    "formIntro",
    request,
    async () => {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: formIntroPrompt(request),
          config: {
            maxOutputTokens: 1200,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        });

        const text = (response.text || "").trim();
        if (!text) return { text: fallbackText, fallback: true };
        return { text, fallback: false };
      } catch (error) {
        console.error("Gemini formIntro assist error:", error);
        return { text: fallbackText, fallback: true };
      }
    },
    (result) => !result.fallback
  );
}
