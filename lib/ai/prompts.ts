/**
 * AI 프롬프트 모음.
 * 톤이나 규칙을 바꿀 때 이 파일만 고치면 되도록 5개 어시스트의 프롬프트를 한곳에 모았다.
 */

/** 모든 프롬프트 공통 규칙 */
export const COMMON_RULES = `[공통 작성 규칙]
- 마크다운 문법(**, ##, - 목록 기호 등)을 절대 쓰지 말고 그대로 화면·문서에 넣을 수 있는 순수 텍스트로 작성하세요.
- 주어진 사실(날짜, 장소, 브랜드명, 계약 기간)을 임의로 바꾸거나 지어내지 마세요.
- 한국어로 작성하세요.`;

function answerBlock(answers: Record<string, string> | undefined, emptyLabel = "(없음)"): string {
  const lines = Object.entries(answers || {})
    .filter(([, v]) => v)
    .map(([q, a]) => `  - ${q}: ${a}`);
  return lines.length ? lines.join("\n") : `  ${emptyLabel}`;
}

function jsonShape(keys: string[], valueHint: string): string {
  return `{\n  ${keys.map((k) => `"${k}": "${valueHint}"`).join(",\n  ")}\n}`;
}

// ---------- 사전조사 (A) ----------

export function preSurveyPrompt(params: {
  question: string;
  userDraft?: string;
  campaignName?: string;
  companyName?: string;
  campaignType?: string;
}): string {
  return `당신은 인플루언서 마케팅 전문 에이전시의 시니어 마케터입니다.

[캠페인 정보]
- 캠페인명: ${params.campaignName || "미정"}
- 브랜드명: ${params.companyName || "미정"}
- 유형: ${params.campaignType === "shipping" ? "제품배송형" : "현장방문형"}

[사전조사 질문]
${params.question}

[광고주가 이미 적어둔 내용]
${params.userDraft || "(없음)"}

위 질문에 광고주가 그대로 제출할 수 있는 구체적인 답변 초안 1개와, 참고할 핵심 키워드 3개를 작성하세요.

${COMMON_RULES}

[출력 형식]
반드시 다음 JSON 형식으로만 응답하세요:
{
  "suggestions": ["포인트1", "포인트2", "포인트3"],
  "recommendedDraft": "추천 답변 초안 본문"
}`;
}

// ---------- 신청폼 소개글 (A) ----------

export function formIntroPrompt(params: {
  campaignName: string;
  companyName: string;
  campaignType: string;
  preSurveyAnswers?: Record<string, string>;
}): string {
  return `당신은 인플루언서 모집 신청폼을 기획하는 전문 마케터입니다.

[캠페인 정보]
- 캠페인명: ${params.campaignName}
- 브랜드명: ${params.companyName}
- 유형: ${params.campaignType === "shipping" ? "제품배송형 체험단" : "현장방문형 체험단"}
- 브랜드 사전조사 답변:
${answerBlock(params.preSurveyAnswers)}

인플루언서의 지원율을 높이고 브랜드의 매력을 전달하는 신청폼 상단 소개글을 작성하세요.
이모지를 적절히 활용하고 2~4문단으로 작성하며, 소개글 본문만 출력하세요.

${COMMON_RULES}`;
}

// ---------- 행사 운영안 (B) ----------

export function eventPlanPrompt(params: {
  brandName: string;
  eventName: string;
  eventAt: string | null;
  venue: string | null;
  preSurveyAnswers?: Record<string, string>;
  placeholders: string[];
  currentValues?: Record<string, string>;
}): string {
  const others = Object.entries(params.currentValues || {})
    .filter(([k, v]) => v && !params.placeholders.includes(k))
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");

  return `당신은 하이엔드 뷰티 & 라이프스타일 마케팅 에이전시의 수석 이벤트 디렉터입니다.
아래 정보를 바탕으로 행사 운영안 PPT의 각 항목에 들어갈 문안을 작성하세요.

[행사 기본 정보]
- 브랜드명: ${params.brandName}
- 행사명: ${params.eventName}
- 행사 일시: ${params.eventAt || "미정"}
- 장소: ${params.venue || "미정"}
- 브랜드 사전조사 내용:
${answerBlock(params.preSurveyAnswers)}
${others ? `\n[담당자가 이미 작성한 다른 항목 — 톤을 맞출 것]\n${others}` : ""}

[작성할 항목]
${params.placeholders.map((p) => `- ${p}`).join("\n")}

${COMMON_RULES}
- 각 항목 값은 PPT 슬라이드에 그대로 들어갑니다.
- 타임테이블처럼 여러 줄이 필요하면 \\n으로 줄바꿈하세요.

[출력 형식]
반드시 다음 JSON 형식으로만 응답하세요:
${jsonShape(params.placeholders, "문안 내용")}`;
}

