import { test, expect } from "@playwright/test";
import fs from "fs";
import { SAMPLE } from "./fixtures";

/**
 * 접근성 회귀를 막는다.
 *
 * 두 가지를 본다.
 *  1. **이름 없는 컨트롤** — 화면낭독기가 "버튼", "콤보상자" 라고만 읽는 것들.
 *     axe 로 실제 화면을 훑어 27개 화면에서 16종을 찾았고 전부 이름을 붙였다.
 *  2. **모달의 포커스 가둠** — 모달은 화면을 덮지만 탭 키는 그걸 모른다. 처리를 안 하면
 *     포커스가 모달 뒤에 가려진 화면으로 새어 나가, 키보드를 쓰는 사람은 자기가 어디
 *     있는지 알 수 없게 된다.
 *
 * axe 소스는 `node_modules/axe-core` 를 그대로 주입한다(eslint-plugin-jsx-a11y 가 이미
 * 끌고 오는 것이라 의존성이 늘지 않는다). CSP 가 스크립트 태그를 막지만 evaluate 는
 * 격리된 경로라 영향받지 않는다.
 */
const axeSource = fs.readFileSync("node_modules/axe-core/axe.min.js", "utf-8");

/** 이름이 반드시 있어야 하는 규칙들. 색 대비는 따로 다룬다(디자인 판단이 필요하다). */
const 이름규칙 = ["label", "select-name", "button-name", "link-name", "image-alt", "aria-input-field-name"];

const 화면: readonly (readonly [string, string])[] = [
  ["오버뷰", "/"],
  ["캠페인 목록", "/campaigns"],
  ["캠페인 허브", `/campaigns/${SAMPLE.campaignId}`],
  ["지원자", `/campaigns/${SAMPLE.campaignId}/applicants`],
  ["관리시트", `/campaigns/${SAMPLE.campaignId}/seeding-sheet`],
  ["신청폼 편집", `/campaigns/${SAMPLE.campaignId}/apply-form`],
  ["캠페인 행사", `/campaigns/${SAMPLE.campaignId}/events`],
  ["행사 상세", `/campaigns/${SAMPLE.campaignId}/events/${SAMPLE.eventId}`],
  ["행사 목록", "/events"],
  ["SNS 목록", "/sns"],
  ["SNS 상세", `/sns/${SAMPLE.snsAccountId}`],
  ["SNS 운영안", `/sns/${SAMPLE.snsAccountId}/plan`],
  ["사용자 관리", "/settings/users"],
  ["PPT 템플릿", "/settings/ppt-templates"],
  ["공개 신청폼", `/apply/${SAMPLE.applyToken}`],
  ["공개 사전조사", `/pre-survey/${SAMPLE.preSurveyToken}`],
  ["광고주 지원자", `/applicants/${SAMPLE.applicantsShareToken}`],
];

test("이름 없는 컨트롤이 없다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const 걸린것: string[] = [];

  for (const [이름, url] of 화면) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    await page.evaluate(axeSource);
    const out = (await page.evaluate(async (rules) => {
      // @ts-expect-error 위에서 주입했다
      const r = await window.axe.run(document, { runOnly: { type: "rule", values: rules } });
      return r.violations.flatMap((v: { id: string; nodes: { html: string }[] }) =>
        v.nodes.map((n) => ({ id: v.id, html: n.html.replace(/\s+/g, " ").slice(0, 120) }))
      );
    }, 이름규칙)) as { id: string; html: string }[];

    for (const v of out) 걸린것.push(`[${이름}] ${v.id}\n    ${v.html}`);
  }

  const 고유 = [...new Set(걸린것)];
  expect(
    고유,
    `화면낭독기가 이름을 읽어 줄 수 없는 컨트롤이다. 보이는 라벨이 있으면 htmlFor/id 로 잇고,\n없으면 aria-label 을 준다:\n${고유.join("\n")}`
  ).toEqual([]);
});

test("모달을 열면 탭 포커스가 그 안에 갇힌다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  const 여는버튼 = page.getByRole("button", { name: "진행중 캠페인 목록 확인" });
  await 여는버튼.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // 탭을 여러 번 눌러도 포커스가 모달 밖으로 나가면 안 된다.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const 안에있나 = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return !!d && !!document.activeElement && d.contains(document.activeElement);
    });
    expect(안에있나, `탭 ${i + 1}번째에 포커스가 모달 밖으로 나갔다`).toBe(true);
  }

  // 닫으면 열기 전 자리로 돌아와야 한다. 문서 맨 앞으로 튀면 아까 누른 자리까지
  // 탭을 수십 번 눌러 돌아가야 한다.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const 돌아왔나 = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.getAttribute("aria-label") ?? "";
  });
  expect(돌아왔나).toBe("진행중 캠페인 목록 확인");
});
