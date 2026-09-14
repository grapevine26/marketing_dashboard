# 저장소(스토리지) 구성

작성일 2026-09-08. Supabase 전환 반영 2026-09-14.

## 두 종류의 저장소

| 데이터 | 저장소 | 코드 |
| --- | --- | --- |
| 캠페인, 지원자, 시딩, 보고서, 행사, SNS, 감사 로그 | Supabase Postgres | `lib/db/*.ts` (도메인별 모듈) |
| SNS 시안 미디어, 업로드한 PPT 템플릿 파일 | Vercel Blob(배포) / 로컬 파일(개발·테스트) | `lib/db/storage.ts` |

예전에는 JSON 문서 하나(`.data/db.json` 또는 Blob 의 `db/marketing_db.json`)에 모든 데이터를 넣고
통째로 읽고 썼다. 문서 전체를 덮어쓰는 구조라 낙관적 잠금, 재시도, 10분 간격 백업 같은 장치가
필요했는데, 테이블로 쪼개면서 전부 없어졌다. 설계 배경은
`docs/superpowers/specs/2026-09-14-supabase-migration-design.md` 에 있다.

## DB (Supabase)

### 접근 모델

서버만 `service_role` 키로 접근한다. `lib/supabase/admin.ts` 가 `server-only` 로 표시돼 있어
브라우저 번들에 들어가지 못한다. 모든 테이블은 RLS 가 켜져 있고 정책이 없으므로 anon 키로는
아무것도 못 본다. 외부 공개 페이지(지원폼, 사전조사, 승인 링크)는 앱 코드가 토큰을 검증한다.

