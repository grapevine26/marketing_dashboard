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
export function generateCSV(headers: string[], rows: (string | number)[][]): string {
  const escapeCell = (val: string | number | null | undefined) => {
    if (val === null || val === undefined) return '""';
    let str = String(val);
    if (str.length > 0 && RISKY_FIRST_CHARS.includes(str[0])) str = `'${str}`;
    return `"${str.replace(/"/g, '""')}"`;
  };

  const headerRow = headers.map(escapeCell).join(",");
  const dataRows = rows
    .map((row) => row.map(escapeCell).join(","))
    .join("\r\n");

  // UTF-8 BOM for Excel compatibility
  return `﻿${headerRow}\r\n${dataRows}`;
}
