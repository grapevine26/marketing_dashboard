# 저장소(스토리지) 구성

작성일 2026-09-08.

## 왜 바꿨나

Vercel 서버리스는 요청마다 다른 인스턴스가 뜰 수 있고, 인스턴스마다 임시 디스크가 따로다.
JSON DB를 `os.tmpdir()` 에 두면 A 인스턴스에서 만든 보고서를 B 인스턴스가 못 본다.
그래서 새로고침할 때마다 결과보고서가 보였다 안 보였다 했고, 편집 링크는 404가 났다.

이제 모든 읽기/쓰기가 `lib/db/storage.ts` 한 곳을 지나간다.
배포에서는 모든 인스턴스가 같은 Vercel Blob 을 본다.

## 백엔드 선택 규칙

`BLOB_STORE_ID` 또는 `BLOB_READ_WRITE_TOKEN` 둘 중 하나라도 있으면 Blob 을 쓴다.
코드 분기는 `isBlobBackend()` 뿐이다.

| 환경 변수 | 백엔드 | 쓰는 곳 |
| --- | --- | --- |
| `BLOB_STORE_ID` 또는 `BLOB_READ_WRITE_TOKEN` | Vercel Blob | 배포 |
| 둘 다 없음 | 로컬 파일 (`.data/`) | 개발, 테스트 |

Vercel 에 스토어를 연결하면 `BLOB_STORE_ID` 가 들어가고, 인증은 자동으로 도는
OIDC 토큰(`VERCEL_OIDC_TOKEN`)이 맡는다. 읽기·쓰기 토큰은 선택 사항이다.
그래서 토큰만 보고 판단하면 정상 연결된 프로젝트가 임시 디스크로 떨어진다.

둘 다 없이 Vercel 위에서 돌면 콘솔에 오류 로그를 크게 남긴다 (`warnIfEphemeral`).

## 문제가 생기면

`/api/storage-health` 를 열면 어떤 백엔드를 쓰는지, 어떤 환경 변수가 있는지,
실제 읽기와 쓰기가 되는지 알려준다. 실패하면 오류 이름과 메시지가 그대로 나온다.
토큰 값이나 DB 내용은 담지 않는다. 레코드는 개수만 센다.

`?probeWrite=1` 을 붙이면 진짜 DB 문서에 대고 조건부 쓰기까지 재현한다.
방금 읽은 내용을 그대로 다시 쓰기 때문에 문서는 바뀌지 않지만, 쓰기는 쓰기라 기본값은 꺼짐이다.
작은 임시 키로 하는 검사는 통과하는데 실제 저장만 실패하는 경우에 쓴다.
약한 ETag 문제가 정확히 그런 경우였다.

읽기가 실패하면 초기 샘플 데이터로 조용히 대체하지 않고 오류를 낸다.
샘플을 진짜 데이터처럼 보여주면 그 위에 저장했을 때 실제 데이터를 덮어쓴다.
직전에 읽어둔 캐시가 있을 때만 그걸로 버틴다.

## 저장 위치

| 데이터 | Blob 키 | 로컬 경로 |
| --- | --- | --- |
| JSON DB | `db/marketing_db.json` | `.data/db.json` |
| SNS 시안 미디어 | `uploads/<첨부ID>.<확장자>` | `.data/uploads/` |
| 자동 백업 | `backups/db-YYYYMMDD-HHMMSS.json` | `.data/backups/` |

Blob 은 전부 `access: "private"` 이다. 미디어는 `/api/media/[id]` 가 토큰을 확인한 뒤에만 흘려보낸다.

## 배포 준비 (한 번만)

1. Vercel 프로젝트 → Storage → Create Database → Blob
2. 프로젝트에 연결하면 `BLOB_READ_WRITE_TOKEN` 이 환경 변수에 자동으로 들어간다
3. 재배포

## 동시 쓰기

`mutateDb` 는 두 겹으로 막는다.

같은 인스턴스 안에서는 프로미스 잠금으로 직렬화한다.
인스턴스가 여러 개면 ETag 낙관적 잠금(`put({ ifMatch })`)을 쓴다.
그 사이 다른 인스턴스가 저장했으면 `ConcurrentWriteError` 가 나고, 최신 문서를 다시 읽어
변경을 다시 적용한다. 최대 4번 시도한다. 남의 저장을 덮어쓰지 않는다.

