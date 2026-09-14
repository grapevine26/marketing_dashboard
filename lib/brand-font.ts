import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * 아이콘을 그릴 때 쓰는 브랜드 글꼴(Inter ExtraBold).
 *
 * 아이콘은 브라우저가 아니라 서버에서 그림으로 그린다. 그리는 도구는 CSS 의 글꼴 이름을
 * 알아듣지 못하고 글꼴 파일을 직접 건네줘야 한다. 건네주지 않으면 기본 글꼴로 그려진다.
 * (이름을 바꾸기 전 아이콘이 지정한 글꼴과 다르게 보였던 이유가 이것이다.)
 *
 * 화면의 워드마크는 같은 글꼴의 woff2 를 app/layout.tsx 에서 불러 쓴다.
 * 두 파일은 같은 글꼴의 같은 굵기라 아이콘과 글자 모양이 어긋나지 않는다.
 */
export const brandFont = await readFile(join(process.cwd(), "app/fonts", "Inter-ExtraBold.ttf"));

/** 그림으로 그리는 모든 아이콘이 함께 쓰는 설정. */
export const BRAND_FONT_NAME = "Inter";
export const brandFontConfig = [
  { name: BRAND_FONT_NAME, data: brandFont, weight: 800 as const, style: "normal" as const },
];

/** 어두운 타일 색. 앱 화면의 카드 색과 같은 값이다. */
export const TILE_BG = "#16171b";
export const TILE_BORDER = "#292b34";
export const TILE_TEXT = "#ececf1";