// ---------- SNS 캡션 (C) ----------

export function snsCaptionPrompt(params: {
  brandName: string;
  platform: string;
  handle: string;
  title: string;
  scheduledOn?: string | null;
  mediaNote?: string | null;
}): string {
  return `당신은 트렌디한 감각을 지닌 공식 SNS 마케팅 전문 카피라이터입니다.
아래 정보를 바탕으로 ${params.platform} 캡션 본문과 해시태그를 작성하세요.

[브랜드 및 채널 정보]
- 브랜드명: ${params.brandName}
- 플랫폼: ${params.platform} (@${params.handle})
- 콘텐츠 제목/주제: ${params.title}
- 발행 예정일: ${params.scheduledOn || "미정"}
- 비주얼 및 연출 메모: ${params.mediaNote || "없음"}

${COMMON_RULES}
- 캡션은 그대로 게시할 수 있어야 합니다. 이모지와 줄바꿈은 자연스럽게 사용하세요.
- 해시태그는 5~10개, 각각 #으로 시작하고 공백으로 구분하세요.

[출력 형식]
반드시 다음 JSON 형식으로만 응답하세요:
{
  "caption": "본문 카피",
  "hashtags": "#브랜드명 #핵심키워드1 #핵심키워드2"
}`;
}

// ---------- SNS 사전설문 (C) ----------

export function snsIntakePrompt(params: {
  question: string;
  userDraft?: string;
  companyName?: string;
  platform?: string;
  handle?: string;
}): string {
  return `당신은 최고 수준의 SNS 전문 마케팅 디렉터입니다.
광고주가 SNS 공식 채널 운영 대행을 위한 사전설문을 작성하고 있습니다.

[채널 정보]
- 브랜드명: ${params.companyName || "브랜드"}
- 플랫폼: ${params.platform || "Instagram"}
- 계정 핸들: @${params.handle || "official"}

[설문 질문]
${params.question}

[광고주가 이미 적어둔 내용]
${params.userDraft || "(없음)"}

위 질문에 광고주가 그대로 제출할 수 있는 답변 초안 1개와 핵심 키워드 3개를 작성하세요.

${COMMON_RULES}

[출력 형식]
반드시 다음 JSON 형식으로만 응답하세요:
{
  "suggestions": ["핵심 포인트1", "핵심 포인트2", "핵심 포인트3"],
  "recommendedDraft": "권장 답변 본문"
}`;
}

// ---------- SNS 운영안 (C) ----------

export function snsPlanPrompt(params: {
  brandName: string;
  platform: string;
  handle: string;
  startsOn?: string | null;
  endsOn?: string | null;
  intakeAnswers?: Record<string, string>;
  placeholders: string[];
  currentValues?: Record<string, string>;
}): string {
  const others = Object.entries(params.currentValues || {})
    .filter(([k, v]) => v && !params.placeholders.includes(k))
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");

  return `당신은 브랜드 공식 SNS 채널을 총괄하는 소셜미디어 전략 컨설턴트입니다.
아래 정보를 바탕으로 SNS 운영 제안서 PPT의 각 항목에 들어갈 문안을 작성하세요.

[계정 정보]
- 브랜드명: ${params.brandName}
- 플랫폼: ${params.platform} (@${params.handle})
- 계약 기간: ${params.startsOn || "미정"} ~ ${params.endsOn || "미정"}
- 광고주 사전설문 응답:
${answerBlock(params.intakeAnswers)}
${others ? `\n[담당자가 이미 작성한 다른 항목 — 톤을 맞출 것]\n${others}` : ""}

[작성할 항목]
${params.placeholders.map((p) => `- ${p}`).join("\n")}

${COMMON_RULES}
- 월별 계획은 위 계약 기간에 실제로 포함되는 달(예: 계약이 9월~11월이면 "9월", "10월", "11월")로 표기하세요. "1개월차"나 계약 기간 밖의 달을 쓰지 마세요.
- 여러 줄이 필요하면 \\n으로 줄바꿈하세요.

[출력 형식]
반드시 다음 JSON 형식으로만 응답하세요:
${jsonShape(params.placeholders, "전략적 문안 내용")}`;
}
