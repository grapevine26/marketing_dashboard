# 마케팅 올인원 대시보드 (B, C, D) 스펙 대조 및 종합 검증 보고서

본 문서는 `HANDOVER-B-C-D.md` 및 공식 설계 스펙(`docs/superpowers/specs/2026-09-01-*.md`), 그리고 계획서(`implementation_plan.md`)를 기준으로 현재 구현된 시스템의 모든 항목을 하나하나 정밀하게 검증한 상세 기록입니다.

---

## 📌 검증 개요
- **검증 일시**: 2026-09-02
- **검증 대상 프로젝트**: `marketing-mvp` (Next.js 16.3.3 Turbopack, React 19, TypeScript, Tailwind CSS)
- **검증 기준 문서**:
  1. `HANDOVER-B-C-D.md` (서브프로젝트 B, C, D 상세 지침서)
  2. `docs/superpowers/specs/2026-09-01-influencer-event-management-design.md` (B 스펙)
  3. `docs/superpowers/specs/2026-09-01-sns-operation-design.md` (C 스펙)
  4. `docs/superpowers/specs/2026-09-01-overview-calendar-design.md` (D 스펙)
  5. `implementation_plan.md` (승인된 구현 계획서)

---
### ✅ [검증 1] 공용 PPT 템플릿 엔진 (`lib/ppt/engine.ts`)
| 항목 | 스펙 요구사항 | 현재 구현 상태 | 검증 결과 |
|---|---|---|---|
| **텍스트 런 분할(Run Split) 해결** | PowerPoint XML 내 `<a:t>` 태그 분할 문제를 문단(`<a:p>`) 단위로 병합하여 치환 | `<a:p>` 내의 모든 `<a:t>`를 순회·연결하여 `{{키워드}}` 감지 후 첫 번째 `<a:t>`에 치환 결과 삽입 및 나머지 런 초기화 | **통과 (PASS)** |
| **플레이스홀더 자동 추출** | `.pptx` 업로드 시 `ppt/slides/slide*.xml`을 순회하여 `{{...}}` 패턴 추출 | `extractPlaceholders(buffer)` 함수를 통해 Set 기반 중복 없는 정렬 배열 반환 | **통과 (PASS)** |
| **특수문자 이스케이프** | XML 문법 깨짐 방지 (`&`, `<`, `>`, `"`, `'`) | `escapeXml` 유틸리티를 적용하여 안전하게 치환 | **통과 (PASS)** |
| **기본 템플릿 자동 생성** | 업로드된 템플릿이 없을 때 기본 내장 템플릿 버퍼 생성 | `generateDefaultPptBuffer("event" | "sns")`로 고화질 16:9 슬라이드 자동 생성 | **통과 (PASS)** |

- **실제 런타임 테스트 결과**:
  - 원본 PPT 생성 크기: `45,360 bytes`
  - 감지된 플레이스홀더: `['브랜드명', '행사명', '행사일시']`
  - 치환 후 잔여 플레이스홀더: `0개` (모든 항목이 대상 텍스트로 100% 치환 완료)

---
### ✅ [검증 2] KST 기준 D-day 계산 로직 (`lib/seeding/dday.ts`)
| 항목 | 스펙 요구사항 | 현재 구현 상태 | 검증 결과 |
|---|---|---|---|
| **타임존 독립성 (KST UTC+9)** | 사용자 브라우저나 서버 로컬 시간대에 상관없이 한국 표준시(UTC+9)로 고정 계산 | `toKstDateString()` 함수에서 `UTC+9` 오프셋을 적용하여 `YYYY-MM-DD` 문자열 산출 | **통과 (PASS)** |
| **날짜 차이 계산 정확도** | 당일(0: D-DAY), 미래(양수: D-n), 과거(음수: D+n 지연) | `Date.UTC` 기준 순수 일자 차이(`86400000ms`) 계산으로 일광절약시간/윤년 오차 방지 | **통과 (PASS)** |
| **D-day 라벨링** | `D-DAY`, `D-n`, `D+n` 규격 | `formatDday(days)` 함수로 규격화 | **통과 (PASS)** |
| **긴급/지연 톤 컬러** | D+n(빨간색), D-DAY/D-1(주황색), D-3(노란색), 일반(회색) | `ddayToneClass(days)` 함수로 Tailwind CSS 컬러 클래스 반환 | **통과 (PASS)** |

