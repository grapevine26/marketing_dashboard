import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { GEMINI_MODEL, AI_FALLBACK_TEXT, parseJsonLoose } from "./config";
import { snsCaptionPrompt } from "./prompts";
import { withCache } from "./cache";

export interface SnsCaptionParams {
  brandName: string;
  platform: string;
  handle: string;
  title: string;
  scheduledOn?: string | null;
  mediaNote?: string | null;
  forceRefresh?: boolean;
}

export interface SnsCaptionResult {
  caption: string;
  hashtags: string;
  fallback: boolean;
}

export async function generateSnsCaptionDraft(params: SnsCaptionParams): Promise<SnsCaptionResult> {
  const fallback = (): SnsCaptionResult => ({
    caption: AI_FALLBACK_TEXT,
    hashtags: `#${params.brandName.replace(/\s+/g, "")}`,
    fallback: true,
  });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback();

  const shouldBypass = Boolean(params.forceRefresh);
  const cachePayload = {
    brandName: params.brandName,
    platform: params.platform,
    handle: params.handle,
    title: params.title,
    scheduledOn: params.scheduledOn,
    mediaNote: params.mediaNote,
  };

  return withCache(
    "snsCaption",
    cachePayload,
    async () => {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: snsCaptionPrompt(params),
          config: {
            responseMimeType: "application/json",
            maxOutputTokens: 800,
            temperature: 0.8,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        });

        const parsed = parseJsonLoose(response.text || "") as { caption?: unknown; hashtags?: unknown };
        if (typeof parsed.caption !== "string" || !parsed.caption.trim()) return fallback();
        return {
          caption: parsed.caption,
          hashtags: typeof parsed.hashtags === "string" ? parsed.hashtags : `#${params.brandName.replace(/\s+/g, "")}`,
          fallback: false,
        };
      } catch (error) {
        console.error("Gemini SNS Caption Assist Error:", error);
        return fallback();
      }
    },
    (result) => !result.fallback,
    { bypass: shouldBypass }
  );
}
