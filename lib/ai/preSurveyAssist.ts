import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { GEMINI_MODEL } from "./config";

export interface PreSurveyAssistRequest {
  question: string;
  userDraft?: string;
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

const FALLBACK_DRAFT = "AI 제안 실패 — 직접 입력해주세요.";

export async function assistPreSurvey(
  request: PreSurveyAssistRequest
): Promise<PreSurveyAssistResponse> {
  const apiKey = process.env.GEMINI_API_KEY;

  const fallback = (): PreSurveyAssistResponse => ({
    suggestions: ["핵심 소구점과 차별화 포인트", "타겟 고객층과 톤앤매너", "필수 키워드/해시태그와 주의사항"],
    recommendedDraft: request.userDraft || FALLBACK_DRAFT,
    fallback: true,
  });

  if (!apiKey) return fallback();

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `당신은 인플루언서 마케팅 전문 에이전시의 시니어 마케터입니다.
캠페인 정보:
- 캠페인명: ${request.context?.campaignName || "미정"}
- 브랜드명: ${request.context?.companyName || "미정"}
- 유형: ${request.context?.campaignType === "shipping" ? "제품배송형" : "현장방문형"}

사전조사 질문: "${request.question}"
사용자 기존 입력(있을 경우): "${request.userDraft || ""}"

위 질문에 대해 광고주가 작성하기 좋은 구체적인 답변 초안 1개와, 참고할 수 있는 핵심 키워드/추천 포인트 3개를 JSON 형식으로 작성해주세요.
반드시 아래 JSON 형식으로만 응답해주세요:
{
  "suggestions": ["포인트1", "포인트2", "포인트3"],
  "recommendedDraft": "추천 답변 초안 본문"
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
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
    console.error("Gemini preSurvey assist error:", error);
    return fallback();
  }
}
