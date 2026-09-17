/**
 * 저장소에 남았지만 DB 어디에서도 가리키지 않는 파일("고아")을 가려낸다.
 *
 * 고아가 생기는 길은 둘이다.
 *   1. 업로드가 끝난 직후 창을 닫아 DB 기록이 남지 않은 경우. (지금은 업로드 중 창을 잠가 막았다)
 *   2. 캠페인·SNS 계정·콘텐츠를 DB 에서 직접 지운 경우. 앱의 삭제 경로는 파일도 함께 지우지만,
 *      SQL 로 지우면 파일은 그대로 남는다.
 *
 * **허용 목록 방식이다.** "이 모양이면 지워도 된다" 만 참이고 나머지는 전부 거짓이다.
 * 새 갈래가 생겨도 여기 적기 전까지는 지워지지 않는다. `legacy-blob.mjs` 와 같은 이유다 —
 * 판정이 틀리면 운영 파일이 사라지므로, 판정을 한 곳에 모으고 테스트로 경계를 고정한다.
 *
 * 특히 `backups/` 는 **대상에서 통째로 뺀다.** 크론이 매일 쌓는 DB 덤프이고 DB 가 그것을
 * 가리키지 않으므로, 대상에 넣는 순간 전부 고아로 판정되어 유일한 백업이 사라진다.
 */

/** lib/db/types.ts 의 UPLOAD_PREFIX 와 같아야 한다. SNS 시안 미디어. */
export const UPLOAD_PREFIX = "uploads/";
/** lib/db/types.ts 의 TEMPLATE_PREFIX 와 같아야 한다. 업로드된 PPT 템플릿. */
export const TEMPLATE_PREFIX = "templates/";

/** 고아 판정의 대상이 되는 갈래. 여기 없는 갈래는 쳐다보지도 않는다. */
const SCOPES = [UPLOAD_PREFIX, TEMPLATE_PREFIX];

/**
 * 이 경로가 고아 판정의 **대상**인가. (대상이라고 해서 고아라는 뜻은 아니다)
 *
 * 갈래 바로 아래의 파일 하나만 대상이다. 갈래 자체(`uploads/`)도, 더 깊은 경로
 * (`uploads/a/b.png`)도 대상이 아니다 — 지금 코드가 만들지 않는 모양이라,
 * 그런 것이 있다면 우리가 모르는 물건이고 모르는 것은 지우지 않는다.
 *
 * @param {string} pathname Blob 의 전체 경로 (예: "uploads/6d66b5b8-....png")
 * @returns {boolean}
 */
export function isOrphanCandidate(pathname) {
  if (typeof pathname !== "string" || pathname.length === 0) return false;
  const prefix = SCOPES.find((p) => pathname.startsWith(p));
  if (!prefix) return false;
  const name = pathname.slice(prefix.length);
  if (name.length === 0) return false;
  return !name.includes("/");
}

/**
 * 대상 경로에서 **DB 쪽 값과 맞춰볼 키**를 뽑는다. 대상이 아니면 null.
 *
 *   uploads/<첨부id><확장자>  ->  <첨부id>   (sns_contents.media_attachments[].id 와 맞춘다)
 *   templates/<파일이름>      ->  <파일이름>  (ppt_templates.file_key 와 맞춘다)
 *
 * 두 갈래가 다른 이유: 첨부는 경로를 id 로 **만들고**(buildUploadPathname), 템플릿은
 * 경로의 이름 부분을 DB 에 **그대로 저장한다**(file_key = "<id>.pptx", 접두사 없음).
 *
 * @param {string} pathname
 * @returns {string | null}
 */
export function referenceKeyOf(pathname) {
  if (!isOrphanCandidate(pathname)) return null;
  if (pathname.startsWith(TEMPLATE_PREFIX)) return pathname.slice(TEMPLATE_PREFIX.length);
  const name = pathname.slice(UPLOAD_PREFIX.length);
  const dot = name.lastIndexOf(".");
  // 확장자가 없을 수도 있다(확장자를 모르면 빈 문자열로 붙인다). 그때는 이름 전체가 id 다.
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * 지워도 되는가. **대상이면서, DB 가 가리키지 않을 때만** 참이다.
 *
 * @param {string} pathname
 * @param {Set<string>} referenced DB 에서 모은 참조 키 집합
 * @returns {boolean}
 */
export function isOrphan(pathname, referenced) {
  const key = referenceKeyOf(pathname);
  if (key === null) return false;
  return !referenced.has(key);
}
