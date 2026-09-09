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

  test("승인 대기 콘텐츠 카드를 클릭하면 모달이 열리고, 항목 클릭 시 해당 SNS 계정의 콘텐츠 목록 및 성과 관리 탭으로 이동한다", async ({ page }) => {
    await page.goto("/");
    const card = page.getByRole("button", { name: /승인 대기 콘텐츠/ });
    await expect(card).toBeVisible();
    await card.click();

    await expect(page.getByRole("heading", { name: "승인 대기 콘텐츠 목록" })).toBeVisible();

    const pendingItem = page.locator("div[role='dialog'] div.cursor-pointer").first();
    if (await pendingItem.isVisible()) {
      await pendingItem.click();
      await expect(page).toHaveURL(/\/sns\/[^\/]+\?tab=list/);
      const listTabBtn = page.getByRole("button", { name: /콘텐츠 목록 및 성과 관리/ });
      await expect(listTabBtn).toHaveClass(/text-accent2/);
    } else {
      await page.getByRole("button", { name: "닫기" }).click();
      await expect(page.getByRole("heading", { name: "승인 대기 콘텐츠 목록" })).toBeHidden();
    }
  });

  test("이번주 발행 예정 콘텐츠 카드를 클릭하면 모달이 열리고, 항목 클릭 시 해당 SNS 계정의 콘텐츠 목록 및 성과 관리 탭으로 이동한다", async ({ page }) => {
    await page.goto("/");
    const card = page.getByRole("button", { name: /이번주 발행 예정/ });
    await expect(card).toBeVisible();
    await card.click();

    await expect(page.getByRole("heading", { name: "이번주 발행 예정 콘텐츠" })).toBeVisible();

    const scheduledItem = page.locator("div[role='dialog'] div.cursor-pointer").first();
    if (await scheduledItem.isVisible()) {
      await scheduledItem.click();
      await expect(page).toHaveURL(/\/sns\/[^\/]+\?tab=list/);
      const listTabBtn = page.getByRole("button", { name: /콘텐츠 목록 및 성과 관리/ });
      await expect(listTabBtn).toHaveClass(/text-accent2/);
    } else {
      await page.getByRole("button", { name: "닫기" }).click();
      await expect(page.getByRole("heading", { name: "이번주 발행 예정 콘텐츠" })).toBeHidden();
    }
  });

  test("캘린더나 긴급 일정에서 행사준비 항목 클릭 시 해당 행사의 체크리스트 탭으로 이동하고 항목이 포커스된다", async ({ page }) => {
    await page.goto("/");
    const checklistLink = page.locator("a[href*='tab=checklist&checklistId=']").first();
    if (await checklistLink.isVisible()) {
      await checklistLink.click();
      await expect(page).toHaveURL(/tab=checklist&checklistId=/);
      await expect(page.getByRole("heading", { name: "행사 준비 체크리스트 & 할 일" })).toBeVisible();
      await expect(page.getByText("선택된 준비항목")).toBeVisible();
    }
  });

  test("모바일 뷰포트(375x667)에서 가로 스크롤 없이 깔끔하게 렌더링되고 달력/목록 전환 및 모달이 동작한다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    // 1. 가로 스크롤 없음 검증
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // 2. 상단 4대 KPI 카드가 정상 노출되는지 확인
    await expect(page.getByText("진행중 캠페인")).toBeVisible();
    await expect(page.getByText("준비중인 행사")).toBeVisible();
    await expect(page.getByRole("button", { name: /승인 대기 콘텐츠/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /이번주 발행 예정/ })).toBeVisible();

    // 3. 달력/목록 전환 뷰 동작 확인
    const agendaBtn = page.getByRole("button", { name: "목록 뷰" });
    await agendaBtn.click();
    await expect(page.getByRole("button", { name: "목록 뷰" })).toHaveClass(/bg-surface/);

    const calBtn = page.getByRole("button", { name: "달력 뷰" });
    await calBtn.click();
    await expect(page.getByRole("button", { name: "달력 뷰" })).toHaveClass(/bg-surface/);

    // 4. 날짜 셀 클릭 시 일정 모달이 열리고 닫기 동작
    const cell = page.locator(".grid.grid-cols-7 > div").filter({ hasText: "15" }).first();
    if (await cell.isVisible()) {
      await cell.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: "닫기" }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
    }
  });
});
