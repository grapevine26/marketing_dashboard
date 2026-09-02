import { GoogleGenAI } from "@google/genai";

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
}

export async function assistSnsIntake(
  request: SnsIntakeAssistRequest
): Promise<SnsIntakeAssistResponse> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      suggestions: [
        "2030 타겟 맞춤형 친근한 톤앤매너",
        "비포&애프터 및 리얼 텍스처 중심 비주얼",
        "주 3회 릴스/숏폼 중심 트렌드 연계",
      ],
      recommendedDraft: request.userDraft
        ? `${request.userDraft} (추가 권장: 타겟의 페인포인트를 해결하는 실용적인 팁과 브랜드만의 차별화된 감성을 균형있게 전달해주세요.)`
        : "타겟 고객층(2030 여성)에게 자연스러운 공감대를 형성하며, 제품의 핵심 효능과 트렌디한 라이프스타일을 결합한 비주얼 중심의 콘텐츠를 지향합니다.",
    };
  }

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
      model: "gemini-2.5-flash",
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
        : ["트렌디한 비주얼 강조", "타겟 공감형 스토리텔링", "명확한 콜투액션(CTA)"],
      recommendedDraft:
        parsed.recommendedDraft || "브랜드 정체성을 살린 감각적인 비주얼과 고객 소통을 강화하는 방향으로 운영하고자 합니다.",
    };
  } catch (error) {
    console.error("Gemini snsIntake assist error:", error);
    return {
      suggestions: ["핵심 제품 소구점 명확화", "친근하고 직관적인 카피", "릴스/숏폼 최적화"],
      recommendedDraft: request.userDraft || "브랜드 타겟 고객에게 신뢰와 흥미를 유발할 수 있는 콘텐츠 방향성을 추구합니다.",
    };
  }
}