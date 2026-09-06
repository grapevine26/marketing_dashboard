import { test, expect } from "@playwright/test";
import path from "path";

const SCREENSHOT_DIR = "C:/Users/PC/.gemini/antigravity/brain/9f8b7882-3031-411b-af03-3085a9abe75e/screenshots";

test.describe("실제 화면 시각적 검증 (Visual Verification)", () => {
  test("1. 지원자 목록, 팔로워수, 메모, 메시지 템플릿 모달 화면 캡처", async ({ page }) => {
    await page.goto("/campaigns/c1a2b3c4-0001-4000-8000-000000000001/applicants");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-applicants-table.png"), fullPage: true });

    // Open template modal
    const copyBtn = page.locator("button:has-text('안내문')").first();
    if (await copyBtn.isVisible()) {
      await copyBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-message-template-modal.png") });
    }
  });

  test("2. 캠페인 허브: 웹훅 연동 및 실시간 변경이력(감사로그) 화면 캡처", async ({ page }) => {
    await page.goto("/campaigns/c1a2b3c4-0001-4000-8000-000000000001");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-campaign-webhook-audit.png"), fullPage: true });
  });

  test("3. 캠페인 목록: 보관/완료 필터 및 인스턴트 검색 캡처", async ({ page }) => {
    await page.goto("/campaigns");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04-campaigns-list.png"), fullPage: true });
  });

  test("4. SNS 관리 화면: 탭 및 콘텐츠 모달 화면 캡처", async ({ page }) => {
    await page.goto("/sns/s1a2b3c4-0001-4000-8000-000000000001");
    await page.waitForLoadState("networkidle");
    // Switch to list tab
    await page.click("button:has-text('목록')");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05-sns-list-tab.png"), fullPage: true });

    // Open create content modal to verify media upload UI
    await page.click("button:has-text('새 콘텐츠 기획')");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06-sns-content-modal-media.png") });
  });

  test("5. 광고주 시안 승인 공개 화면 캡처", async ({ page }) => {
    await page.goto("/sns-approval/sns_appr_tok_12345");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07-sns-approval-client.png"), fullPage: true });
  });

  test("6. 캠페인 공유 토큰 재발급 모달 화면 캡처", async ({ page }) => {
    await page.goto("/campaigns/c1a2b3c4-0001-4000-8000-000000000001");
    await page.waitForLoadState("networkidle");
    // Click 재발급 on the first link
    const regenBtn = page.locator("button:has-text('재발급')").first();
    await regenBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08-campaign-token-reissue-modal.png") });
  });

  test("7. 공개 지원폼 중복 SNS 감지 경고 배너 캡처", async ({ page }) => {
    await page.goto("/apply/apply_tok_demo_12345");
    await page.waitForLoadState("networkidle");

    // Fill form with an already existing SNS link
    await page.fill("input[placeholder='홍길동']", "중복테스터");
    await page.fill("input[placeholder='https://instagram.com/your_id']", "https://instagram.com/cosmetic_creator_01");
    await page.fill("input[placeholder='010-1234-5678']", "010-9999-8888");
    await page.fill("input[placeholder*='테헤란로']", "서울시 서초구 강남대로 123");

    // Fill custom required questions
    const select = page.locator("select");
    if (await select.isVisible()) {
      await select.selectOption({ index: 1 });
    }
    const numberInput = page.locator("input[type='number']").last();
    if (await numberInput.isVisible()) {
      await numberInput.fill("12");
    }

    await page.check("input[type='checkbox'] >> nth=0"); // privacy agree

    // First submission
    await page.click("button:has-text('인플루언서 지원서 제출하기')");
    await page.waitForTimeout(1000);

    // Second submission with same SNS link
    await page.goto("/apply/apply_tok_demo_12345");
    await page.waitForLoadState("networkidle");

    await page.fill("input[placeholder='홍길동']", "중복테스터");
    await page.fill("input[placeholder='https://instagram.com/your_id']", "https://instagram.com/cosmetic_creator_01");
    await page.fill("input[placeholder='010-1234-5678']", "010-9999-8888");
    await page.fill("input[placeholder*='테헤란로']", "서울시 서초구 강남대로 123");

    const select2 = page.locator("select");
    if (await select2.isVisible()) {
      await select2.selectOption({ index: 1 });
    }
    const numberInput2 = page.locator("input[type='number']").last();
    if (await numberInput2.isVisible()) {
      await numberInput2.fill("12");
    }

    await page.check("input[type='checkbox'] >> nth=0");
    await page.click("button:has-text('인플루언서 지원서 제출하기')");
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09-apply-duplicate-warning.png"), fullPage: true });
  });

  test("8. SNS 전용 링크 재발급 모달 화면 캡처", async ({ page }) => {
    await page.goto("/sns/s1a2b3c4-0001-4000-8000-000000000001");
    await page.waitForLoadState("networkidle");
    const regenBtn = page.locator("button:has-text('재발급')").first();
    await regenBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10-sns-token-reissue-modal.png") });
  });
});
