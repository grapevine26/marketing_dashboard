import { GoogleGenAI } from "@google/genai";

export interface FormIntroAssistRequest {
  campaignName: string;
  companyName: string;
  campaignType: string;
  preSurveyAnswers?: Record<string, string>;
}

export async function generateFormIntro(
  request: FormIntroAssistRequest
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return `안녕하세요! ${request.companyName}의 ${request.campaignName} 체험단에 오신 것을 환영합니다 ✨\n\n솔직하고 감각적인 리뷰 콘텐츠를 함께 만들어갈 인플루언서 분들의 많은 관심과 지원 부탁드립니다.`;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `당신은 인플루언서 모집 신청폼을 기획하는 전문 마케터입니다.
캠페인 정보:
- 캠페인명: ${request.campaignName}
- 브랜드명: ${request.companyName}
- 유형: ${request.campaignType === "shipping" ? "제품배송형 체험단" : "현장방문형 체험단"}
- 사전조사 답변 내용: ${JSON.stringify(request.preSurveyAnswers || {})}

인플루언서들의 지원율을 높이고 브랜드의 매력을 전달할 수 있는 매력적이고 친근한 인플루언서 모집 신청폼 상단 소개글(Intro Text)을 작성해주세요.
이모지를 적절히 활용하고, 2~4문단 정도로 깔끔하게 작성해주세요.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
    });

    return (
      response.text ||
      `안녕하세요! ${request.companyName}의 신제품 체험단에 참여할 인플루언서를 모집합니다.`
    );
  } catch (error) {
    console.error("Gemini formIntro assist error:", error);
    return `안녕하세요! ${request.companyName}의 ${request.campaignName} 체험단에 오신 것을 환영합니다 ✨\n\n솔직하고 감각적인 리뷰 콘텐츠를 함께 만들어갈 인플루언서 분들의 많은 관심과 지원 부탁드립니다.`;
  }
}
