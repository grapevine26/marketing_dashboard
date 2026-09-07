import { test, expect, Page } from "@playwright/test";
import { SAMPLE } from "./fixtures";
import { SHIPPING_STAGES, VISIT_STAGES } from "../../lib/seeding/stages";

/**
 * 사용법 페이지가 실제 화면과 어긋나지 않는지 검사한다.
 * 가이드는 정적 문서라 코드가 바뀌어도 조용히 낡는다. 여기서 잡는다.
 */

/** 한글 문장이 쉼표·마침표에 붙어 나오는 곳을 찾는다. JSX 줄바꿈으로 공백이 사라지는 실수를 막는다. */
const GLUED_PUNCTUATION = /[,.][가-힣]/g;

async function guideText(page: Page, selector = "body"): Promise<string> {
  return (await page.locator(selector).innerText()).replace(/\s+/g, " ");
}

test.describe("사용법 페이지", () => {
  test("목차 버튼이 가리키는 섹션이 모두 존재한다", async ({ page }) => {
    await page.goto("/guide");

    const hrefs = await page.locator('a[href^="#"]').evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute("href") || "")
    );
    expect(hrefs.length).toBeGreaterThanOrEqual(6);

    for (const href of hrefs) {
      const id = href.slice(1);
      await expect(page.locator(`#${id}`), `목차가 가리키는 #${id} 섹션이 없다`).toHaveCount(1);
    }
  });

  test("관리시트 단계 설명이 실제 관리시트의 선택지와 같다", async ({ page }) => {
    // 가이드에 적힌 두 유형의 단계 순서
    await page.goto("/guide");
    const seeding = await guideText(page, "#seeding");
    expect(seeding).toContain(SHIPPING_STAGES.join(" → "));
    expect(seeding).toContain(VISIT_STAGES.join(" → "));

    // 실제 화면(배송형 샘플 캠페인)의 단계 드롭다운과 대조
    await page.goto(`/campaigns/${SAMPLE.campaignId}/seeding-sheet`);
    const select = page.locator("select").filter({ visible: true }).first();
    await expect(select).toBeVisible();
    const options = await select.locator("option").allInnerTexts();
    expect(options.map((o) => o.trim())).toEqual([...SHIPPING_STAGES]);
  });

  test("공유 링크 표의 링크 이름이 실제 화면의 카드 제목과 같다", async ({ page }) => {
    const linkTitlePattern = /^\d\.\s.+링크$/;

    await page.goto(`/campaigns/${SAMPLE.campaignId}`);
    const campaignTitles = (await guideText(page)).match(/\d\. (광고주|인플루언서)[^\n]{2,30}?링크/g) || [];
    expect(campaignTitles.length).toBeGreaterThanOrEqual(4);

    await page.goto(`/sns/${SAMPLE.snsAccountId}`);
    const snsTitles = (await guideText(page)).match(/\d\. 광고주[^\n]{2,30}?링크/g) || [];
    expect(snsTitles.length).toBeGreaterThanOrEqual(2);

    await page.goto("/guide");
    const table = await guideText(page, "#links");
    for (const title of [...new Set([...campaignTitles, ...snsTitles])]) {
      expect(linkTitlePattern.test(title)).toBe(true);
      expect(table, `공유 링크 표에 "${title}"이 없다`).toContain(title);
    }
  });

  test("가이드가 이름을 댄 버튼이 실제 화면에 존재한다", async ({ page }) => {
    const cases: { url: string; labels: string[] }[] = [
      { url: "/campaigns", labels: ["새 캠페인 등록"] },
      {
        url: `/campaigns/${SAMPLE.campaignId}`,
        labels: ["사전조사 관리", "지원자 심사", "관리시트 열기", "보고서 생성", "신청폼 에디터"],
      },
      {
        url: `/campaigns/${SAMPLE.campaignId}/apply-form`,
        labels: ["Gemini AI 모집글 초안 생성", "공개 신청폼 미리보기"],
      },
      {
        url: `/campaigns/${SAMPLE.campaignId}/applicants`,
        labels: ["안내문", "최종선정", "예비선정", "미선정"],
      },
      { url: `/campaigns/${SAMPLE.campaignId}/reports`, labels: ["현재 데이터로 새 결과보고서 생성"] },
      {
        url: `/campaigns/${SAMPLE.campaignId}/events/${SAMPLE.eventId}`,
        labels: ["캠페인 지원자에서 가져오기", "초대자 직접 추가"],
      },
      { url: `/sns/${SAMPLE.snsAccountId}`, labels: ["새 콘텐츠 기획", "계정 수정", "SNS 운영안 (웹/PPT)"] },
      { url: `/pre-survey/${SAMPLE.preSurveyToken}`, labels: ["AI 추천받기"] },
      { url: `/sns-intake/${SAMPLE.snsIntakeToken}`, labels: ["AI 추천 답변"] },
    ];

    for (const c of cases) {
      await page.goto(c.url);
      for (const label of c.labels) {
        await expect(
          page.getByText(label, { exact: true }).filter({ visible: true }).first(),
          `${c.url} 에 "${label}" 이 없다 (가이드가 이 이름으로 안내하고 있다)`
        ).toBeVisible();
      }
    }
  });

  test("가이드가 안내하는 사실이 실제 동작과 맞는다", async ({ page }) => {
    // 행사는 캠페인 없이 개설할 수 없다고 안내한다
    await page.goto("/guide");
    expect(await guideText(page, "#before")).toContain("캠페인");

    await page.goto("/events");
    await page.getByRole("button", { name: /새 행사 개설/ }).first().click();
    await expect(page.getByText("연계 캠페인 선택 *")).toBeVisible();

    // 운영안을 저장하기 전에는 PPT를 받을 수 없다고 안내한다
    const res = await page.request.get(
      `/campaigns/${SAMPLE.campaignId}/events/${SAMPLE.eventId}/plan/export`
    );
    if (res.status() !== 200) {
      expect(await res.text()).toMatch(/운영안|템플릿/);
    }
  });

  test("문장부호 뒤 공백이 빠진 곳이 없고 모바일에서 가로로 넘치지 않는다", async ({ page }) => {
    await page.goto("/guide");
    const body = await guideText(page, "main");
    const glued = body.match(GLUED_PUNCTUATION) || [];
    expect(glued, `공백 없이 붙은 문장부호: ${glued.join(", ")}`).toHaveLength(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflow, "모바일에서 가로 스크롤이 생긴다").toBe(false);
  });
});
