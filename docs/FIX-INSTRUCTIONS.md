# B/C/D 기능 검증 결과 — 수정 지시서

작성: 2026-09-02
대상: 이 저장소(`marketing-mvp`)를 이어서 작업하는 개발자/AI 도구

## 배경

이 프로젝트(B: 인플루언서 행사, C: SNS 운영, D: 오버뷰)는 별도 저장소(`marketing`)에서 작성된 스펙·계획서를 기반으로 구현됐다. 구현 완료 후 계획서 대비 기능 검증을 진행했고, 8개의 실제 버그를 찾았다. 이 문서는 그 수정 지시서다.

**범위**: 순수하게 기능 정확성만 다룬다. Supabase 대체(로컬 JSON DB), 인증 방식, RLS 등 아키텍처 선택은 검증 대상이 아니었고 이 문서에서도 다루지 않는다.

각 항목은 **현재 어떻게 잘못됐는지**, **왜 문제인지**, **어떻게 고쳐야 하는지**를 담는다. 우선순위 순으로 정렬했다.

---

## 1. [최우선] PPT 다운로드가 실패를 숨긴다

**파일**: `app/(dashboard)/campaigns/[id]/events/[eventId]/plan/export/route.ts` (그리고 동일 패턴의 `app/(dashboard)/sns/[id]/plan/export/route.ts`)

**현재 동작**: 템플릿 파일(`file_data`)을 못 찾거나 플랜이 저장 안 된 경우, `generateDefaultPptBuffer("event")`로 **가짜 슬라이드를 만들어 다운로드를 성공시킨다.** 브랜드명·행사명 등이 전부 플레이스홀더 텍스트로 채워진 엉뚱한 파일이 담당자에게 "정상 다운로드"로 전달된다.

**왜 문제인가**: 담당자는 실제 운영안이 저장 안 됐거나 템플릿이 깨졌다는 사실을 전혀 알 수 없다. 업체에 잘못된 파일을 그대로 전달할 위험이 있다.

**수정 방법**: 템플릿 파일을 못 읽는 경우 기본 템플릿으로 폴백하지 말고, HTTP 에러 응답(4xx/5xx)과 함께 한국어 에러 메시지를 반환한다. 정확한 문구:

```
템플릿 파일을 불러오지 못했습니다. 다시 업로드해주세요.
```

호출하는 화면(`PlanSection`/`SnsPlanEditorClient`)에서 이 에러를 받아 사용자에게 그대로 보여준다. "기본 템플릿으로 대체"는 옵션으로 남겨도 되지만, 그 경우 **반드시 사용자에게 "템플릿이 없어 기본 양식으로 생성됩니다"라고 명시적으로 알리고 다운로드 전 확인을 받아야 한다.** 조용히 대체하면 안 된다.

---

## 2. [높음] 업체 승인 화면이 잘못된 데이터를 노출한다

**파일**: `app/sns-approval/[token]/page.tsx`, `app/sns-approval/[token]/SnsApprovalClient.tsx`

**현재 동작 두 가지 문제**:

1. `page.tsx`가 콘텐츠를 `status === "pending_approval" || status === "approved" || status === "producing"` 조건으로 가져온다. **승인대기(`pending_approval`)만 보여야 하는데 이미 승인됐거나 제작 중인 콘텐츠까지 노출된다.**
2. `SnsApprovalClient.tsx`가 `media_note`(내부 제작 메모, "비주얼 연출 참고: ...")를 그대로 렌더링한다. 이 필드는 업체에게 절대 보여선 안 되는 내부 전용 필드다.

**수정 방법**:
- `page.tsx`의 조회 조건을 `status === "pending_approval"`로만 제한한다.
- `SnsApprovalClient.tsx`에서 `media_note`를 렌더링하는 부분을 삭제한다. 서버에서 클라이언트로 데이터를 넘길 때 애초에 `media_note` 필드 자체를 응답 객체에 포함시키지 않는 것이 더 안전하다 — 화면단에서 숨기는 게 아니라 데이터 조립 단계에서 아예 빼야 한다.

