import { test, expect } from "@playwright/test";
import { SAMPLE } from "./fixtures";

/**
 * 한글이 고정폭(monospace) 글꼴로 그려지는 자리를 막는다.
 *
 * 왜 막나 — 이 앱의 글꼴은 시스템 스택이고, **한글에는 고정폭 글꼴이 없다.** `Consolas` 에
 * 한글을 넣으면 브라우저가 제멋대로 대체 글꼴을 골라서 한 줄 안에서 글꼴이 갈린다.
 * "초청 0명" 이 "초청" 과 "0명" 이 서로 다른 글꼴로 보이는 식이다. 사용자가 실제로 이걸
 * 알아채고 물어 왔다(2026-09-16).
 *
 * 고정폭을 쓰는 원래 이유는 **세로로 늘어선 숫자의 폭을 맞추기 위해서**다. 그건 `tabular-nums`
 * 로 충분하다 — 글꼴은 그대로 두고 숫자 폭만 고정한다. 한글이 섞이는 자리에서는
 * `font-mono` 를 빼고 `tabular-nums` 만 남기면 된다.
 *
 * **예외는 PPT 치환 코드(`{{브랜드명}}` 등)뿐이다.** 그건 사람이 PPT 파일에 그대로 옮겨
 * 적어야 하는 **글자 그 자체**라, 고정폭이 "이건 코드다, 한 글자도 바꾸지 마라" 를 알려 준다.
 */

/** PPT 치환 코드. 이것만 고정폭으로 남겨 둔다. */
const 치환코드 = /^\{\{.+\}\}$/;

/**
 * 훑을 화면. **빠진 화면은 못 잡는다.**
 * 실제로 활동 기록 화면을 빼 놓았다가 거기 있던 "오후 12:14" 를 놓쳤다.
 * 화면을 새로 만들면 여기에도 한 줄 넣을 것.
 */
const 화면: readonly (readonly [string, string])[] = [
  ["오버뷰", "/"],
  ["캠페인 목록", "/campaigns"],
  ["캠페인 허브", `/campaigns/${SAMPLE.campaignId}`],
  ["지원자", `/campaigns/${SAMPLE.campaignId}/applicants`],
  ["관리시트", `/campaigns/${SAMPLE.campaignId}/seeding-sheet`],
  ["사전조사", `/campaigns/${SAMPLE.campaignId}/pre-survey`],
  ["신청폼", `/campaigns/${SAMPLE.campaignId}/apply-form`],
  ["보고서", `/campaigns/${SAMPLE.campaignId}/reports`],
  ["행사 목록", "/events"],
  ["행사 상세", `/campaigns/${SAMPLE.campaignId}/events/${SAMPLE.eventId}`],
  ["SNS 목록", "/sns"],
  ["SNS 상세", `/sns/${SAMPLE.snsAccountId}`],
  ["활동 기록", "/settings/activity"],
  ["사용자 관리", "/settings/users"],
  ["PPT 템플릿", "/settings/ppt-templates"],
  ["안내 템플릿", "/settings/templates"],
  ["사전설문 설정", "/settings/pre-survey"],
  ["사용법", "/guide"],
];

test("한글이 고정폭 글꼴로 그려지는 자리가 없다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });

  const 걸린것: string[] = [];

  for (const [이름, url] of 화면) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");

    const 찾은것 = await page.evaluate(() => {
      const out: { 글자: string; 클래스: string }[] = [];
      const 한글 = /[가-힣]/;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
        if (!/mono/i.test(getComputedStyle(el).fontFamily)) continue;
        // 자식에게 물려준 글자 말고, 이 요소가 직접 가진 글자만 본다.
        const 직접글자 = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent || "")
          .join("")
          .replace(/\s+/g, " ")
          .trim();
        if (!직접글자 || !한글.test(직접글자)) continue;
        out.push({ 글자: 직접글자.slice(0, 30), 클래스: (el.className || "").toString().slice(0, 80) });
      }
      return out;
    });

    for (const f of 찾은것) {
      if (치환코드.test(f.글자)) continue;
      걸린것.push(`[${이름}] "${f.글자}"  ← ${f.클래스}`);
    }
  }

  const 고유 = [...new Set(걸린것)];
  expect(
    고유,
    `한글이 고정폭으로 그려지는 자리다. font-mono 를 빼고 tabular-nums 만 남겨라:\n${고유.join("\n")}`
  ).toEqual([]);
});
