import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { GEMINI_MODEL, AI_FALLBACK_TEXT, parseJsonLoose } from "./config";

export interface EventPlanDraftParams {
  eventName: string;
  brandName: string;
  eventAt: string | null;
  venue: string | null;
  /** {질문 문구: 답변} 형태 (labelAnswers로 변환해서 넘길 것) */
  preSurveyAnswers?: Record<string, string>;
  /** 초안을 만들 플레이스홀더. 필드별 버튼이면 1개만 넘긴다. */
  placeholders: string[];
  /** 담당자가 이미 채운 다른 필드 값 — 맥락 참고용 */
  currentValues?: Record<string, string>;
}

export async function generateEventPlanDraft(params: EventPlanDraftParams): Promise<Record<string, string>> {
  const fallback = () =>
    Object.fromEntries(params.placeholders.map((ph) => [ph, AI_FALLBACK_TEXT]));

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || params.placeholders.length === 0) return fallback();

  try {
    const ai = new GoogleGenAI({ apiKey });
    const answerLines = Object.entries(params.preSurveyAnswers || {})
      .map(([q, a]) => `  - ${q}: ${a}`)
      .join("\n");
    const currentLines = Object.entries(params.currentValues || {})
      .filter(([k, v]) => v && !params.placeholders.includes(k))
      .map(([k, v]) => `  - ${k}: ${v}`)
      .join("\n");

    const prompt = `
당신은 하이엔드 뷰티 & 라이프스타일 마케팅 에이전시의 수석 이벤트 디렉터입니다.
아래 행사 정보 및 사전조사 요구사항을 바탕으로 행사 운영안 PPT의 치환 항목에 들어갈 전문적이고 매력적인 한국어 문안을 작성해주세요.

[행사 기본 정보]
- 브랜드명: ${params.brandName}
- 행사명: ${params.eventName}
- 행사 일시: ${params.eventAt || "미정"}
- 장소: ${params.venue || "미정"}
- 브랜드 사전조사 내용:
${answerLines || "  (없음)"}
${currentLines ? `\n[담당자가 이미 작성한 다른 항목 — 톤을 맞출 것]\n${currentLines}` : ""}

[작성해야 할 항목]
${params.placeholders.map((p) => `- ${p}`).join("\n")}

[출력 형식]
반드시 다음 JSON 객체 형식으로만 응답하세요. 마크다운이나 다른 설명은 절대 추가하지 마세요. 여러 줄이 필요한 항목은 \\n으로 줄바꿈하세요:
{
  ${params.placeholders.map((p) => `"${p}": "문안 내용"`).join(",\n  ")}
}
`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 1200,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });

    const parsed = parseJsonLoose(response.text || "") as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const ph of params.placeholders) {
      const v = parsed?.[ph];
      out[ph] = typeof v === "string" && v.trim() ? v : AI_FALLBACK_TEXT;
    }
    return out;
  } catch (error) {
    console.error("Gemini Event Plan Assist Error:", error);
    return fallback();
  }
}
