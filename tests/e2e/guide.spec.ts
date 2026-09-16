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

/** 공유 링크 카드의 제목. "1. 광고주 시안 승인(컨펌) 링크" 처럼 번호로 시작해 "링크" 로 끝난다. */
const LINK_CARD_TITLE = /^\d+\.\s.+링크$/;

/**
 * 이 화면에 있는 공유 링크 카드의 제목을 모아 온다. `least` 장이 **보일 때까지** 기다린다.
 *
 * 처음에는 `body.innerText()` 를 통째로 읽어 정규식을 돌렸다. 그런데 `page.goto` 는 load 에서
 * 풀리고, 이 앱은 `app/(dashboard)/loading.tsx` 로 **골격을 먼저 흘려보낸다.** 그 순간의 본문은
 * 아직 골격이라 아무것도 안 잡혀 "카드가 0개" 로 깨졌다. 화면은 멀쩡한데 테스트만 가끔
 * 깨지는 모양이라 원인을 찾기 어렵다.
 *
 * **`count()` 로 기다리는 것으로는 부족하다** — DOM 에 있기만 하면 화면에 안 보여도 세기 때문에,
 * 아직 안 그려진 상태에서 그냥 통과한다(그렇게 고쳤다가 다시 깨졌다). `visible: true` 로 거른다.
 *
 * 본문 전체를 읽는 대신 카드 요소에서 직접 읽는다. 그러면 "무엇을 세었는가" 와
 * "무엇을 읽었는가" 가 같은 것이 되어 둘이 어긋날 자리가 없다.
 */
async function linkCardTitles(page: Page, least: number): Promise<string[]> {
  const cards = page.getByText(LINK_CARD_TITLE).filter({ visible: true });
  await expect
    .poll(() => cards.count(), { message: `공유 링크 카드가 ${least}장 이상 보이지 않았다` })
    .toBeGreaterThanOrEqual(least);
  return (await cards.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
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
    await page.goto(`/campaigns/${SAMPLE.campaignId}`);
    const campaignTitles = (await linkCardTitles(page, 4)).filter((t) => /^\d+\. (광고주|인플루언서)/.test(t));
    expect(campaignTitles.length, "캠페인 관리 허브의 공유 링크 카드").toBeGreaterThanOrEqual(4);

    await page.goto(`/sns/${SAMPLE.snsAccountId}`);
    const snsTitles = (await linkCardTitles(page, 2)).filter((t) => /^\d+\. 광고주/.test(t));
    expect(snsTitles.length, "SNS 계정 화면의 공유 링크 카드").toBeGreaterThanOrEqual(2);

    await page.goto("/guide");
    const table = await guideText(page, "#links");
    for (const title of [...new Set([...campaignTitles, ...snsTitles])]) {
      expect(LINK_CARD_TITLE.test(title)).toBe(true);
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
        // 화면 버튼은 가이드가 부르는 이름으로 "시작"하면 된다.
        // 예: 가이드의 [AI 추천받기] → 화면에서는 "AI 추천받기 (3회 가능)" 처럼 횟수가 덧붙는다.
        // 아이콘이 앞에 붙은 버튼은 텍스트 앞에 공백이 남는다. 정규식 매칭은 그 공백을 다듬지 않는다.
        const startsWith = new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
        await expect(
          page.getByText(startsWith).filter({ visible: true }).first(),
          `${c.url} 에 "${label}" 로 시작하는 버튼이 없다 (가이드가 이 이름으로 안내하고 있다)`
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
