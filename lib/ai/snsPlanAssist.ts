import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export async function generateSnsPlanDraft(params: {
  brandName: string;
  platform: string;
  handle: string;
  startsOn?: string | null;
  endsOn?: string | null;
  intakeAnswers?: Record<string, string>;
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
당신은 브랜드 공식 SNS 채널을 총괄하는 소셜미디어 전략 컨설턴트입니다.
아래 브랜드 정보 및 사전설문 응답을 바탕으로 SNS 운영 제안서 PPT의 각 슬라이드 치환 항목({{placeholder}})에 들어갈 전략적이고 설득력 있는 문안을 작성해주세요.

[계정 정보]
- 브랜드명: ${params.brandName}
- 플랫폼: ${params.platform} (@${params.handle})
- 계약 기간: ${params.startsOn || ""} ~ ${params.endsOn || ""}
- 광고주 사전설문 응답: ${JSON.stringify(params.intakeAnswers || {})}

[작성해야 할 플레이스홀더 목록]
${params.placeholders.map((p) => `- ${p}`).join("\n")}

[출력 형식]
반드시 다음 JSON 객체 형식으로만 응답하세요:
{
  ${params.placeholders.map((p) => `"${p}": "전략적 문안 내용"`).join(",\n  ")}
}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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
    console.error("Gemini SNS Plan Assist Error:", error);
    const fallback: Record<string, string> = {};
    for (const ph of params.placeholders) {
      fallback[ph] = `[${ph}] AI 제안 실패 — 직접 입력해주세요.`;
    }
    return fallback;
  }
}