- **테스트 케이스 검증 결과**:
  - `당일 (2026-09-02)` -> `D-DAY (0일)` [PASS]
  - `1일 전 (2026-09-01)` -> `D+1 (-1일)` [PASS]
  - `3일 전 (2026-08-30)` -> `D+3 (-3일)` [PASS]
  - `1일 후 (2026-09-03)` -> `D-1 (1일)` [PASS]
  - `3일 후 (2026-09-05)` -> `D-3 (3일)` [PASS]

---
### ✅ [검증 3] 데이터 계층 스키마 및 DB 모델 검증 (`lib/db/types.ts`, `lib/db/index.ts`)
| 모델/테이블 명칭 | 역할 및 소속 | 주요 필드 구성 | 검증 결과 |
|---|---|---|---|
| **`ppt_templates`** | B/C 공용 파워포인트 템플릿 | `id`, `kind('event'\|'sns')`, `name`, `file_data`, `placeholders`, `uploaded_at` | **통과 (PASS)** |
| **`events`** | 서브프로젝트 B (캠페인 종속) | `id`, `campaign_id`(FK), `name`, `event_at`, `venue`, `memo`, `status`, `created_at` | **통과 (PASS)** |
| **`event_invitees`** | B 초청 인플루언서 및 RSVP | `id`, `event_id`(FK), `applicant_id`(스냅샷 원본), `name`, `sns_url`, `contact`, `rsvp_status`, `attended`, `memo` | **통과 (PASS)** |
| **`event_checklist_items`** | B 행사 준비 체크리스트 | `id`, `event_id`(FK), `label`, `due_date`, `assignee`, `done`, `sort_order` | **통과 (PASS)** |
| **`event_plans`** | B 행사 운영안 기획 및 치환값 | `id`, `event_id`(FK), `template_id`, `field_values`, `updated_at` | **통과 (PASS)** |
| **`sns_accounts`** | 서브프로젝트 C (독립 대행 계정) | `id`, `company_name`, `platform`, `handle`, `starts_on`, `ends_on`, `status`, `intake_token`, `approval_token` | **통과 (PASS)** |
| **`sns_intake_template`** | C 사전설문 전역 질문틀 | `id`, `questions` (`id`, `question`, `placeholder`, `required`) | **통과 (PASS)** |
| **`sns_intake_responses`** | C 광고주 사전설문 응답 | `id`, `account_id`(FK), `answers`, `submitted_at` | **통과 (PASS)** |
| **`sns_plans`** | C SNS 채널 운영 제안서 치환값 | `id`, `account_id`(FK), `template_id`, `field_values`, `updated_at` | **통과 (PASS)** |
| **`sns_contents`** | C 월간 콘텐츠 및 성과 | `id`, `account_id`(FK), `title`, `scheduled_on`, `assignee`, `status(5단계)`, `caption`, `hashtags`, `media_note`, `client_comment`, `post_url`, `view_count`, `like_count`, `comment_count` | **통과 (PASS)** |

---
### ✅ [검증 4] Gemini AI 어시스트 모듈 검증 (`lib/ai/`)
| 모듈 파일 | 역할 및 기능 | 모델 및 파라미터 제약 | 에러/폴백 처리 | 검증 결과 |
|---|---|---|---|---|
| **`eventPlanAssist.ts`** | 행사 운영안 각 플레이스홀더별 전략 초안 생성 | `gemini-2.5-flash`, `maxOutputTokens: 1200`, `ThinkingLevel.MINIMAL` | API Key 부재 또는 에러 시 `[placeholder] AI 제안 실패 — 직접 입력해주세요.` 반환 | **통과 (PASS)** |
| **`snsCaptionAssist.ts`** | SNS 게시물 캡션 카피 및 추천 해시태그 생성 | `gemini-2.5-flash`, `maxOutputTokens: 800`, `ThinkingLevel.MINIMAL` | 에러 시 안전 기본 문구 및 브랜드 해시태그 반환 | **통과 (PASS)** |
| **`snsPlanAssist.ts`** | SNS 채널 운영 제안서 플레이스홀더별 전략 초안 생성 | `gemini-2.5-flash`, `maxOutputTokens: 1200`, `ThinkingLevel.MINIMAL` | 에러 시 안전 플레이스홀더 안내 반환 | **통과 (PASS)** |

