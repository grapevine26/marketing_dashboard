import { GoogleGenAI } from "@google/genai";

export interface SnsCaptionAssistRequest {
  brandName: string;
  contentType: string;
  topicTitle: string;
  visualDescription: string;
  platform?: string;
}

export interface SnsCaptionAssistResponse {
  captionCopy: string;
  hashtags: string[];
}

export async function generateSnsCaption(
  request: SnsCaptionAssistRequest
): Promise<SnsCaptionAssistResponse> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      captionCopy: `✨ ${request.brandName}의 신규 콘텐츠입니다.\n\n${request.topicTitle}\n\n지금 바로 확인해보세요!`,
      hashtags: [`#${request.brandName.replace(/\s+/g, "")}`, "#신제품", "#뷰티스타그램", "#데일리추천"],
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `당신은 트렌디한 SNS 채널(인스타그램/릴스/틱톡)을 전담 운영하는 전문 소셜 미디어 마케터입니다.

[콘텐츠 정보]
- 브랜드/광고주: ${request.brandName}
- 콘텐츠 형태: ${request.contentType}
- 주제/제목: ${request.topicTitle}
- 비주얼 시안 설명: ${request.visualDescription}
- 플랫폼: ${request.platform || "instagram"}

위 정보를 바탕으로 인게이지먼트와 도달률을 극대화할 수 있는 감각적이고 매력적인 SNS 캡션 본문(이모지 적절히 활용, 줄바꿈 포함)과, 최적의 관련 해시태그 5~8개를 작성해주세요.

반드시 아래 JSON 형식으로만 응답해주세요:
{
  "captionCopy": "캡션 본문 내용...",
  "hashtags": ["#해시태그1", "#해시태그2", "#해시태그3", "#해시태그4", "#해시태그5"]
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
      captionCopy: parsed.captionCopy || "콘텐츠를 확인해보세요!",
      hashtags: Array.isArray(parsed.hashtags)
        ? parsed.hashtags
        : [`#${request.brandName.replace(/\s+/g, "")}`, "#추천"],
    };
  } catch (error) {
    console.error("Gemini SNS Caption error:", error);
    return {
      captionCopy: `✨ ${request.brandName}의 신규 콘텐츠입니다.\n\n${request.topicTitle}`,
      hashtags: [`#${request.brandName.replace(/\s+/g, "")}`, "#신제품", "#추천"],
    };
  }
}