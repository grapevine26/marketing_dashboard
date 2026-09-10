import { test, expect } from "@playwright/test";

test.describe("모바일 반응형 UX/UI 전수 검증", () => {
  const viewports = [
    { name: "iPhone SE (375px)", width: 375, height: 667 },
    { name: "Galaxy S20 (360px)", width: 360, height: 740 },
  ];

  for (const vp of viewports) {
    test.describe(`${vp.name} 환경 검증`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
      });

      test("오버뷰 페이지(/)에서 가로 넘침이 없고 주요 모바일 컴포넌트가 렌더링된다", async ({ page }) => {
        await page.goto("/");
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasOverflow).toBe(false);
      });

      test("캠페인 목록 페이지(/campaigns)에서 가로 넘침이 없고 필터와 카드가 정상 표시된다", async ({ page }) => {
        await page.goto("/campaigns");
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasOverflow).toBe(false);
        await expect(page.getByRole("heading", { name: "인플루언서 시딩 캠페인" })).toBeVisible();
      });

      test("행사 목록 페이지(/events)에서 가로 넘침이 없고 검색/필터 바가 정상 표시된다", async ({ page }) => {
        await page.goto("/events");
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasOverflow).toBe(false);
        await expect(page.getByRole("heading", { name: "인플루언서 행사 관리" })).toBeVisible();
      });

      test("SNS 계정 목록 페이지(/sns)에서 가로 넘침이 없고 계정 카드가 정상 표시된다", async ({ page }) => {
        await page.goto("/sns");
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasOverflow).toBe(false);
        await expect(page.getByRole("heading", { name: /SNS.*대행 운영/ })).toBeVisible();
      });

      test("템플릿 설정 페이지(/settings/templates)에서 가로 넘침이 없다", async ({ page }) => {
        await page.goto("/settings/templates");
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasOverflow).toBe(false);
        await expect(page.getByRole("heading", { name: "템플릿 설정" })).toBeVisible();
      });

      test("가이드 매뉴얼 페이지(/guide)에서 가로 넘침이 없다", async ({ page }) => {
        await page.goto("/guide");
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasOverflow).toBe(false);
        await expect(page.getByRole("heading", { name: /MOA.*사용 가이드/ })).toBeVisible();
      });
    });
  }
});
