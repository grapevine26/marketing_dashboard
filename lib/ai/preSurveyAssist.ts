import { GoogleGenAI } from "@google/genai";

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
}

export async function assistPreSurvey(
  request: PreSurveyAssistRequest
): Promise<PreSurveyAssistResponse> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      suggestions: [
        "핵심 소구점과 특허 성분 강조",
        "2030 타겟 맞춤형 톤앤매너 설정",
        "필수 해시태그 및 비포&애프터 컷 가이드",
      ],
      recommendedDraft: request.userDraft
        ? `${request.userDraft} (보완: 타겟 고객을 위한 핵심 효능과 일상 속 루틴을 자연스럽게 보여주세요.)`
        : "주요 타겟 고객층에게 어필할 수 있는 제품의 핵심 특장점을 2~3가지 명확히 기재해 주세요.",
    };
  }

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
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "{}";
    const parsed = JSON.parse(text);

    return {
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions
        : ["핵심 효능 강조", "사용감 중심 리뷰", "필수 해시태그 안내"],
      recommendedDraft:
        parsed.recommendedDraft || "질문에 맞는 명확한 가이드를 작성해주세요.",
    };
  } catch (error) {
    console.error("Gemini preSurvey assist error:", error);
    return {
      suggestions: ["제품 특징 명확화", "타겟 연령대 정의", "필수 가이드 수록"],
      recommendedDraft: request.userDraft || "상세한 제품 특성과 인플루언서 가이드를 입력해주세요.",
    };
  }
}
