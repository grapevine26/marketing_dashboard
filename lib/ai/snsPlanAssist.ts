import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { GEMINI_MODEL, AI_FALLBACK_TEXT, parseJsonLoose } from "./config";
import { snsPlanPrompt } from "./prompts";
import { withCache } from "./cache";

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
  const fallback = () => Object.fromEntries(params.placeholders.map((ph) => [ph, AI_FALLBACK_TEXT]));

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || params.placeholders.length === 0) return fallback();

  return withCache(
    "snsPlan",
    params,
    async () => {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: snsPlanPrompt(params),
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
    },
    (result) => !Object.values(result).some((v) => v === AI_FALLBACK_TEXT)
  );
}
