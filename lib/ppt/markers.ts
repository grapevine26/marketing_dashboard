/**
 * 슬라이드에 적는 표·차트 마커의 접두사.
 *
 * **엔진(engine.ts)에서 떼어 놓은 이유** — 이 값은 템플릿 업로드 화면(클라이언트 컴포넌트)도
 * 읽어야 하는데, engine.ts 는 JSZip 을 들고 있다. 거기서 가져오면 압축 라이브러리가
 * 통째로 브라우저 번들에 딸려간다. 상수만 여기 두고 양쪽이 이 파일을 본다.
 */

/** 표 마커: `{{표:이름}}` */
export const TABLE_PREFIX = "표:";
/** 차트 마커: `{{차트:이름}}` */
export const CHART_PREFIX = "차트:";

/** 슬라이드에 그대로 적는 형태로 만든다. 예: `{{표:인플루언서}}` */
export function marker(prefix: string, name: string): string {
  return `{{${prefix}${name}}}`;
}
