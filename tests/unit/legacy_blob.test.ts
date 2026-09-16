import { describe, it, expect } from "vitest";
import { isLegacyPathname } from "@/scripts/legacy-blob.mjs";
import { UPLOAD_PREFIX, TEMPLATE_PREFIX } from "@/lib/db/types";

/**
 * 이 판정이 틀리면 **운영 파일이 지워진다.** `npm run db:backup -- --purge-legacy --yes`
 * 가 이 함수가 참이라고 한 것만 지우기 때문이다. 경계를 여기서 고정한다.
 */
describe("옛 Blob 데이터 가려내기", () => {
  it("전환 전에 남은 것은 고른다", () => {
    // 전환 전 "살아 있던" 문서
    expect(isLegacyPathname("db/marketing_db.json")).toBe(true);
    expect(isLegacyPathname("db/무엇이든.json")).toBe(true);
    expect(isLegacyPathname("db/하위/폴더/파일.json")).toBe(true);
    // 전환 전 자동 백업
    expect(isLegacyPathname("backups/db-20260907-232858.json")).toBe(true);
    expect(isLegacyPathname("backups/db-20260910-032315.json")).toBe(true);
  });

  it("지금 코드가 쓰는 경로는 절대 고르지 않는다", () => {
    // 앱이 실제로 쓰는 갈래를 상수에서 직접 가져온다.
    // 갈래 이름이 바뀌면 이 테스트가 새 이름으로 다시 확인한다.
    expect(UPLOAD_PREFIX).toBe("uploads/");
    expect(TEMPLATE_PREFIX).toBe("templates/");

    const 살아있는것 = [
      `${UPLOAD_PREFIX}a1b2c3d4-0000-0000-0000-000000000000.png`,
      `${UPLOAD_PREFIX}db-20260907-232858.json`, // 이름이 닮아도 갈래가 다르면 아니다
      `${TEMPLATE_PREFIX}템플릿.pptx`,
      "backups/supabase-20260915-180010.json", // 크론 백업
      "backups/pre-restore-20260915.json",
    ];
    for (const p of 살아있는것) {
      expect(isLegacyPathname(p), p).toBe(false);
    }
  });

  it("애매한 이름은 고르지 않는다", () => {
    const 애매한것 = [
      "", // 빈 값
      "db/", // 갈래 자체
      "dbx/marketing_db.json", // 갈래 이름이 비슷하기만 한 것
      "database/marketing_db.json",
      "backups/db-2026-09-07.json", // 날짜 형식이 다름
      "backups/db-20260907-232858.json.bak", // 확장자가 붙음
      "backups/db-20260907.json",
      "backups/", // 갈래 자체
      "marketing_db.json", // 갈래 없음
    ];
    for (const p of 애매한것) {
      expect(isLegacyPathname(p), p).toBe(false);
    }
  });

  it("문자열이 아닌 값에도 터지지 않는다", () => {
    for (const v of [null, undefined, 0, {}, []]) {
      expect(isLegacyPathname(v as unknown as string)).toBe(false);
    }
  });
});
