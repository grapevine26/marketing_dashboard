import type { PptTemplate, PreSurveyQuestion } from "./types";

/**
 * 코드에 박힌 기본값.
 *
 * - 기본 질문: 단일 행 템플릿 테이블이 비어 있을 때 앱이 채워 넣는다. 마이그레이션 SQL 에
 *   같은 값을 또 적지 않으려고 여기 한 곳에만 둔다.
 * - 내장 PPT 템플릿: DB 에 저장하지 않는다. 코드가 바뀌면 바로 반영되어야 하기 때문이다.
 *   사용자가 지운 내장 템플릿만 hidden_builtin_templates 에 기록한다.
 */

export const DEFAULT_PRE_SURVEY_QUESTIONS: PreSurveyQuestion[] = [
  { id: "q1", question: "브랜드 및 제품의 핵심 셀링 포인트(USP)는 무엇인가요?", required: true, placeholder: "예: 3중 히알루론산 100시간 보습" },
  { id: "q2", question: "희망하는 인플루언서의 주요 연령대 및 카테고리는 어떻게 되나요?", required: true, placeholder: "예: 2030 뷰티/스킨케어 전문 크리에이터" },
  { id: "q3", question: "콘텐츠 내 반드시 포함되어야 할 필수 키워드/해시태그가 있나요?", required: true, placeholder: "예: #글로우랩 #하이드라앰플 #속건조해결" },
  { id: "q4", question: "주의해야 할 경쟁사 언급 금지 또는 가이드라인이 있나요?", required: false, placeholder: "예: 타사 제품과의 직접적인 비교 지양" },
];

export const DEFAULT_SNS_INTAKE_QUESTIONS: PreSurveyQuestion[] = [
  { id: "sq1", question: "브랜드 톤앤매너와 핵심 고객 페르소나는 어떻게 되나요?", required: true, placeholder: "예: 20대 대학생/사회초년생, 친근하고 트렌디한 무드" },
  { id: "sq2", question: "월간 중점 홍보 상품 및 프로모션 일정이 있나요?", required: true, placeholder: "예: 9월 셋째주 올영세일 프로모션 집중" },
  { id: "sq3", question: "피드 내 로고 사용 규정 및 디자인 필수 가이드라인이 있나요?", required: false, placeholder: "예: 브랜드 컬러(#3B82F6) 포인트 10% 이상 적용" },
];

export const BUILTIN_EVENT_TEMPLATE_ID = "b0000000-0000-4000-8000-000000000001";
export const BUILTIN_SNS_TEMPLATE_ID = "b0000000-0000-4000-8000-000000000002";
export const BUILTIN_REPORT_TEMPLATE_ID = "b0000000-0000-4000-8000-000000000003";

export const BUILTIN_EVENT_PLACEHOLDERS = ["브랜드명", "행사명", "행사일시", "행사장소", "행사개요", "프로그램"];
export const BUILTIN_SNS_PLACEHOLDERS = ["브랜드명", "채널명", "계약기간", "운영목표", "타겟오디언스", "콘텐츠방향성", "월별계획"];
export const BUILTIN_REPORT_PLACEHOLDERS = [
  "보고서제목", "캠페인명", "브랜드명", "캠페인유형", "생성일시",
  "총지원자", "최종선정", "예비선정", "업로드완료", "총조회수", "총인게이지먼트", "인게이지먼트율",
  "총평", "차트:성과", "표:인플루언서",
];

/** 순서가 곧 목록 순서다 (행사, SNS, 보고서). */
export const BUILTIN_TEMPLATES: Record<string, { kind: PptTemplate["kind"]; name: string; placeholders: string[] }> = {
  [BUILTIN_EVENT_TEMPLATE_ID]: { kind: "event", name: "기본 인플루언서 행사 운영안 템플릿", placeholders: BUILTIN_EVENT_PLACEHOLDERS },
  [BUILTIN_SNS_TEMPLATE_ID]: { kind: "sns", name: "기본 SNS 공식 채널 운영 제안서 템플릿", placeholders: BUILTIN_SNS_PLACEHOLDERS },
  [BUILTIN_REPORT_TEMPLATE_ID]: { kind: "report", name: "기본 시딩 결과보고서 템플릿", placeholders: BUILTIN_REPORT_PLACEHOLDERS },
};

export function isBuiltinTemplateId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILTIN_TEMPLATES, id);
}

/** 내장 템플릿 하나를 PptTemplate 형태로 만든다. 없는 id 면 null. */
export function builtinTemplate(id: string): PptTemplate | null {
  const t = BUILTIN_TEMPLATES[id];
  if (!t) return null;
  return {
    id,
    kind: t.kind,
    name: t.name,
    builtin: true,
    placeholders: t.placeholders,
    // 내장은 업로드 시각이 없다. 목록 정렬에서 항상 앞에 오도록 epoch 를 준다.
    uploaded_at: "1970-01-01T00:00:00.000Z",
  };
}

export function allBuiltinTemplates(): PptTemplate[] {
  return Object.keys(BUILTIN_TEMPLATES).map((id) => builtinTemplate(id)!);
}
