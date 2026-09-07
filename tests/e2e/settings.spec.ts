import { test, expect } from "@playwright/test";

test.describe("설정 화면", () => {
  test("사전조사 템플릿: 저장된 값이 채워져 있고 수정 후 새로고침해도 유지된다", async ({ page }) => {
    await page.goto("/settings/templates");
    const first = page.locator("input[placeholder*='핵심 특징은 무엇인가요']").first();
    await expect(first).not.toHaveValue("");
    const original = await first.inputValue();

    await first.fill(`${original} (E2E)`);
    await page.getByRole("button", { name: "템플릿 저장하기" }).click();
    await expect(page.getByText("기본 템플릿이 성공적으로 저장되었습니다!")).toBeVisible();

    await page.reload();
    await expect(page.locator("input[placeholder*='핵심 특징은 무엇인가요']").first()).toHaveValue(`${original} (E2E)`);
  });

  test("SNS 사전설문 템플릿: 탭으로 전환되고 질문을 비우면 저장이 거부된다", async ({ page }) => {
    // ?tab=sns 로 바로 열리는지 확인 (가이드가 이 주소로 링크한다)
    await page.goto("/settings/templates?tab=sns");
    await expect(page.getByText("표준 사전설문 문항")).toBeVisible();

    // 탭 전환도 동작해야 한다
    await page.getByRole("button", { name: "사전조사 템플릿" }).click();
    await expect(page.getByText("표준 사전조사 문항")).toBeVisible();
    await page.getByRole("button", { name: "SNS 사전설문 템플릿" }).click();
    await expect(page.getByText("표준 사전설문 문항")).toBeVisible();

    await page.getByRole("button", { name: "새 질문 문항 추가" }).click();
    await page.getByRole("button", { name: "템플릿 저장하기" }).click();
    await expect(page.getByText(/질문 내용을\(를\) 입력해주세요/)).toBeVisible();
  });

  test("PPT 템플릿 보관함: 내장 템플릿은 삭제 버튼이 없고 pptx 외 파일은 거부된다", async ({ page }) => {
    await page.goto("/settings/ppt-templates");
    await expect(page.getByText("기본 내장").first()).toBeVisible();
    const builtinCard = page.locator("div").filter({ hasText: "기본 인플루언서 행사 운영안 템플릿" }).filter({ has: page.getByText("기본 내장") }).last();
    expect(await builtinCard.getByTitle("삭제").count()).toBe(0);

    await page.getByPlaceholder(/템플릿 명칭/).fill("잘못된 파일");
    await page.locator("input[type='file']").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await page.evaluate(() => document.querySelectorAll("input[required]").forEach((el) => el.removeAttribute("required")));
    await page.getByRole("button", { name: "템플릿 등록 및 분석" }).click();
    await expect(page.getByText(".pptx 파일만 업로드할 수 있습니다.")).toBeVisible();
  });
});
