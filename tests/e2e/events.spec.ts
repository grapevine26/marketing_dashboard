import { test, expect } from "@playwright/test";
import { SAMPLE, PPTX_MIME } from "./fixtures";

test.describe("B. 인플루언서 행사", () => {
  test("행사 생성 → 초대자·체크리스트 추가 → 상태 변경 → 운영안 저장 후에만 PPT 다운로드", async ({ page, request }) => {
    page.on("dialog", (d) => d.accept());

    // 1. 새 행사 (일시는 KST로 입력)
    await page.goto(`/campaigns/${SAMPLE.campaignId}/events`);
    await page.getByRole("button", { name: "새 행사 개설" }).click();
    await page.getByPlaceholder(/런칭 VIP 프라이빗 뷰티 나잇/).fill("E2E 런칭 파티");
    await page.locator("input[type='datetime-local']").fill("2026-09-20T18:30");
    await page.getByRole("button", { name: "행사 개설하기" }).click();
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
    const eventId = page.url().split("/").pop()!;
    await expect(page.getByRole("heading", { name: "E2E 런칭 파티" })).toBeVisible();
    // 서버 타임존과 무관하게 KST 그대로 표시
    await expect(page.getByText("2026-09-20 18:30")).toBeVisible();

    // 2. 운영안 미저장 상태에서는 PPT 내보내기가 400
    const noPlan = await request.get(`/campaigns/${SAMPLE.campaignId}/events/${eventId}/plan/export`);
    expect(noPlan.status()).toBe(400);
    expect(await noPlan.text()).toContain("저장된 운영안이 없습니다");

    // 3. 초대자 직접 추가 (빈 이름은 서버가 거부)
    await page.getByPlaceholder("이름 *").fill("   ");
    await page.evaluate(() => document.querySelectorAll("input[required]").forEach((el) => el.removeAttribute("required")));
    await page.getByRole("button", { name: "추가", exact: true }).click();
    await expect(page.getByText("이름을(를) 입력해주세요.")).toBeVisible();
    await page.getByPlaceholder("이름 *").fill("E2E 게스트");
    await page.getByRole("button", { name: "추가", exact: true }).click();
    const inviteeRow = page.getByRole("row", { name: /E2E 게스트/ });
    await expect(inviteeRow).toBeVisible();
    await inviteeRow.getByRole("combobox").selectOption("attending");
    await expect(page.getByText("1명").first()).toBeVisible();

    // 4. 체크리스트 + D-day
    await page.getByRole("button", { name: /체크리스트/ }).click();
    await page.getByPlaceholder("할 일 항목 내용 *").fill("E2E 리허설");
    await page.locator("input[type='date']").fill("2026-12-31");
    await page.getByRole("button", { name: "등록" }).click();
    await expect(page.getByText("E2E 리허설")).toBeVisible();
    await expect(page.getByText(/\(D-\d+\)/)).toBeVisible();

    // 5. 운영안 저장 → 다운로드 버튼 활성 → 200 + pptx
    await page.getByRole("button", { name: "운영안 작성 & PPT" }).click();
    await expect(page.getByRole("button", { name: /운영안 PPT 다운로드/ })).toBeHidden();
    await page.getByRole("button", { name: /^운영안 저장/ }).click();
    await expect(page.getByText("운영안이 저장되었습니다")).toBeVisible();
    await expect(page.getByRole("button", { name: /운영안 PPT 다운로드/ })).toBeVisible();

    const ppt = await request.get(`/campaigns/${SAMPLE.campaignId}/events/${eventId}/plan/export`);
    expect(ppt.status()).toBe(200);
    expect(ppt.headers()["content-type"]).toContain(PPTX_MIME);
    expect((await ppt.body()).subarray(0, 2).toString("latin1")).toBe("PK");

    // 6. 상태 변경이 목록에 반영된다
    await page.locator("select").first().selectOption("done");
    await page.goto(`/campaigns/${SAMPLE.campaignId}/events`);
    await expect(page.getByRole("link", { name: /E2E 런칭 파티/ })).toContainText("행사완료");
  });

  test("AI 키가 없으면 AI 초안은 폴백 안내를 보여주고 기존 값을 덮어쓰지 않는다", async ({ page }) => {
    await page.goto(`/campaigns/${SAMPLE.campaignId}/events/${SAMPLE.eventId}`);
    await page.getByRole("button", { name: "운영안 작성 & PPT" }).click();
    const brandField = page.locator("textarea").first();
    const before = await brandField.inputValue();
    expect(before.length).toBeGreaterThan(0);
    await page.getByRole("button", { name: "AI 초안" }).first().click();
    await expect(page.getByText("AI 제안 실패 — 직접 입력해주세요.")).toBeVisible();
    await expect(brandField).toHaveValue(before);
  });
});
