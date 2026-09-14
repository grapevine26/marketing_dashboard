import { test, expect } from "@playwright/test";
import { PPTX_MIME, SAMPLE, kstPlusDays, withServerAction } from "./fixtures";

// 날짜를 코드에 박아 두면 그 날이 지나는 순간 D-day 검증이 조용히 깨진다. 오늘 기준으로 잡는다.
const EVENT_DAY = kstPlusDays(5);
const CHECKLIST_DAY = kstPlusDays(30);

test.describe("B. 인플루언서 행사", () => {
  test("행사 생성 → 초대자·체크리스트 추가 → 상태 변경 → 운영안 저장 후에만 PPT 다운로드", async ({ page, request }) => {
    page.on("dialog", (d) => d.accept());

    // 1. 새 행사 (일시는 KST로 입력)
    await page.goto(`/campaigns/${SAMPLE.campaignId}/events`);
    await page.getByRole("button", { name: "새 행사 개설" }).click();
    await page.getByPlaceholder(/런칭 VIP 프라이빗 뷰티 나잇/).fill("E2E 런칭 파티");
    await page.locator("input[type='datetime-local']").fill(`${EVENT_DAY}T18:30`);
    await page.getByRole("button", { name: "행사 개설하기" }).click();
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
    const eventId = page.url().split("/").pop()!;
    await expect(page.getByRole("heading", { name: "E2E 런칭 파티" })).toBeVisible();
    // 서버 타임존과 무관하게 KST 그대로 표시
    await expect(page.getByText(`${EVENT_DAY} 18:30`)).toBeVisible();

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
    await page.locator("input[type='date']").fill(CHECKLIST_DAY);
    await page.getByRole("button", { name: "등록" }).click();
    await expect(page.getByText("E2E 리허설")).toBeVisible();
    await expect(page.getByText(/\(D-\d+\)/)).toBeVisible();

    // 5. 운영안 저장 → 다운로드 버튼 활성 → 200 + pptx
    await page.getByRole("button", { name: "운영안 작성 & PPT" }).click();
    await expect(page.getByRole("button", { name: /운영안 PPT 다운로드/ })).toBeHidden();
    await page.getByRole("button", { name: /^운영안 저장/ }).click();
    // 저장하면 화면 안내와 토스트가 함께 뜬다. 둘 다 같은 문구를 담고 있으므로 안내 쪽을 정확히 집는다.
    await expect(page.getByText("운영안이 저장되었습니다. 이제 PPT를 다운로드할 수 있습니다.")).toBeVisible();
    await expect(page.getByRole("button", { name: /운영안 PPT 다운로드/ })).toBeVisible();

    const ppt = await request.get(`/campaigns/${SAMPLE.campaignId}/events/${eventId}/plan/export`);
    expect(ppt.status()).toBe(200);
    expect(ppt.headers()["content-type"]).toContain(PPTX_MIME);
    expect((await ppt.body()).subarray(0, 2).toString("latin1")).toBe("PK");

    // 6. 상태 변경이 목록에 반영된다
    // 상태 드롭다운은 저장 완료를 알리는 문구가 없다. 서버 액션 응답을 기다리지 않고 바로
    // 다른 화면으로 넘어가면 저장이 끊겨 목록에 반영되지 않는다.
    const statusSelect = page.locator("select").first();
    await withServerAction(page, () => statusSelect.selectOption("done"));
    await expect(statusSelect).toHaveValue("done");

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

  test("전체 행사 관리 페이지(/events)에서 검색 및 캠페인 드롭다운 필터가 동작한다", async ({ page }) => {
    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "인플루언서 행사 관리 (전체)" })).toBeVisible();
    const searchInput = page.getByPlaceholder("행사명, 브랜드명, 장소 검색...");
    await expect(searchInput).toBeVisible();

    const campaignSelect = page.locator("select").filter({ hasText: /전체 캠페인/ });
    await expect(campaignSelect).toBeVisible();

    await searchInput.fill("존재하지않은행사이름XYZ");
    await expect(page.getByText("선택한 조건에 해당하는 행사가 없습니다.")).toBeVisible();

    await page.getByRole("button", { name: "필터 초기화" }).click();
    await expect(searchInput).toHaveValue("");
  });
});
