/**
 * Supabase 로 옮기기 전 저장 계층이 Blob 에 남긴 것들을 가려낸다.
 *
 * 2026-09-14 에 저장 계층을 로컬 JSON 문서에서 Supabase Postgres 로 옮겼다. 그때
 * 배포본 Blob 에 있던 데이터를 옮기지 않기로 했지만 원본은 지우지 않고 두었다.
 * 남은 것은 두 갈래다.
 *
 *   db/…                      전환 전 "살아 있던" 문서 (db/marketing_db.json)
 *   backups/db-<날짜>-<시각>.json  전환 전 자동 백업
 *
 * **지금 코드가 쓰는 경로는 절대 고르면 안 된다.** `lib/db/types.ts` 의 UPLOAD_PREFIX
 * ("uploads/"), TEMPLATE_PREFIX ("templates/"), 그리고 크론 백업(`backups/supabase-*.json`)
 * 이 그것이다. 하나라도 잘못 걸리면 운영 파일이 사라진다. 그래서 판정을 이 파일 하나로
 * 모으고 `tests/unit/legacy_blob.test.ts` 가 경계를 고정한다.
 *
 * 허용 목록 방식이다 — "이것이면 옛것" 만 참이고 나머지는 전부 거짓이다.
 * 새 갈래가 생겨도 여기 적기 전까지는 지워지지 않는다.
 */

/** 크론이 Blob 에 쓰는 갈래. lib/db/storage.ts 의 BACKUP_PREFIX 와 같아야 한다. */
export const BACKUP_PREFIX = "backups/";

/** 전환 전 문서가 있던 갈래. 지금 코드는 이 갈래를 전혀 쓰지 않는다. */
export const LEGACY_DOC_PREFIX = "db/";

/** 전환 전 자동 백업의 이름: db-YYYYMMDD-HHMMSS.json */
const LEGACY_BACKUP_NAME = /^db-\d{8}-\d{6}\.json$/;

/**
 * 이 pathname 이 "옛 저장 계층이 남긴 것" 인가.
 * @param {string} pathname Blob 의 전체 경로 (예: "backups/db-20260908-042816.json")
 * @returns {boolean}
 */
export function isLegacyPathname(pathname) {
  if (typeof pathname !== "string" || pathname.length === 0) return false;

  // 1) 전환 전 문서. 갈래 안에 무엇이 있든 전부 옛것이다.
  //    단, "db/" 로 시작하기만 하면 안 되고 갈래 뒤에 이름이 있어야 한다("db/" 자체는 제외).
  if (pathname.startsWith(LEGACY_DOC_PREFIX)) {
    return pathname.length > LEGACY_DOC_PREFIX.length;
  }

  // 2) 전환 전 자동 백업. 같은 갈래에 크론 백업(supabase-*)이 섞여 있으므로 이름까지 본다.
  if (pathname.startsWith(BACKUP_PREFIX)) {
    return LEGACY_BACKUP_NAME.test(pathname.slice(BACKUP_PREFIX.length));
  }

  return false;
}