---

## 3. [높음] 승인/수정요청이 멱등하지 않다

**파일**: `lib/db/index.ts` (`reviewSnsContent` 함수), `app/sns-approval/[token]/SnsApprovalClient.tsx`

**현재 동작**: `reviewSnsContent`가 콘텐츠의 현재 상태를 확인하지 않고 무조건 상태를 바꾼다. 위 2번 문제(승인된 항목도 화면에 보임)와 겹쳐서, **업체가 이미 승인한 콘텐츠를 다시 열어 "수정요청"을 눌러 승인을 뒤집을 수 있다.** 반대로 이미 `producing`으로 돌아간 항목에 "승인"을 누르는 것도 막혀 있지 않다.

**수정 방법**: `reviewSnsContent`에 가드를 추가한다 — **콘텐츠의 현재 상태가 `pending_approval`일 때만** 승인/수정요청 처리를 수행하고, 아니면 에러(또는 조용한 무시)를 반환한다. 2번 수정으로 화면에 `pending_approval` 항목만 보이게 되면 UI에서는 이 문제가 자연히 줄어들지만, **서버 측 가드는 별도로 반드시 필요하다** — 새로고침 지연이나 두 번 클릭 같은 경합 상황에서 여전히 발생할 수 있다.

---

## 4. [높음] AI 운영안 초안이 사전설문 답변을 알아볼 수 없는 형태로 받는다

**파일**: `app/(dashboard)/sns/actions.ts` (`generateSnsAiPlanAction`), `lib/ai/snsPlanAssist.ts`

**현재 동작**: `intakeAnswers: intake?.answers || {}`를 그대로 넘긴다. `sns_intake_responses.answers`는 **질문 id를 키로** 저장돼 있다(예: `{"q1": "저희는 스킨케어 브랜드입니다"}`). AI 프롬프트에 이 raw JSON이 그대로 들어가서, 모델이 `q1`이 무슨 질문이었는지 알 수 없는 상태로 답변을 봐야 한다.

**왜 문제인가**: AI가 맥락 없는 키-값 쌍만 보고 초안을 써야 해서 품질이 떨어진다. `event`쪽의 `eventPlanAssist.ts`는 같은 문제를 안 겪는지 함께 확인할 것 — 캠페인 사전조사 답변도 같은 방식으로 넘긴다면 동일하게 고쳐야 한다.

**수정 방법**: `generateSnsAiPlanAction`에서 AI를 호출하기 전에, `sns_intake_template.questions`(id→질문 라벨 매핑)를 가져와 `intake.answers`의 각 id 키를 **질문 라벨 문자열로 치환**한 객체를 만들어서 넘긴다.

```
{"q1": "저희는 스킨케어 브랜드입니다"}
   ↓ 변환 후
{"브랜드 소개를 부탁드립니다": "저희는 스킨케어 브랜드입니다"}
```

이 매핑 작업은 호출하는 쪽(`generateSnsAiPlanAction`)의 책임이다. `lib/ai/snsPlanAssist.ts` 자체는 손댈 필요 없다.

---

## 5. [중간] AI 초안 버튼이 손으로 고친 필드까지 덮어쓴다

**파일**: `app/(dashboard)/campaigns/[id]/events/[eventId]/EventDetailClient.tsx`

**현재 동작**: "Gemini AI 초안 자동완성" 버튼 하나가 전체 필드를 한 번에 생성해서 `setFieldValues(res.values)`로 **field_values 객체 전체를 통째로 교체한다.** 담당자가 이미 몇 개 필드를 손으로 수정해놨어도 다 날아간다.

**수정 방법**: 필드별로 개별 "AI 초안" 버튼을 두고, `generateEventPlanDraft({ placeholder, context })`를 필드 하나에 대해서만 호출해서 그 필드의 값만 갱신한다(`setFieldValues(prev => ({ ...prev, [placeholder]: draft }))`). SNS 쪽(`SnsPlanEditorClient` 등)이 이미 이 방식으로 돼 있다면 그 구현을 그대로 참고할 것.

---

