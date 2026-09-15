import type { MetadataRoute } from "next";

/**
 * 검색엔진에게 이 사이트 전체를 긁지 말라고 알린다.
 *
 * 이 앱은 사내 도구다. 검색에 걸려서 좋을 페이지가 **한 장도 없다.**
 * 특히 광고주·인플루언서에게 보내는 링크(`/applicants/<토큰>`, `/seeding-sheet/<토큰>`,
 * `/sns-approval/<토큰>`)는 로그인 없이 열리고 지원자 개인정보와 공개 전 시안이 들어 있다.
 * 그 주소가 어쩌다 크롤러 손에 들어가면(공개 게시판에 붙여넣기, 링크 미리보기 봇 등)
 * 통째로 색인될 수 있다.
 *
 * 전에는 이 파일이 없어서 /robots.txt 요청이 로그인 화면으로 튕겼다. 크롤러는 그걸
 * "robots.txt 가 없다" 로 읽고 마음껏 긁는다. 없는 것보다 나쁜 상태였다.
 *
 * robots.txt 로 막으면 크롤러가 페이지를 아예 안 읽으므로 meta 의 noindex 도 못 본다.
 * 그래서 app/layout.tsx 에 noindex 를 함께 걸어 둔다. 둘 중 하나만으로는 빈다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
