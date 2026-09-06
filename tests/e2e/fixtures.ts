/** lib/db/index.ts getInitialData()의 샘플 데이터 식별자. 매 실행마다 새 DB로 시작하므로 항상 존재한다. */
export const SAMPLE = {
  campaignId: "c1a2b3c4-0001-4000-8000-000000000001",
  eventId: "e1a2b3c4-0001-4000-8000-000000000001",
  snsAccountId: "s1a2b3c4-0001-4000-8000-000000000001",
  preSurveyToken: "ps_tok_demo_12345",
  applyToken: "apply_tok_demo_12345",
  applicantsShareToken: "app_share_tok_12345",
  seedingShareToken: "seed_share_tok_12345",
  snsIntakeToken: "sns_intake_tok_12345",
  snsApprovalToken: "sns_appr_tok_12345",
  /** 초기 상태 applied 인 지원자 (연락처 010-9988-7766) */
  appliedApplicantName: "박민우",
  appliedApplicantContact: "010-9988-7766",
  /** 초기 상태 pending_approval 인 SNS 콘텐츠 */
  pendingContentTitle: "3초 속건조 탈출! 하이드라 세럼 제형 릴스",
  pendingContentMediaNote: "유리볼 롤링 클로즈업",
} as const;

export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
