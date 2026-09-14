# DB 백업 운영 안내 (개발자용)

명령은 전부 프로젝트 루트에서 `npm run db:backup -- <옵션>` 꼴로 돈다. 스크립트는 `scripts/db-backup.mjs`.

## 어디에 언제 쌓이나

| 항목 | 값 |
|---|---|
| 주기 | 매일 KST 03:00 (`vercel.json` crons `0 18 * * *` UTC) |
| 호출 경로 | `/api/cron/backup` (Vercel 크론이 `CRON_SECRET` 으로 부른다) |
| 저장 위치 | Vercel Blob 스토어의 `backups/supabase-YYYYMMDD-HHMMSS.json` (이름은 UTC 시각) |
| 보관 개수 | 최신 30개. 넘치면 오래된 것부터 지운다 (`lib/db/backup.ts` `runBackup(keep = 30)`) |
| 내용 | `lib/db/backup.ts` 의 `BACKUP_TABLES` 전부. 한 파일 JSON: `{ created_at, source, tables: { 테이블: 행[] } }` |

백업에 **들어 있지 않은 것**:

- **로그인 계정(`auth.users`, 비밀번호)**. Supabase 가 따로 보관한다. 이 백업으로 되살릴 수 없다.
  `profiles`(아이디·이름·등급·승인 상태)는 크론 백업에 들어 있지만 참고용이다. 아래 복원 명령은 `profiles` 를 건드리지 않는다.
- **업로드 파일(SNS 시안 미디어, PPT 템플릿)**. Blob 의 `uploads/`, `templates/` 에 그대로 있고 백업 JSON 에는 경로만 있다.

크론이 돌았는지 확인하려면 Vercel → 프로젝트 → Logs 에서 `/api/cron/backup` 을 보거나, 아래 `--list-remote` 로 목록을 본다.

## 로컬로 내려받기

Blob 을 읽으려면 `BLOB_READ_WRITE_TOKEN` 이 필요하다. `.env.local` 에는 **넣지 않는다** (넣으면 로컬 앱의 파일 저장이 Blob 을 타서 운영 스토어에 개발 파일이 섞인다). 셸에서 그때만 넣는다.

토큰 위치: Vercel 대시보드 → Storage → Blob 스토어 → `.env.local` 탭 → `BLOB_READ_WRITE_TOKEN`.

```powershell
# PowerShell
$env:BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
npm run db:backup -- --list-remote          # Blob 에 있는 백업 목록 (이름·크기·KST 시각)
npm run db:backup -- --pull                 # 최신 하나를 .data/backups/ 에 저장
npm run db:backup -- --pull supabase-20260915-180000.json   # 특정 것
Remove-Item Env:BLOB_READ_WRITE_TOKEN       # 끝나면 지운다
```

```bash
# Git Bash
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... npm run db:backup -- --list-remote
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... npm run db:backup -- --pull
```

`--pull` 은 저장 뒤 테이블별 행 수를 찍는다. 행 수가 0 으로만 나오면 그 백업은 쓸모가 없으니 다른 날짜를 받는다.
받은 파일은 `--list` 에 같이 잡히고, 아래 복원 명령에 그대로 넣을 수 있다.

지금 DB 를 직접 받으려면 (`SUPABASE_DB_URL` 사용, 토큰 불필요):

```powershell
npm run db:backup                 # 운영
npm run db:backup -- --test       # 테스트 프로젝트
npm run db:backup -- --list       # 받아둔 것 목록
```

## 캠페인 하나만 복구

실수로 지운 캠페인(또는 SNS 계정)만 되살린다. **지금 있는 데이터는 건드리지 않고** 백업의 그 항목과 딸린 행만 다시 넣는다. 이미 DB 에 있는 id 는 넣지 않는다.

```powershell
npm run db:backup -- --from supabase-20260915-180000.json --campaigns                  # 담긴 캠페인 목록
npm run db:backup -- --from supabase-20260915-180000.json --campaign "브랜드명 캠페인" --yes   # 이름 또는 id
npm run db:backup -- --from supabase-20260915-180000.json --sns-accounts               # SNS 계정 목록
npm run db:backup -- --from supabase-20260915-180000.json --sns "@handle" --yes
```

- 이름이 여럿 걸리면 id 로 지정하라고 알려준다.
- SNS 계정을 앱에서 삭제했다면 시안 미디어 파일은 그때 Blob 에서 같이 지워졌다. 기록은 돌아오지만 화면에서 미디어가 깨지므로 다시 올려야 한다.

## 전체 복구와 되돌리기

전체 복구는 **현재 데이터를 전부 지우고** 백업으로 덮어쓴다. 캠페인 하나만 필요하면 위 방법을 쓴다.

```powershell
npm run db:backup -- --restore supabase-20260915-180000.json          # 미리보기 (행 수만 보여주고 멈춘다)
npm run db:backup -- --restore supabase-20260915-180000.json --yes    # 실행
```

동작:

1. 실행 직전 상태를 `.data/backups/pre-restore-YYYYMMDD-HHMMSS.json` 에 먼저 받아둔다.
2. 복원 대상 테이블을 truncate 하고 백업 행을 넣는다. 한 트랜잭션이라 중간에 실패하면 아무것도 안 바뀐다.
3. `profiles` 등 대상 목록에 없는 테이블은 덤프에 있어도 무시한다 ("건너뜀" 으로 표시). 계정 테이블을 비우면 로그인이 깨지기 때문이다.

**잘못 복원했으면** 1번에서 남은 파일로 다시 복원한다:

```powershell
npm run db:backup -- --list                                           # pre-restore-*.json 찾기
npm run db:backup -- --restore pre-restore-20260915-181230.json --yes
```

## 주 1회 수동 내려받기 (권장)

Blob 보관은 30일치라 그 이상 거슬러 가려면 로컬 사본이 있어야 한다. 매주 한 번:

```powershell
$env:BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
npm run db:backup -- --list-remote      # 매일 하나씩 쌓였는지 확인 (빠진 날이 있으면 크론 로그 확인)
npm run db:backup -- --pull             # 최신 것 저장, 출력된 행 수가 그럴듯한지 눈으로 확인
Remove-Item Env:BLOB_READ_WRITE_TOKEN
```

- `.data/backups/` 는 git 에 안 들어간다. 오래 남기려면 그 폴더를 다른 곳(외장·클라우드 드라이브)에 복사한다.
- 백업 JSON 에는 지원자 개인정보와 공유 링크 토큰이 그대로 들어 있다. 아무 데나 두지 않는다.
- 마이그레이션이나 대량 삭제 전에는 `npm run db:backup` 으로 그 시점 사본을 하나 더 받는다.
