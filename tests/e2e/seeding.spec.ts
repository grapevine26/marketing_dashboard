import { test, expect, Page } from "@playwright/test";
import { SAMPLE } from "./fixtures";

/** 캠페인 허브의 공유 링크 박스에서 특정 경로의 공개 URL을 읽는다 */
async function readShareUrl(page: Page, pathPrefix: string): Promise<string> {
  const inputs = page.locator("input[readonly]");
  await expect(inputs.first()).toHaveValue(/http/);
  const values = await inputs.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
  const found = values.find((v) => v.includes(pathPrefix));
  expect(found, `share url with ${pathPrefix}`).toBeTruthy();
  return found!;
}

test.describe("A. 인플루언서 시딩 전체 흐름", () => {
  test("캠페인 생성 → 지원폼 제출 → 최종선정 → 관리시트 → 보고서 PDF/PPTX", async ({ page, request }) => {
    // 1. 캠페인 생성
    await page.goto("/campaigns/new");
    await page.getByPlaceholder("예: 글로우랩 하이드라 세럼 인플루언서 시딩").fill("E2E 테스트 캠페인");
    await page.getByPlaceholder("예: 글로우랩 코스메틱").fill("E2E 브랜드");
    await page.getByRole("button", { name: "캠페인 생성하기" }).click();
    await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{36}$/);
    const campaignId = page.url().split("/").pop()!;
    await expect(page.getByRole("heading", { name: "E2E 테스트 캠페인" })).toBeVisible();

    // 2. 공개 지원폼 URL 확보 (다른 용도 토큰이 지원폼 HTML에 섞여 나오면 안 된다)
    const applyUrl = await readShareUrl(page, "/apply/");
    const shareUrl = await readShareUrl(page, "/applicants/");
    const shareToken = shareUrl.split("/").pop()!;

    await page.goto(applyUrl);
    const applyHtml = await page.content();
    expect(applyHtml).not.toContain(shareToken);
    expect(applyHtml).not.toContain("applicants_share_token");

    // 3. 지원폼 제출 (개인정보 미동의 → 서버가 거부)
    await page.getByPlaceholder("홍길동").fill("E2E 인플루언서");
    await page.getByPlaceholder("https://instagram.com/your_id").fill("https://instagram.com/e2e_tester");
    await page.getByPlaceholder("010-1234-5678").fill("010-5555-6666");
    await page.getByPlaceholder("서울특별시 강남구 테헤란로 123 401호").fill("서울시 E2E로 1");
    // required 체크박스를 브라우저 검증 없이 제출해 서버 검증을 확인
    await page.evaluate(() => {
      document.querySelectorAll("input[required]").forEach((el) => el.removeAttribute("required"));
    });
    await page.getByRole("button", { name: "인플루언서 지원서 제출하기" }).click();
    await expect(page.getByText("개인정보 수집 및 이용에 동의해주세요.")).toBeVisible();

    await page.getByLabel(/\(필수\) 개인정보/).check();
    await page.getByRole("button", { name: "인플루언서 지원서 제출하기" }).click();
    await expect(page.getByText("지원이 성공적으로 완료되었습니다!")).toBeVisible();

    // 4. 대시보드 지원자 목록에서 최종선정
    await page.goto(`/campaigns/${campaignId}/applicants`);
    const row = page.getByRole("row", { name: /E2E 인플루언서/ });
    await expect(row).toBeVisible();
    await expect(row).toContainText("010-5555-6666");
    await row.getByRole("button", { name: "최종선정", exact: true }).click();
    await expect(row).toContainText("최종선정");
    await expect(row.getByRole("button", { name: "선정 취소" })).toBeVisible();

    // 5. 관리시트에 나타나고 D-day 컬럼이 있다
    await page.goto(`/campaigns/${campaignId}/seeding-sheet`);
    await expect(page.getByRole("cell", { name: "E2E 인플루언서" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "D-day" })).toBeVisible();

    // 6. 보고서 생성 → 스냅샷 지표 → PDF/PPTX 다운로드 200
    await page.goto(`/campaigns/${campaignId}/reports`);
    await page.getByRole("button", { name: /새 결과보고서 생성/ }).click();
    await expect(page).toHaveURL(/\/reports\/[0-9a-f-]{36}$/);
    const reportId = page.url().split("/").pop()!;
    await expect(page.getByText("1명", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "E2E 인플루언서" })).toBeVisible();

    const pdf = await request.get(`/api/reports/${reportId}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect((await pdf.body()).subarray(0, 4).toString("latin1")).toBe("%PDF");

    const pptx = await request.get(`/api/reports/${reportId}/pptx`);
    expect(pptx.status()).toBe(200);
    expect((await pptx.body()).subarray(0, 2).toString("latin1")).toBe("PK");
  });

  test("광고주 공유 링크에서 예비선정할 수 있고 연락처는 노출되지 않는다", async ({ page, request }) => {
    await page.goto(`/applicants/${SAMPLE.applicantsShareToken}`);
    const html = await page.content();
    expect(html).not.toContain(SAMPLE.appliedApplicantContact);

    const row = page.getByRole("row", { name: new RegExp(SAMPLE.appliedApplicantName) });
    await row.getByRole("button", { name: "예비선정", exact: true }).click();
    await expect(row).toContainText("예비선정");
    await expect(row.getByRole("button", { name: "최종선정 승격" })).toBeVisible();

    // 대시보드에도 즉시 반영되고 실행 주체가 '광고주'로 기록된다
    await page.goto(`/campaigns/${SAMPLE.campaignId}/applicants`);
    const dashRow = page.getByRole("row", { name: new RegExp(SAMPLE.appliedApplicantName) });
    await expect(dashRow).toContainText("예비선정");
    await dashRow.getByRole("button", { name: SAMPLE.appliedApplicantName }).click();
    await expect(page.getByRole("table").getByText(/선정 변경:\s*광고주/)).toBeVisible();

    // 토큰 CSV에는 연락처 컬럼이 없고, 대시보드 CSV에는 있다
    const publicCsv = await (await request.get(`/api/applicants/export?token=${SAMPLE.applicantsShareToken}`)).text();
    expect(publicCsv).not.toContain("연락처");
    expect(publicCsv).not.toContain(SAMPLE.appliedApplicantContact);
    const agencyCsv = await (await request.get(`/api/applicants/export?campaignId=${SAMPLE.campaignId}`)).text();
    expect(agencyCsv).toContain(SAMPLE.appliedApplicantContact);
  });

  test("관리시트 공유 페이지는 조회 전용이고 개인정보가 없다", async ({ page }) => {
    await page.goto(`/seeding-sheet/${SAMPLE.seedingShareToken}`);
    await expect(page.getByRole("columnheader", { name: "D-day" })).toBeVisible();
    expect(await page.locator("table select").count()).toBe(0);
    expect(await page.locator("table input").count()).toBe(0);
    const html = await page.content();
    expect(html).not.toContain("010-3849-2819");
    expect(html).not.toContain("테헤란로");
  });

  test("잘못된 토큰은 404", async ({ page }) => {
    const res = await page.goto("/apply/does_not_exist");
    expect(res?.status()).toBe(404);
  });

  test("사전조사 공개 폼 제출이 대시보드에 반영된다", async ({ page }) => {
    await page.goto(`/pre-survey/${SAMPLE.preSurveyToken}`);
    const first = page.locator("textarea").first();
    await first.fill("E2E 사전조사 답변입니다");
    await page.getByRole("button", { name: "사전조사 제출 완료하기" }).click();
    await expect(page.getByText("사전조사서가 성공적으로 제출되었습니다!")).toBeVisible();

    await page.goto(`/campaigns/${SAMPLE.campaignId}/pre-survey`);
    await expect(page.locator("textarea").first()).toHaveValue("E2E 사전조사 답변입니다");
  });
});
