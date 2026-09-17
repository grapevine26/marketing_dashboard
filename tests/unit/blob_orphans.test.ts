import { describe, it, expect } from "vitest";
import {
  isOrphan,
  isOrphanCandidate,
  referenceKeyOf,
} from "@/scripts/blob-orphans-rules.mjs";
import { UPLOAD_PREFIX, TEMPLATE_PREFIX, buildUploadPathname, buildTemplatePathname } from "@/lib/db/types";
import { BACKUP_PREFIX, LEGACY_DOC_PREFIX } from "@/scripts/legacy-blob.mjs";

/**
 * 이 판정이 틀리면 **운영 파일이 지워진다.** `npm run blob:orphans -- --yes --prod` 가
 * 이 함수가 참이라고 한 것만 지우기 때문이다. 경계를 여기서 고정한다.
 *
 * 특히 무서운 쪽은 **크론 백업**이다. DB 는 백업 파일을 가리키지 않으므로, 대상 갈래를
 * 한 줄 잘못 넓히는 순간 전부 고아로 판정되어 **유일한 백업이 사라진다**(Supabase 무료
 * 요금제에는 자동 백업이 없다). 그래서 대상에서 빠져 있는지를 직접 못박아 둔다.
 */
describe("고아 Blob 가려내기", () => {
  const 첨부id = "6d66b5b8-bc27-4151-b64d-4ff7468c8566";
  const 첨부경로 = buildUploadPathname(첨부id, ".png");
  const 템플릿경로 = buildTemplatePathname("c8ae6b27-1508-487f-94ae-351544ec7ec4");
  const 템플릿키 = 템플릿경로.slice(TEMPLATE_PREFIX.length);

  it("갈래 접두사가 코드와 같다", () => {
    // 여기가 어긋나면 "대상이 하나도 없다" 며 조용히 아무것도 안 지우거나, 반대로 엉뚱한 것을 지운다.
    expect(첨부경로.startsWith(UPLOAD_PREFIX)).toBe(true);
    expect(템플릿경로.startsWith(TEMPLATE_PREFIX)).toBe(true);
  });

  it("크론 백업과 전환 전 데이터는 대상이 아니다", () => {
    // 이 둘이 대상이 되면 백업이 통째로 고아로 판정된다. 절대 넓히지 말 것.
    expect(isOrphanCandidate(`${BACKUP_PREFIX}supabase-20260917-122623.json`)).toBe(false);
    expect(isOrphanCandidate(`${BACKUP_PREFIX}db-20260908-042816.json`)).toBe(false);
    expect(isOrphanCandidate(`${LEGACY_DOC_PREFIX}marketing_db.json`)).toBe(false);
    // 참조가 하나도 없는 상태(=지금처럼 DB 를 비운 직후)에서도 지워지면 안 된다.
    expect(isOrphan(`${BACKUP_PREFIX}supabase-20260917-122623.json`, new Set())).toBe(false);
  });

  it("모르는 모양은 대상이 아니다", () => {
    expect(isOrphanCandidate(UPLOAD_PREFIX), "갈래 자체").toBe(false);
    expect(isOrphanCandidate(`${UPLOAD_PREFIX}a/b.png`), "더 깊은 경로").toBe(false);
    expect(isOrphanCandidate("uploads.png"), "접두사를 닮았을 뿐").toBe(false);
    expect(isOrphanCandidate("logs/x.txt"), "모르는 갈래").toBe(false);
    expect(isOrphanCandidate(""), "빈 값").toBe(false);
    // 대상이 아니면 참조가 비어 있어도 지워지지 않는다.
    expect(isOrphan("logs/x.txt", new Set())).toBe(false);
  });

  it("첨부는 확장자를 뗀 이름이 첨부 id 다", () => {
    expect(referenceKeyOf(첨부경로)).toBe(첨부id);
    expect(referenceKeyOf(buildUploadPathname(첨부id, "")), "확장자를 모를 때").toBe(첨부id);
    expect(referenceKeyOf(buildUploadPathname(첨부id, ".mov"))).toBe(첨부id);
  });

  it("템플릿은 이름 그대로가 file_key 다", () => {
    // DB 의 file_key 에는 "templates/" 가 붙어 있지 않다. 붙여서 비교하면 전부 고아가 된다.
    expect(템플릿키.startsWith(TEMPLATE_PREFIX)).toBe(false);
    expect(referenceKeyOf(템플릿경로)).toBe(템플릿키);
    expect(referenceKeyOf(buildTemplatePathname("abc", 2))).toBe("abc-2.pptx");
  });

  it("DB 가 가리키면 남기고, 가리키지 않으면 고아다", () => {
    const 참조 = new Set([첨부id, 템플릿키]);
    expect(isOrphan(첨부경로, 참조)).toBe(false);
    expect(isOrphan(템플릿경로, 참조)).toBe(false);

    expect(isOrphan(buildUploadPathname("00000000-0000-0000-0000-000000000000", ".png"), 참조)).toBe(true);
    expect(isOrphan(buildTemplatePathname("00000000-0000-0000-0000-000000000000"), 참조)).toBe(true);
  });

  it("교체된 템플릿의 옛 버전은 고아다", () => {
    // 템플릿을 교체하면 새 키로 올리고 기록을 바꾼 뒤 옛 파일을 지운다(ppt-templates.ts).
    // 그 마지막 삭제가 실패하면 옛 버전만 남는데, 그것이 바로 여기서 잡혀야 하는 물건이다.
    const 참조 = new Set(["abc-2.pptx"]);
    expect(isOrphan(buildTemplatePathname("abc", 2), 참조)).toBe(false);
    expect(isOrphan(buildTemplatePathname("abc"), 참조), "버전 없는 옛 파일").toBe(true);
  });
});
