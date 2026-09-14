# 브랜드 글꼴

RB Global 로고와 앱 아이콘에 쓰는 글꼴입니다. 본문 한글에는 쓰지 않습니다.

| 파일 | 쓰는 곳 | 이유 |
|---|---|---|
| `Inter-ExtraBold-latin.woff2` | 화면 워드마크 (`app/layout.tsx`) | 영문 구간만 담아 가볍다. 브라우저가 읽는다. |
| `Inter-ExtraBold.ttf` | 앱 아이콘 (`lib/brand-font.ts`) | 아이콘을 그리는 도구는 woff2 를 못 읽는다. |

두 파일은 같은 글꼴의 같은 굵기(Inter ExtraBold, 800)입니다. 한쪽만 바꾸면
화면의 글자와 아이콘의 글자가 어긋나므로 바꿀 때는 둘 다 바꿔야 합니다.

받은 곳은 Google Fonts 이고, 라이선스는 SIL Open Font License 1.1 입니다.
전문은 같은 폴더의 `LICENSE.txt` 에 있습니다.
