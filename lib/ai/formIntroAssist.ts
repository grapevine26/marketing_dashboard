import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { GEMINI_MODEL } from "./config";

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
  const apiKey = process.env.GEMINI_API_KEY;
  const fallbackText = `안녕하세요! ${request.companyName}의 ${request.campaignName} 체험단에 오신 것을 환영합니다 ✨\n\n솔직하고 감각적인 리뷰 콘텐츠를 함께 만들어갈 인플루언서 분들의 많은 관심과 지원 부탁드립니다.`;

  if (!apiKey) return { text: fallbackText, fallback: true };

  try {
    const ai = new GoogleGenAI({ apiKey });
    const answerLines = Object.entries(request.preSurveyAnswers || {})
      .map(([q, a]) => `  - ${q}: ${a}`)
      .join("\n");
    const prompt = `당신은 인플루언서 모집 신청폼을 기획하는 전문 마케터입니다.
캠페인 정보:
- 캠페인명: ${request.campaignName}
- 브랜드명: ${request.companyName}
- 유형: ${request.campaignType === "shipping" ? "제품배송형 체험단" : "현장방문형 체험단"}
- 브랜드 사전조사 답변:
${answerLines || "  (없음)"}

인플루언서들의 지원율을 높이고 브랜드의 매력을 전달할 수 있는 매력적이고 친근한 인플루언서 모집 신청폼 상단 소개글(Intro Text)을 작성해주세요.
이모지를 적절히 활용하고, 2~4문단 정도로 깔끔하게 작성해주세요.
마크다운 문법(**, #, 목록 기호 등)은 절대 쓰지 말고, 그대로 화면에 붙여넣을 수 있는 순수 텍스트로 소개글 본문만 출력하세요.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
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
}
