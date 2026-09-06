/**
 * Gemini 공통 설정.
 * - 모델은 한 곳에서만 바꾼다.
 * - thinkingLevel은 반드시 MINIMAL: 기본값이면 thinking 토큰이 출력 예산을 잡아먹어 답변이 중간에 잘린다.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

export const AI_FALLBACK_TEXT = "AI 제안 실패 — 직접 입력해주세요.";

/**
 * 사전조사/사전설문 답변은 {질문id: 답변} 형태로 저장된다.
 * AI 프롬프트에 넣을 때는 질문 문구를 키로 바꿔야 모델이 맥락을 이해한다.
 */
export function labelAnswers(
  answers: Record<string, string> | null | undefined,
  questions: { id: string; question: string }[]
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!answers) return out;
  const byId = new Map(questions.map((q) => [q.id, q.question]));
  for (const [id, value] of Object.entries(answers)) {
    if (!value) continue;
    out[byId.get(id) || id] = value;
  }
  return out;
}

/** 모델이 ```json 펜스를 붙여 보낼 때가 있어 벗겨낸다. */
export function parseJsonLoose(text: string): unknown {
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(clean);
}
