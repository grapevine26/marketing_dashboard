import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export async function generateEventPlanDraft(params: {
  eventName: string;
  brandName: string;
  eventAt: string | null;
  venue: string | null;
  preSurveyAnswers?: Record<string, string>;
  placeholders: string[];
}): Promise<Record<string, string>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const fallback: Record<string, string> = {};
    for (const ph of params.placeholders) {
      fallback[ph] = `[${ph}] AI 제안 실패 — 직접 입력해주세요.`;
    }
    return fallback;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
당신은 하이엔드 뷰티 & 라이프스타일 마케팅 에이전시의 수석 이벤트 디렉터입니다.
아래 행사 정보 및 사전조사 요구사항을 바탕으로 행사 운영안 PPT의 각 슬라이드 치환 항목({{placeholder}})에 들어갈 전문적이고 매력적인 한국어 문안을 작성해주세요.

[행사 기본 정보]
- 브랜드명: ${params.brandName}
- 행사명: ${params.eventName}
- 행사 일시: ${params.eventAt || "미정"}
- 장소: ${params.venue || "미정"}
- 브랜드 사전조사 내용: ${JSON.stringify(params.preSurveyAnswers || {})}

[작성해야 할 플레이스홀더 목록]
${params.placeholders.map((p) => `- ${p}`).join("\n")}

[출력 형식]
반드시 다음 JSON 객체 형식으로만 응답하세요. 마크다운이나 다른 설명은 절대 추가하지 마세요:
{
  ${params.placeholders.map((p) => `"${p}": "문안 내용"`).join(",\n  ")}
}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        maxOutputTokens: 1200,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL,
        },
      },
    });

    const text = response.text || "";
    const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);
    return parsed;
  } catch (error) {
    console.error("Gemini Event Plan Assist Error:", error);
    const fallback: Record<string, string> = {};
    for (const ph of params.placeholders) {
      fallback[ph] = `[${ph}] AI 제안 실패 — 직접 입력해주세요.`;
    }
    return fallback;
  }
}