import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { GEMINI_MODEL, AI_FALLBACK_TEXT } from "./config";

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
  const apiKey = process.env.GEMINI_API_KEY;
  const fallback = (): SnsIntakeAssistResponse => ({
    suggestions: ["타겟 고객층과 톤앤매너", "중점 홍보 상품/프로모션 일정", "로고·컬러 등 디자인 가이드"],
    recommendedDraft: request.userDraft || AI_FALLBACK_TEXT,
    fallback: true,
  });

  if (!apiKey) return fallback();

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `당신은 최고 수준의 SNS 전문 마케팅 디렉터입니다.
광고주가 SNS 공식 채널 운영 대행을 위해 사전설문(인테이크)을 작성하고 있습니다.

채널 정보:
- 브랜드명: ${request.context?.companyName || "브랜드"}
- 플랫폼: ${request.context?.platform || "Instagram"}
- 계정 핸들: @${request.context?.handle || "official"}

설문 질문: "${request.question}"
광고주 현재 작성 내용(선택): "${request.userDraft || ""}"

위 질문에 대해 전문적이고 실용적인 답변 초안 1개와 핵심 키워드/팁 3개를 JSON 포맷으로 작성해주세요.
반드시 아래 JSON 포맷으로만 응답하세요:
{
  "suggestions": ["핵심 포인트1", "핵심 포인트2", "핵심 포인트3"],
  "recommendedDraft": "구체적이고 매력적인 권장 답변 본문 문장"
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
    console.error("Gemini snsIntake assist error:", error);
    return fallback();
  }
}