## 6. [중간] 성과 집계가 월별이 아니라 전체 누적이다

**파일**: `app/(dashboard)/sns/[id]/SnsAccountDetailClient.tsx`

**현재 동작**: "게시 완료 콘텐츠 총 누적 성과"라는 라벨로 **전체 기간 합계**를 보여준다. 월별 구분이 없다.

**수정 방법**: `status='posted'`인 콘텐츠를 `status_changed_at`의 연-월로 그룹화해서, 월 선택(또는 현재 월 기본값) 별로 조회수/좋아요/댓글 합계를 보여주도록 바꾼다. 추가로 이 화면에서 입력값에 대한 음수 차단도 함께 추가한다 — `updateSnsContent`가 지금 `Object.assign(content, patch)`로 검증 없이 그대로 저장하고 있으니, 저장 전에 `view_count`/`like_count`/`comment_count`가 0 이상 정수인지 확인하는 검증을 넣는다.

---

## 7. [중간] 행사 상태를 바꿀 UI가 없다

**파일**: `app/(dashboard)/campaigns/[id]/events/[eventId]/EventDetailClient.tsx`

**현재 동작**: `updateEventAction`이 import는 돼 있는데 실제로 호출하는 곳이 없다. 행사를 만들면 `status='preparing'`으로 고정되고 이후 준비중/완료/취소로 바꿀 방법이 없다.

**수정 방법**: 행사 상세 화면 상단(개요 영역)에 상태 변경 컨트롤(select 또는 버튼 3개)을 추가하고 `updateEventAction`을 연결한다.

---

## 8. [낮음] 필수값 검증이 브라우저에만 있다

**파일**: `app/(dashboard)/campaigns/[id]/events/actions.ts` (`createEventAction`), `lib/db/index.ts` (`createEvent`, `addDirectEventInvitee`)

**현재 동작**: 행사명·초대자 이름 필수 검증이 HTML `required` 속성/클라이언트 코드에만 있다. 서버 액션을 직접 호출하면(브라우저 폼을 안 거치면) 빈 값으로 통과된다.

**수정 방법**: `createEventAction`에 `if (!name?.trim()) return { error: "행사명을 입력해주세요." }`를 추가하고, 초대자 직접 추가 액션에도 `if (!name?.trim()) return { error: "이름을 입력해주세요." }`를 추가한다. 화면에서 이 에러 메시지를 표시하도록 연결한다.

---

## 9. [낮음, 확인 필요] AI 어시스트 2개 파일에 thinking 설정이 빠져 있다

**파일**: `lib/ai/preSurveyAssist.ts`, `lib/ai/formIntroAssist.ts`

**현재 동작**: 같은 프로젝트의 `eventPlanAssist.ts`/`snsCaptionAssist.ts`/`snsPlanAssist.ts`는 전부 다음 설정을 쓰는데, 이 두 파일만 빠져 있다.

```ts
config: {
  maxOutputTokens: 800,  // 또는 용도에 맞게
  thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
}
```

**왜 문제인가**: `gemini-3.6-flash` 모델은 기본 thinking 레벨에서 500~1000+ 토큰을 "생각하는 데" 써버려서, 출력 토큰 예산을 넘기면 **답변이 문장 중간에 잘린 채로 돌아온다.** 이 두 파일은 `response.text`가 존재하기만 하면 성공으로 처리하기 때문에, **잘린 답변을 정상 답변으로 착각하고 그대로 사용자에게 보여줄 위험이 있다.**

**수정 방법**: 두 파일 모두 `thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }`을 config에 추가한다. `ThinkingLevel`은 `@google/genai`에서 export하는 enum이니 import를 확인할 것.

---

## 작업 순서 제안

1번(PPT 실패 은폐)과 2·3번(승인 화면 데이터 노출·멱등성)을 먼저 고친다 — 실사용 시 바로 문제가 될 수 있는 항목들이다. 그다음 4·5·6·7번을 순서대로, 마지막에 8·9번을 처리한다. 각 항목은 서로 독립적이라 순서를 바꿔도 무방하다.
