/**
 * DB 계층 진입점.
 *
 * 저장소는 Supabase Postgres 다. 구현은 도메인별 모듈에 있고 여기서는 다시 내보내기만 한다.
 * 호출 코드는 `@/lib/db` 에서 함수 이름으로 가져오므로 모듈이 어떻게 나뉘었는지 몰라도 된다.
 *
 * - 서버 전용이다. `lib/supabase/admin.ts` 가 service_role 키를 쓴다.
 * - 첨부 파일(시안 미디어, PPT 템플릿)은 DB 가 아니라 파일 저장소(`./storage`)에 있다.
 */

export { ValidationError } from "./validation";
export * from "./audit";
export * from "./campaigns";
export * from "./applicants";
export * from "./reports";
export * from "./ppt-templates";
export * from "./events";
export * from "./sns";
export { getUploadsDirPath } from "./storage";
export { ALLOWED_SNS_MEDIA_MIME_TYPES, MAX_SNS_MEDIA_BYTES } from "./types";
export {
  BUILTIN_REPORT_TEMPLATE_ID,
  BUILTIN_EVENT_PLACEHOLDERS,
  BUILTIN_SNS_PLACEHOLDERS,
  BUILTIN_REPORT_PLACEHOLDERS,
} from "./defaults";

// 예전 이름으로 부르던 곳을 위한 별칭.
export {
  savePreSurveyResponse as upsertPreSurveyResponse,
  getFormConfig as getCampaignFormConfig,
  saveFormConfig as upsertCampaignFormConfig,
} from "./campaigns";
export { saveReportSections as updateReportCustomSections } from "./reports";
