import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export async function generateSnsCaptionDraft(params: {
  brandName: string;
  platform: string;
  handle: string;
  title: string;
  scheduledOn?: string | null;
  mediaNote?: string | null;
}): Promise<{ caption: string; hashtags: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      caption: "AI 제안 실패 — 직접 입력해주세요.",
      hashtags: `#${params.brandName.replace(/\s+/g, "")} #마케팅`,
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
당신은 트렌디한 감각을 지닌 공식 SNS 마케팅 전문 카피라이터입니다.
아래 브랜드 및 콘텐츠 기획 정보를 바탕으로 고객의 시선을 사로잡는 매력적인 ${params.platform} 캡션 본문과 해시태그를 작성해주세요.

[브랜드 및 채널 정보]
- 브랜드명: ${params.brandName}
- 플랫폼: ${params.platform} (@${params.handle})
- 콘텐츠 제목/주제: ${params.title}
- 비주얼 및 연출 메모: ${params.mediaNote || "없음"}

[출력 형식]
반드시 다음 JSON 객체 형식으로만 응답하세요:
{
  "caption": "자연스러운 이모지와 줄바꿈이 포함된 본문 카피",
  "hashtags": "#브랜드명 #핵심키워드1 #핵심키워드2 #핵심키워드3"
}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        maxOutputTokens: 800,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL,
        },
      },
    });

    const text = response.text || "";
    const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);
    return {
      caption: parsed.caption || "AI 제안 실패 — 직접 입력해주세요.",
      hashtags: parsed.hashtags || `#${params.brandName.replace(/\s+/g, "")}`,
    };
  } catch (error) {
    console.error("Gemini SNS Caption Assist Error:", error);
    return {
      caption: "AI 제안 실패 — 직접 입력해주세요.",
      hashtags: `#${params.brandName.replace(/\s+/g, "")} #마케팅`,
    };
  }
}