import { test, expect } from "@playwright/test";

test.describe("D. 통합 오버뷰", () => {
  test("임박 목록과 월간 캘린더가 렌더링되고 월 이동 링크가 동작한다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /임박 및 지연 일정/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /전체 마케팅 통합 일정/ })).toBeVisible();

    // 샘플 데이터에 D-3 이내 항목이 있으므로 카드가 1개 이상 있어야 한다
    const cards = page.locator("a[href^='/campaigns/'], a[href^='/sns/']").filter({ hasText: /D-|D\+/ });
    expect(await cards.count()).toBeGreaterThan(0);

    await page.getByRole("link", { name: "다음 달" }).click();
    await expect(page).toHaveURL(/\?month=\d{4}-\d{2}$/);
    await page.getByRole("link", { name: "이전 달" }).click();
    await expect(page).toHaveURL(/\?month=\d{4}-\d{2}$/);
  });

  test("잘못된 month 파라미터는 오늘 달로 폴백하고 NaN을 보여주지 않는다", async ({ page }) => {
    await page.goto("/?month=abc");
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("NaN");
    await expect(page.getByRole("heading", { name: /\d{4}년 \d{1,2}월 전체 마케팅 통합 일정/ })).toBeVisible();
  });

  test("날짜 칸을 클릭하면 그 날짜의 일정 모달이 열린다", async ({ page }) => {
    await page.goto("/");
    const cellWithItems = page.locator(".grid.grid-cols-7 > div").filter({ has: page.locator("a[href^='/']") }).first();
    await cellWithItems.click();
    await expect(page.getByRole("heading", { name: /\d{4}-\d{2}-\d{2} 전체 일정/ })).toBeVisible();
    await page.getByRole("button", { name: "닫기" }).click();
    await expect(page.getByRole("heading", { name: /전체 일정$/ })).toBeHidden();
  });
});
