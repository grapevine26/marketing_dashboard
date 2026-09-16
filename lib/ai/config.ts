/**
 * Gemini 공통 설정.
 * - 모델은 한 곳에서만 바꾼다.
 * - thinkingLevel은 반드시 MINIMAL: 기본값이면 thinking 토큰이 출력 예산을 잡아먹어 답변이 중간에 잘린다.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

export const AI_FALLBACK_TEXT = "AI 제안 실패 — 직접 입력해주세요.";

/**
 * 폴백이 된 이유. `fallback: true` 일 때만 채운다.
 *
 * 나누는 기준은 하나뿐이다 — **모델을 실제로 불렀는가(= 돈이 나갔는가).**
 * 호출 횟수 제한을 돌려줄지 말지가 여기서 갈린다.
 *
 * - `no-key`      키가 없어 부르지도 못했다.
 * - `call-failed` 부르다 실패했다(네트워크·타임아웃·API 오류). 결과를 받지 못했다.
 * - `bad-output`  모델이 응답했는데 쓸 수 없었다(JSON 깨짐, 초안 비어 있음). **이미 불렀다.**
 */
export type AiFallbackReason = "no-key" | "call-failed" | "bad-output";

/**
 * 이 폴백은 사용 횟수를 돌려줘야 하는가.
 *
 * `bad-output` 은 돌려주지 않는다. 응답 파싱이 깨지도록 유도하는 입력을 반복하면
 * 질문당 상한(하루 3회)을 무한히 우회할 수 있기 때문이다. 모델은 이미 불렸고 돈은 나갔다.
 *
 * 이유를 **모르면(undefined) 돌려주지 않는다.** 모르는 것을 환불로 치면 위 우회 경로가
 * 이유를 비운 응답 하나로 되살아난다. 안전한 쪽은 차감을 유지하는 쪽이다.
 */
export function isRefundableFallback(reason?: AiFallbackReason): boolean {
  return reason === "no-key" || reason === "call-failed";
}

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