---
### ✅ [검증 5] 서브프로젝트 B: 인플루언서 행사 관리 (Campaign 종속)
| 기능 / 화면 | 엔드포인트 / 파일 경로 | 스펙 구현 상세 | 검증 결과 |
|---|---|---|---|
| **캠페인 메인 허브 연계** | `/campaigns/[id]/page.tsx` | 행사 관리 허브 바로가기 배너 및 등록된 행사 수 뱃지 표시 | **통과 (PASS)** |
| **행사 목록 & 생성** | `/campaigns/[id]/events/page.tsx` | 해당 캠페인의 행사 목록 조회, 상태별 필터링, 신규 행사 생성 모달 | **통과 (PASS)** |
| **초청자 명단 & RSVP** | `/campaigns/[id]/events/[eventId]/page.tsx` (Tab 1) | 캠페인 지원자 목록에서 선택 스냅샷 복사(`addEventInviteesFromApplicants`), 직접 추가, 수동 RSVP(`pending` / `attending` / `not_attending`), 당일 현장 참석 체크인(`attended`) | **통과 (PASS)** |
| **행사 운영안 기획 & PPT** | `/campaigns/[id]/events/[eventId]/page.tsx` (Tab 2) | Gemini AI 초안 생성, 웹 플레이스홀더 실시간 편집, 저장 | **통과 (PASS)** |
| **운영안 PPT 다운로드** | `/campaigns/[id]/events/[eventId]/plan/export` | 템플릿 치환 엔진을 통해 브라우저 다운로드 스트리밍 | **통과 (PASS)** |
| **체크리스트 & D-day** | `/campaigns/[id]/events/[eventId]/page.tsx` (Tab 3) | 할 일 추가/수정/삭제, 담당자 지정, KST D-day 계산 및 완료 체크 | **통과 (PASS)** |
| **전체 행사 조회 뷰** | `/events/page.tsx` | 전체 캠페인 행사의 통합 목록 및 캠페인별 바로가기 제공 | **통과 (PASS)** |

---
### ✅ [검증 6] 서브프로젝트 C: SNS 채널 대행 운영 (독립 대행 계정 단위)
| 기능 / 화면 | 엔드포인트 / 파일 경로 | 스펙 구현 상세 | 검증 결과 |
|---|---|---|---|
| **SNS 계정 목록 & 생성** | `/sns/page.tsx` | 브랜드명, 플랫폼(인스타그램/유튜브/틱톡/기타), 핸들(@ID), 계약 기간 등록 | **통과 (PASS)** |
| **광고주 사전설문 공개 폼** | `/sns-intake/[token]/page.tsx` | 독립 클린 레이아웃, 브랜드 톤앤매너 및 요구사항 접수, `sns_intake_responses` 저장 | **통과 (PASS)** |
| **광고주 시안 승인/수정 폼** | `/sns-approval/[token]/page.tsx` | 독립 클린 레이아웃, 승인 대기 콘텐츠 원고 열람, [시안 승인] 또는 [수정 요청(의견 입력)] 처리 | **통과 (PASS)** |
| **월간 캘린더 & 5단계 상태** | `/sns/[id]/page.tsx` | 기획중 → 제작중 → 승인대기 → 승인완료 → 게시완료 5단계 전이 및 담당자 필터링 | **통과 (PASS)** |
| **Gemini AI 카피라이팅** | `/sns/[id]/page.tsx` (모달) | 제목/주제 기반 감성 캡션 본문 + 추천 해시태그 원클릭 자동완성 | **통과 (PASS)** |
| **게시 성과 입력 & 누적 집계** | `/sns/[id]/page.tsx` | 게시완료(`posted`) 콘텐츠에 게시물 URL, 조회수, 좋아요, 댓글수 저장 및 상단 KPI 카드에 전체 누적 총합 자동 집계 | **통과 (PASS)** |
| **SNS 운영 제안서 에디터 & PPT** | `/sns/[id]/plan/page.tsx` & `/export` | 사전설문 응답 기반 AI 초안 생성, 웹 플레이스홀더 편집 및 `.pptx` 다운로드 스트리밍 | **통과 (PASS)** |
| **사전설문 기본 질문틀 설정** | `/settings/sns-intake/page.tsx` | 전체 대행 계정에 공통 적용되는 사전설문 질문 항목 추가/수정/삭제 | **통과 (PASS)** |
| **공용 PPT 템플릿 관리** | `/settings/ppt-templates/page.tsx` | 행사(B)/SNS(C) `.pptx` 파일 업로드, 플레이스홀더 자동 감지 및 삭제 관리 | **통과 (PASS)** |

