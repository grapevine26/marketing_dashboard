/** 엑셀이 수식으로 읽기 시작하는 글자들. 탭과 캐리지리턴도 같은 취급을 받는다. */
const RISKY_FIRST_CHARS = ["=", "+", "-", "@", "\t", "\r"];

/**
 * CSV 한 칸을 안전하게 감싼다.
 *
 * 따옴표를 막는 것만으로는 부족하다. 엑셀은 `=`, `+`, `-`, `@` 로 시작하는 칸을 **수식으로 읽는다.**
 * 지원자가 이름 칸에 `=HYPERLINK("http://...")` 를 적어 넣으면, 그 파일을 여는 사람(광고주)의
 * 엑셀에서 실행된다. 로그인 없이 지원폼으로 넣을 수 있는 값이라 더 나쁘다.
 * 앞에 작은따옴표를 붙이면 엑셀이 글자로 읽는다.
 *
 * 정규식 문자 범위로 쓰지 않는 이유: `[=+-@]` 는 `+` 부터 `@` 까지의 범위가 되어 숫자까지 잡는다.
 * 그러면 조회수 같은 숫자 칸이 전부 따옴표로 시작한다. 글자 목록으로 두는 편이 안전하다.
 */
/**
 * 부호로 시작하는 **평범한 숫자·전화번호**. 수식이 될 수 없다.
 *
 * 이게 없으면 `-` 로 시작하는 값이 전부 걸린다. 그런데 이 앱은 **빈 칸을 `-` 로 표시**하고
 * (관리시트의 업로드 기한·링크·비고 등), 해외 인플루언서 연락처는 `+82 10-…` 로 들어온다.
 * 그 결과 광고주가 받는 파일이 `'-`, `'+82 10-…` 로 도배됐다. 보안이 아니라 **읽기 나쁜 파일**이
 * 되는 쪽이라, 수식이 될 수 없는 모양은 빼 준다.
 */
const PLAIN_NUMBER = /^[+-]?\d[\d\s.,()-]*$/;

/** 이 값이 엑셀에서 수식으로 읽힐 수 있는가. */
function looksLikeFormula(str: string): boolean {
  if (str.length === 0) return false;
  if (!RISKY_FIRST_CHARS.includes(str.charAt(0))) return false;
  // 빈 값 표시. 글자 하나짜리 대시는 수식이 될 수 없다.
  if (str === "-") return false;
  if (PLAIN_NUMBER.test(str)) return false;
  return true;
}

export function generateCSV(headers: string[], rows: (string | number)[][]): string {
  const escapeCell = (val: string | number | null | undefined) => {
    if (val === null || val === undefined) return '""';
    let str = String(val);
    if (looksLikeFormula(str)) str = `'${str}`;
    return `"${str.replace(/"/g, '""')}"`;
  };

  const headerRow = headers.map(escapeCell).join(",");
  const dataRows = rows
    .map((row) => row.map(escapeCell).join(","))
    .join("\r\n");

  // UTF-8 BOM for Excel compatibility
  return `﻿${headerRow}\r\n${dataRows}`;
}