로컬 파일 백엔드도 같은 계약을 지킨다. 버전은 ETag 대신 mtime 을 쓴다.

ETag 는 조건에 싣기 전에 `toStrongEtag` 로 정규화한다.
응답이 압축돼서 오면 Blob 이 약한 ETag(`W/"..."`)를 주는데, If-Match 는 강한 비교라
약한 ETag 는 무엇과도 일치하지 않는다. 그대로 실으면 저장이 영원히 거부된다.
작은 파일은 압축되지 않아 강한 ETag 로 오기 때문에, 작은 키로 시험하면 멀쩡해 보인다.
이것 때문에 배포에서 저장이 전부 실패했다.

재시도 사이에는 조금씩 늘려가며 기다린다. 곧바로 다시 읽으면 같은 순간을 또 짚기 때문이다.

네 번을 다 쓰고도 커밋하지 못하면 마지막 한 번은 조건 없이 쓴다.
낙관적 잠금은 동시 저장이 서로를 덮어쓰는 걸 막으려는 장치인데, 그것 때문에 저장 자체가
안 되면 앱을 못 쓴다. 못 막는 것보다 못 쓰는 게 나쁘다고 보고 그렇게 정했다.
이때는 last-writer-wins 가 되고, 서버 로그에 오류로 크게 남는다.
그 로그가 반복되면 저장소 설정을 봐야 한다는 신호다.

## 시안 미디어 업로드

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

로컬 개발에는 Blob 이 없어서 예전처럼 서버 액션으로 올린다.
`isBlobBackend()` 결과를 `clientUpload` prop 으로 화면에 내려 두 경로를 가른다.

## PPT 템플릿

업로드한 pptx 도 저장소에 둔다(`templates/<템플릿ID>.pptx`). DB 문서에는 키만 남는다.

예전에는 파일을 base64 로 문서 안에 넣었다. 그러면 10MB 템플릿 하나에 문서가 14MB 가 되고,
그때부터 모든 저장이 매번 그 14MB 를 읽고 다시 쓴다. 백업도 10분마다 그만큼 복사한다.
`file_data` 는 옛 데이터를 읽기 위해서만 남겨 뒀다. 새로 올리는 건 전부 `file_key` 를 쓴다.

업로드 흐름은 시안 미디어와 같다. 브라우저가 `/api/ppt-templates/upload` 에서 토큰을 받아
저장소로 바로 보내고, 서버는 앞부분이 zip(`PK`)인지 확인한 뒤 등록한다.
치환 항목(`{{...}}`)은 등록 직전에 저장소에서 파일을 읽어 뽑는다.
함수 안에서 저장소를 읽는 것이라 요청 본문 한도와는 무관하다.

## 백업과 복원

저장할 때 10분 간격으로 자동 백업하고 최근 것만 남긴다.

```bash
npm run db:restore
```

목록을 보여준다. 파일명을 주면 복원한다.

```bash
npm run db:restore -- db-20260908-051500.json
```

이 스크립트도 `BLOB_READ_WRITE_TOKEN` 을 보고 대상을 고른다.
배포 데이터를 만지려면 그 토큰을 셸에 넣고 실행할 것.
복원 전 현재 DB는 `pre-restore-<타임스탬프>.json` 으로 보관된다.

## 나중에 Supabase 로 옮길 때

`lib/db/storage.ts` 의 함수 본문만 갈아끼우면 된다. 호출부는 손대지 않는다.

바꿔야 할 함수는 `readDoc`, `writeDoc`, `putFile`, `readFile`, `statFile`,
`findFileKeyByPrefix`, `deleteFilesByPrefixes`, `listBackups`, `writeBackupIfDue` 아홉 개다.

지켜야 할 계약은 `tests/unit/storage.test.ts` 에 있다.
`writeDoc` 은 버전이 어긋나면 반드시 `ConcurrentWriteError` 를 던져야 하고,
`readFile` 은 Range 를 받으면 `status: 206` 과 `contentRange` 를 채워야 한다.
그 테스트가 통과하면 나머지는 그대로 돈다.

Supabase 로 가면 문서 전체를 통째로 읽고 쓰는 지금 구조 대신 테이블로 쪼개는 게 맞다.
그때는 `lib/db/index.ts` 의 쿼리 함수들도 같이 바뀐다. 이 파일은 그 전 단계다.