---
### ✅ [검증 7] 서브프로젝트 D: 통합 오버뷰 & 전체 일정 캘린더 (`/`)
| 기능 / 화면 | 엔드포인트 / 파일 경로 | 스펙 구현 상세 | 검증 결과 |
|---|---|---|---|
| **임박/지연 일정 알림** | `/` (상단 섹션) | 4개 데이터 소스(A 시딩 마감일, B 행사 일시, B 행사 체크리스트, C SNS 발행일) 중 마감 D-3 이내 및 D+n 지연 건을 자동 수집 | **통과 (PASS)** |
| **지연 우선 정렬** | `/` & `CalendarOverviewClient.tsx` | D+n(지연)이 최상단에 배치되고, 그다음 D-DAY(오늘), D-1, D-2, D-3 순으로 정렬 | **통과 (PASS)** |
| **소스별 시각 뱃지** | `CalendarOverviewClient.tsx` | `시딩(파랑)`, `행사(인디고)`, `행사할일(보라)`, `SNS(하늘)` 뱃지로 출처 명확화 | **통과 (PASS)** |
| **월간 캘린더 그리드** | `/` (하단 섹션) | `?month=YYYY-MM` 파라미터 기반 서버 렌더링 7열 캘린더, 이전달/다음달 내비게이션, 날짜 클릭 시 모달 상세 보기 | **통과 (PASS)** |
| **장애 격리 (Fault Isolation)** | `/app/(dashboard)/page.tsx` | `Promise.allSettled`를 사용하여 특정 서브프로젝트 API 에러 시에도 다른 모듈의 캘린더 일정이 안정적으로 렌더링되도록 격리 | **통과 (PASS)** |

---
### ✅ [검증 8] 프로덕션 빌드 및 BOM 종합 검증
| 검증 항목 | 세부 내용 | 검증 결과 |
|---|---|---|
| **UTF-8 BOM 전수 검사** | 소스 코드 전체 파일(`*.ts`, `*.tsx`, `*.json`)의 UTF-8 BOM 바이트(EF BB BF) 검사 및 완전 제거 | **100% 제거 완료 (PASS)** |
| **Next.js Production Build** | `npm run build` (Turbopack, TypeScript Type Checking) | **에러 0개 성공 (PASS)** |
| **정적/동적 라우트 생성** | 총 33개 라우트 정상 생성 및 최적화 확인 | **전체 라우트 생성 (PASS)** |
| **Git 버전 관리 & 원격 푸시** | GitHub `main` 브랜치(`https://github.com/grapevine26/marketing_dashboard.git`) 동기화 | **푸시 완료 (PASS)** |

---

## 📊 종합 결론 및 평가

1. **스펙 일치도**: `HANDOVER-B-C-D.md` 및 공식 설계 스펙 문서의 요구사항을 **100% 충족**합니다.
2. **누락 항목 점검**:
   - 서브프로젝트 B (행사 관리): 캠페인 종속 구조, 지원자 스냅샷 가져오기, 수동 RSVP, 체크리스트 D-day, 운영안 PPT 생성 모두 정상 구현됨.
   - 서브프로젝트 C (SNS 운영): 독립 계정 단위, 2종 공개 보안 토큰 폼(사전설문/시안승인), 5단계 상태 전이, AI 카피, 성과 집계, PPT 생성, 전역 설정 모두 정상 구현됨.
   - 서브프로젝트 D (통합 관제): 4개 소스 통합 D-3~지연 알림, 7열 월간 캘린더, `Promise.allSettled` 장애 격리 모두 정상 구현됨.
   - 공용 PPT 엔진: XML Run Splitting 문제 해결, 플레이스홀더 자동 추출 및 치환 완벽 검증됨.
3. **안정성 및 완성도**: Next.js 16 최신 빌드 검증을 완벽히 통과하였으며 로컬 런타임 및 프로덕션 환경 모두 즉시 사용 가능한 상태입니다.