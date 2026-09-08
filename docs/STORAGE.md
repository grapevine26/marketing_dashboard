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
토큰 값이나 DB 내용은 담지 않는다.

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

재시도 사이에는 조금씩 늘려가며 기다린다. 곧바로 다시 읽으면 같은 순간을 또 짚기 때문이다.

네 번을 다 쓰고도 커밋하지 못하면 마지막 한 번은 조건 없이 쓴다.
낙관적 잠금은 동시 저장이 서로를 덮어쓰는 걸 막으려는 장치인데, 그것 때문에 저장 자체가
안 되면 앱을 못 쓴다. 못 막는 것보다 못 쓰는 게 나쁘다고 보고 그렇게 정했다.
이때는 last-writer-wins 가 되고, 서버 로그에 오류로 크게 남는다.
그 로그가 반복되면 저장소 설정을 봐야 한다는 신호다.

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