| 환경 변수 | 용도 |
| --- | --- |
| `SUPABASE_URL` | 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 키 |
| `SUPABASE_DB_URL` | 마이그레이션 적용용 Postgres 연결 문자열. **Session pooler** 주소를 쓴다. 직접 연결 주소(`db.<ref>.supabase.co`)는 IPv6 전용이라 안 붙는 PC 가 많다. |
| `SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `SUPABASE_TEST_DB_URL` | 테스트 전용 프로젝트. 없으면 DB 단위 테스트는 skip 된다. |

### 스키마와 마이그레이션

스키마 원본은 `supabase/migrations/*.sql` 이다. (`docs/sql/` 은 다른 저장소의 옛 스키마 사본이라
이 프로젝트와 무관하다.)

```bash
npm run db:migrate            # 운영 프로젝트
npm run db:migrate -- --test  # 테스트 프로젝트
```

`scripts/db-migrate.mjs` 가 `pg` 로 직접 연결해 아직 적용하지 않은 파일만 순서대로 실행하고
`schema_migrations` 에 기록한다. 재실행해도 안전하다. 새 마이그레이션은 `0002_*.sql` 처럼
번호를 이어 붙인다.

옛 JSON 의 최상위 키 하나가 테이블 하나다. 중첩 객체(answers, custom_questions, field_values,
media_attachments, snapshot_data)는 jsonb 컬럼이다. 연쇄 삭제는 fk `on delete cascade` 가 맡는다.
감사 로그만 fk 가 없다. 삭제 기록이 삭제와 함께 사라지면 안 되기 때문이다.

### 코드 구조

`lib/db/index.ts` 는 re-export 전용이다. 호출 코드는 `@/lib/db` 에서 함수 이름으로 가져온다.

| 파일 | 담당 |
| --- | --- |
| `campaigns.ts` | 캠페인, 토큰, 웹훅, 메시지 템플릿, 사전조사, 신청폼 설정 |
| `applicants.ts` | 지원자, 선정 상태, 시딩 기록 |
| `reports.ts` | 결과보고서, 스냅샷 |
| `ppt-templates.ts` | 내장/업로드 PPT 템플릿 |
| `events.ts` | 행사, 초대, 체크리스트, 운영안 |
| `sns.ts` | SNS 계정, 인테이크, 운영 계획, 콘텐츠, 미디어, 승인 |
| `audit.ts` | 감사 로그 |
| `mappers.ts` | DB 행 → 앱 타입. timestamptz 를 `Z` 형식으로, 옵셔널 필드의 null 을 undefined 로 |
| `validation.ts` | `ValidationError`, 입력 검증 유틸, `isUuid` |
| `defaults.ts` | 기본 질문, 내장 템플릿 정의 |

uuid 형식이 아닌 id 는 쿼리 전에 `isUuid` 로 걸러 "없음"(null/false)으로 처리한다.
그러지 않으면 엉뚱한 URL 파라미터가 uuid 컬럼에 닿아 Postgres 타입 오류로 500 이 난다.

### 내장 PPT 템플릿

내장 템플릿 3개는 DB 에 없다. `defaults.ts` 가 코드로 만들고 읽을 때 DB 행과 합친다.
사용자가 지운 내장 템플릿 id 만 `hidden_builtin_templates` 에 남긴다. 되살리기는 그 행을 지운다.

### 기본 질문 템플릿

사전조사·SNS 인테이크 기본 질문은 `defaults.ts` 에 있다. 단일 행 테이블이 비어 있으면 처음 읽을 때
채워 넣는다. 마이그레이션 SQL 에 같은 값을 또 적지 않기 위해서다.

### 여러 테이블을 건드리는 쓰기

트랜잭션 없이 순차로 쓴다(캠페인 생성 → 폼 설정, 선정 → 시딩 기록 → 감사 로그).
중간 실패 시 앞 단계가 남을 수 있으나 앱이 "없음"을 처리한다. 원자성이 문제가 되는 함수가 생기면
그 함수만 Postgres 함수(RPC)로 뺀다.

### 백업

Supabase 의 자동 백업을 쓴다. 옛 JSON 백업/복원 스크립트는 없앴다.

## 파일 저장소

### 백엔드 선택 규칙

`BLOB_STORE_ID` 또는 `BLOB_READ_WRITE_TOKEN` 둘 중 하나라도 있으면 Blob 을 쓴다.
코드 분기는 `isBlobBackend()` 뿐이다.

| 환경 변수 | 백엔드 | 쓰는 곳 |
| --- | --- | --- |
| `BLOB_STORE_ID` 또는 `BLOB_READ_WRITE_TOKEN` | Vercel Blob | 배포 |
| 둘 다 없음 | 로컬 파일 (`.data/`) | 개발, 테스트 |

Vercel 에 스토어를 연결하면 `BLOB_STORE_ID` 가 들어가고, 인증은 자동으로 도는
OIDC 토큰(`VERCEL_OIDC_TOKEN`)이 맡는다. 읽기·쓰기 토큰은 선택 사항이다.
둘 다 없이 Vercel 위에서 돌면 콘솔에 오류 로그를 크게 남긴다 (`warnIfEphemeral`).

### 저장 위치

| 데이터 | Blob 키 | 로컬 경로 |
| --- | --- | --- |
| SNS 시안 미디어 | `uploads/<첨부ID>.<확장자>` | `.data/uploads/` |
| 업로드한 PPT 템플릿 | `templates/<템플릿ID>(-<버전>).pptx` | `.data/templates/` |

Blob 은 전부 `access: "private"` 이다. 미디어는 `/api/media/[id]` 가 토큰을 확인한 뒤에만 흘려보낸다.
테스트는 `UPLOADS_DIR` 로 임시 폴더를 지정한다.

### 배포 준비 (한 번만)

1. Vercel 프로젝트 → Storage → Create Database → Blob
2. 프로젝트에 연결하면 `BLOB_READ_WRITE_TOKEN` 이 환경 변수에 자동으로 들어간다
3. 환경 변수에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 추가
4. 재배포

### 시안 미디어 업로드

Vercel 함수는 요청 본문을 4.5MB 로 자른다. `next.config.ts` 로는 못 올린다.
그래서 배포에서는 파일이 서버를 거치지 않는다.

1. 브라우저가 `/api/media/upload` 에 업로드 토큰을 요청한다.
   서버는 경로 모양(`uploads/<UUID>.<확장자>`), 형식, 크기 상한, 붙일 콘텐츠의 존재를 확인한다.
   `allowOverwrite: false` 라서 남의 키를 덮어쓸 수 없다.
2. 브라우저가 파일을 Blob 으로 바로 보낸다.
3. 브라우저가 `confirmSnsMediaUploadAction` 을 부른다.
   서버는 실물이 올라왔는지, 크기가 상한 안인지, 앞 12바이트가 주장한 형식과 맞는지 확인하고 DB 에 기록한다.
   어긋나면 올라온 파일을 지운다.

크기는 클라이언트가 보낸 값이 아니라 저장소에서 읽은 값을 쓴다.
내용 검사는 Range 로 앞부분만 읽으므로 큰 영상이어도 부담이 없다.

로컬 개발에는 Blob 이 없어서 서버 액션으로 올린다.
`isBlobBackend()` 결과를 `clientUpload` prop 으로 화면에 내려 두 경로를 가른다.

### PPT 템플릿

업로드한 pptx 도 파일 저장소에 둔다. DB 행에는 `file_key` 만 남는다.

업로드 흐름은 시안 미디어와 같다. 브라우저가 `/api/ppt-templates/upload` 에서 토큰을 받아
저장소로 바로 보내고, 서버는 앞부분이 zip(`PK`)인지 확인한 뒤 등록한다.
치환 항목(`{{...}}`)은 등록 직전에 저장소에서 파일을 읽어 뽑는다.

이름과 종류는 파일을 건드리지 않고 바꾼다. 행사·SNS 운영안이 템플릿 id 를 저장해두기 때문에,
지웠다 새로 올리면 그 연결이 전부 끊긴다. 파일 교체는 새 키(`<id>-<버전>.pptx`)로 먼저 올리고,
기록이 새 파일을 가리킨 뒤에 옛 파일을 지운다. 교체가 도중에 실패해도 쓰던 파일이 살아 있다.

`/api/ppt-templates/<id>/download` 로 원본을 다시 받을 수 있다.
보고서 PPTX 라우트는 기본 템플릿이 없으면 남아 있는 보고서 템플릿으로 대신한다.

## 문제가 생기면

`/api/storage-health` 를 열면 DB 가 응답하는지(campaigns 행 수), 파일 저장소가 어떤 백엔드인지,
실제 파일 쓰기/읽기가 되는지 알려준다. 키 값이나 DB 내용은 담지 않는다.

## 나중에 파일도 Supabase Storage 로 옮길 때

`lib/db/storage.ts` 의 함수 본문만 갈아끼우면 된다. 호출부는 손대지 않는다.
바꿔야 할 함수는 `putFile`, `readFile`, `statFile`, `findFileKeyByPrefix`, `deleteFilesByPrefixes` 다섯 개다.
지켜야 할 계약은 `tests/unit/storage.test.ts` 에 있다. `readFile` 은 Range 를 받으면
`status: 206` 과 `contentRange` 를 채워야 한다. 브라우저 직접 업로드(`/api/media/upload`,
`/api/ppt-templates/upload`)는 Blob 의 클라이언트 토큰 방식이라 Supabase 의 signed upload URL 로
다시 짜야 한다.
