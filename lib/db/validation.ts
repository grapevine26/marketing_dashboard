import type {
  ApplicantStatus,
  CampaignStatus,
  EventRsvpStatus,
  EventStatus,
  PreSurveyQuestion,
  ProgressStage,
  SnsAccount,
} from "./types";

/** 입력값이 규칙에 어긋날 때 던진다. 서버 액션은 이 메시지를 그대로 화면에 보여준다. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * uuid 형식인가.
 * URL 파라미터로 들어온 엉뚱한 값을 uuid 컬럼에 대고 조회하면 Postgres 가 타입 에러를 낸다.
 * 그러면 "없음"(404) 이어야 할 것이 서버 오류(500) 가 된다. 조회 전에 이걸로 거른다.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function requireText(value: unknown, label: string, max = 500): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${label}을(를) 입력해주세요.`);
  }
  if (value.trim().length > max) {
    throw new ValidationError(`${label}은(는) ${max}자 이내로 입력해주세요.`);
  }
  return value.trim();
}

export function optionalText(value: unknown, max = 2000): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export function nonNegativeInt(value: unknown, label: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new ValidationError(`${label}은(는) 0 이상의 정수여야 합니다.`);
  }
  return n;
}

export function optionalDate(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${label} 형식이 올바르지 않습니다. (YYYY-MM-DD)`);
  }
  return value;
}

export function optionalIsoDateTime(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${label} 형식이 올바르지 않습니다.`);
  }
  return new Date(value).toISOString();
}

export function optionalUrl(value: unknown, label: string): string | null {
  const t = optionalText(value, 2000);
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    return u.toString();
  } catch {
    throw new ValidationError(`${label}은(는) http(s)로 시작하는 URL이어야 합니다.`);
  }
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError(`${label} 값이 올바르지 않습니다.`);
  }
  return value as T;
}

/** 질문 목록 정리. 사전조사 템플릿·캠페인별 질문·SNS 인테이크 질문이 같은 규칙을 쓴다. */
export function cleanQuestions(questions: unknown): PreSurveyQuestion[] {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new ValidationError("최소 1개 이상의 질문이 필요합니다.");
  }
  return questions.map((q: PreSurveyQuestion) => ({
    id: requireText(q.id, "질문 ID", 100),
    question: requireText(q.question, "질문 내용", 500),
    placeholder: optionalText(q.placeholder, 500) ?? undefined,
    type: q.type,
    required: Boolean(q.required),
  }));
}

/** 운영안 치환값 정리. 키는 공백을 떼고, 값은 문자열로 맞춘다. */
export function cleanFieldValues(values: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values || {})) {
    if (typeof k !== "string" || !k.trim()) continue;
    out[k.trim()] = typeof v === "string" ? v.slice(0, 5000) : String(v ?? "");
  }
  return out;
}

export const CAMPAIGN_STATUSES: CampaignStatus[] = ["draft", "recruiting", "selecting", "seeding", "reporting", "completed"];
export const APPLICANT_STATUSES: ApplicantStatus[] = ["applied", "selected", "reserved", "rejected"];
export const PROGRESS_STAGES: ProgressStage[] = ["선정완료", "발송완료", "가이드전달완료", "수령완료", "방문완료", "확정완료", "업로드완료"];
export const EVENT_STATUSES: EventStatus[] = ["preparing", "done", "canceled"];
export const RSVP_STATUSES: EventRsvpStatus[] = ["pending", "attending", "not_attending"];
export const SNS_PLATFORMS: SnsAccount["platform"][] = ["instagram", "youtube", "tiktok", "other"];
