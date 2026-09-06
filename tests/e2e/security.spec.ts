import { test, expect } from "@playwright/test";
import { SAMPLE } from "./fixtures";

const WEBHOOK = "https://hooks.slack.com/services/T0E2E/B0E2E/SECRET_E2E_WEBHOOK_TOKEN";
const MEMO = "INTERNAL_MEMO_E2E 광고주에게 보이면 안 되는 메모";

test.describe("정보 노출 및 접근 제어", () => {
  test("웹훅 URL은 저장돼도 공개 페이지 HTML에 나오지 않고, 허용되지 않은 주소는 거부된다", async ({ page, request }) => {
    await page.goto(`/campaigns/${SAMPLE.campaignId}`);
    const input = page.getByPlaceholder(/hooks\.slack\.com/);

    // 내부 IP / http 는 거부
    await input.fill("http://169.254.169.254/latest/meta-data");
    await page.getByRole("button", { name: "웹훅 저장" }).click();
    await expect(page.getByText(/https로 시작|지원하지 않는 웹훅/)).toBeVisible();

    await input.fill(WEBHOOK);
    await page.getByRole("button", { name: "웹훅 저장" }).click();
    await expect(page.getByText("저장 완료!")).toBeVisible();

    for (const p of [
      `/apply/${SAMPLE.applyToken}`,
      `/pre-survey/${SAMPLE.preSurveyToken}`,
      `/applicants/${SAMPLE.applicantsShareToken}`,
      `/seeding-sheet/${SAMPLE.seedingShareToken}`,
    ]) {
      const html = await (await request.get(p)).text();
      expect(html, `${p} must not contain webhook url`).not.toContain("SECRET_E2E_WEBHOOK_TOKEN");
      expect(html, `${p} must not contain webhook field`).not.toContain("webhook_url");
    }
  });

  test("에이전시 내부 메모는 광고주 공유 페이지와 토큰 CSV에 나오지 않는다", async ({ page, request }) => {
    await page.goto(`/campaigns/${SAMPLE.campaignId}/applicants`);
    const row = page.getByRole("row", { name: new RegExp(SAMPLE.appliedApplicantName) });
    await row.getByTitle("클릭하여 메모 수정").click();
    await row.getByPlaceholder("메모 입력").fill(MEMO);
    await row.getByPlaceholder("메모 입력").press("Enter");
    await expect(row).toContainText("INTERNAL_MEMO_E2E");

    const shareHtml = await (await request.get(`/applicants/${SAMPLE.applicantsShareToken}`)).text();
    expect(shareHtml).not.toContain("INTERNAL_MEMO_E2E");
    const sheetHtml = await (await request.get(`/seeding-sheet/${SAMPLE.seedingShareToken}`)).text();
    expect(sheetHtml).not.toContain("INTERNAL_MEMO_E2E");
    const csv = await (await request.get(`/api/applicants/export?token=${SAMPLE.applicantsShareToken}`)).text();
    expect(csv).not.toContain("INTERNAL_MEMO_E2E");
    // 대시보드 CSV에는 있어야 한다
    const agencyCsv = await (await request.get(`/api/applicants/export?campaignId=${SAMPLE.campaignId}`)).text();
    expect(agencyCsv).toContain("INTERNAL_MEMO_E2E");
  });

  test("시안 미디어: 2MB 업로드가 성공하고, 토큰 없이는 파일을 받을 수 없다", async ({ page, request }) => {
    await page.goto(`/sns/${SAMPLE.snsAccountId}`);
    await page.getByRole("button", { name: /콘텐츠 목록/ }).click();
    await page.getByRole("button", { name: "수정", exact: true }).first().click();

    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2 * 1024 * 1024, 1)]);
    await page.locator("input[type='file']").first().setInputFiles({ name: "big.png", mimeType: "image/png", buffer: png });
    const img = page.locator("img[src*='/api/media/']").first();
    await expect(img).toBeVisible({ timeout: 20000 });
    const src = await img.getAttribute("src");
    expect(src).toContain("token=");
    const bare = src!.split("?")[0];

    expect((await request.get(bare)).status()).toBe(401);
    expect((await request.get(`${bare}?token=wrong`)).status()).toBe(401);
    const ok = await request.get(src!);
    expect(ok.status()).toBe(200);
    expect(ok.headers()["cache-control"]).toContain("private");

    // 확장자만 png 인 가짜 파일은 거부
    await page.locator("input[type='file']").first().setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("MZ this is not a png") });
    await expect(page.getByText(/파일 내용이 확장자와 다릅니다/)).toBeVisible();

    // 승인 페이지에서도 토큰 붙은 URL로 보인다
    await page.getByRole("button", { name: "수정 저장" }).click();
    await page.goto(`/sns-approval/${SAMPLE.snsApprovalToken}`);
    const approvalImg = page.locator("img[src*='/api/media/']").first();
    if (await approvalImg.count()) {
      expect(await approvalImg.getAttribute("src")).toContain(`token=${SAMPLE.snsApprovalToken}`);
    }
  });
});
