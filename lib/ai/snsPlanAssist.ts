import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { GEMINI_MODEL, AI_FALLBACK_TEXT, parseJsonLoose } from "./config";

export interface SnsPlanDraftParams {
  brandName: string;
  platform: string;
  handle: string;
  startsOn?: string | null;
  endsOn?: string | null;
  /** {질문 문구: 답변} 형태 (labelAnswers로 변환해서 넘길 것) */
  intakeAnswers?: Record<string, string>;
  /** 초안을 만들 플레이스홀더. 필드별 버튼이면 1개만 넘긴다. */
  placeholders: string[];
  currentValues?: Record<string, string>;
}

export async function generateSnsPlanDraft(params: SnsPlanDraftParams): Promise<Record<string, string>> {
  const fallback = () =>
    Object.fromEntries(params.placeholders.map((ph) => [ph, AI_FALLBACK_TEXT]));

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || params.placeholders.length === 0) return fallback();

  try {
    const ai = new GoogleGenAI({ apiKey });
    const answerLines = Object.entries(params.intakeAnswers || {})
      .map(([q, a]) => `  - ${q}: ${a}`)
      .join("\n");
    const currentLines = Object.entries(params.currentValues || {})
      .filter(([k, v]) => v && !params.placeholders.includes(k))
      .map(([k, v]) => `  - ${k}: ${v}`)
      .join("\n");

    const prompt = `
당신은 브랜드 공식 SNS 채널을 총괄하는 소셜미디어 전략 컨설턴트입니다.
아래 브랜드 정보 및 사전설문 응답을 바탕으로 SNS 운영 제안서 PPT의 치환 항목에 들어갈 전략적이고 설득력 있는 문안을 작성해주세요.

[계정 정보]
- 브랜드명: ${params.brandName}
- 플랫폼: ${params.platform} (@${params.handle})
- 계약 기간: ${params.startsOn || "미정"} ~ ${params.endsOn || "미정"}
- 광고주 사전설문 응답:
${answerLines || "  (없음)"}
${currentLines ? `\n[담당자가 이미 작성한 다른 항목 — 톤을 맞출 것]\n${currentLines}` : ""}

[작성해야 할 항목]
${params.placeholders.map((p) => `- ${p}`).join("\n")}

[작성 규칙]
- 월별 계획은 위 계약 기간에 실제로 포함되는 달(예: 계약이 9월~11월이면 "9월", "10월", "11월")로 표기하세요. "1개월차"나 임의의 달을 쓰지 마세요.
- 마크다운 문법(**, #, - 목록 기호 등)을 쓰지 말고 순수 텍스트로 작성하세요.

[출력 형식]
반드시 다음 JSON 객체 형식으로만 응답하세요. 여러 줄이 필요한 항목은 \\n으로 줄바꿈하세요:
{
  ${params.placeholders.map((p) => `"${p}": "전략적 문안 내용"`).join(",\n  ")}
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
    console.error("Gemini SNS Plan Assist Error:", error);
    return fallback();
  }
}
