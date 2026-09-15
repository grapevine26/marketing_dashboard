import { test, expect } from "@playwright/test";
import { SAMPLE, newPublicRequest } from "./fixtures";

const WEBHOOK = "https://hooks.slack.com/services/T0E2E/B0E2E/SECRET_E2E_WEBHOOK_TOKEN";
const MEMO = "INTERNAL_MEMO_E2E 광고주에게 보이면 안 되는 메모";

test.describe("정보 노출 및 접근 제어", () => {
  test("웹훅 URL은 저장돼도 공개 페이지 HTML에 나오지 않고, 허용되지 않은 주소는 거부된다", async ({ page, playwright }) => {
    await page.goto(`/campaigns/${SAMPLE.campaignId}`);
    const input = page.getByPlaceholder(/hooks\.slack\.com/);

    // 내부 IP / http 는 거부
    await input.fill("http://169.254.169.254/latest/meta-data");
    await page.getByRole("button", { name: "웹훅 저장" }).click();
    // 같은 문구가 화면 안내와 토스트 두 곳에 뜬다. 화면 쪽(main)만 본다.
    await expect(page.getByRole("main").getByText(/https로 시작|지원하지 않는 웹훅/)).toBeVisible();

    await input.fill(WEBHOOK);
    await page.getByRole("button", { name: "웹훅 저장" }).click();
    await expect(page.getByText("저장 완료!")).toBeVisible();

    // 공개 링크는 로그인하지 않은 사람이 여는 것이므로 쿠키 없는 클라이언트로 받는다.
    const guest = await newPublicRequest(playwright);
    for (const p of [
      `/apply/${SAMPLE.applyToken}`,
      `/pre-survey/${SAMPLE.preSurveyToken}`,
      `/applicants/${SAMPLE.applicantsShareToken}`,
      `/seeding-sheet/${SAMPLE.seedingShareToken}`,
    ]) {
      const res = await guest.get(p);
      expect(res.status(), `${p} 는 로그인 없이 열려야 한다`).toBe(200);
      const html = await res.text();
      expect(html, `${p} must not contain webhook url`).not.toContain("SECRET_E2E_WEBHOOK_TOKEN");
      expect(html, `${p} must not contain webhook field`).not.toContain("webhook_url");
    }
    await guest.dispose();
  });

  test("에이전시 내부 메모는 광고주 공유 페이지와 토큰 CSV에 나오지 않는다", async ({ page, playwright }) => {
    await page.goto(`/campaigns/${SAMPLE.campaignId}/applicants`);
    const row = page.getByRole("row", { name: new RegExp(SAMPLE.appliedApplicantName) });
    await row.getByTitle("클릭하여 메모 수정").click();
    await row.getByPlaceholder("메모 입력").fill(MEMO);
    await row.getByPlaceholder("메모 입력").press("Enter");
    await expect(row).toContainText("INTERNAL_MEMO_E2E");

    // 광고주가 보는 것과 같은 조건(로그인 없음)으로 받는다.
    const guest = await newPublicRequest(playwright);
    const shareHtml = await (await guest.get(`/applicants/${SAMPLE.applicantsShareToken}`)).text();
    expect(shareHtml).not.toContain("INTERNAL_MEMO_E2E");
    const sheetHtml = await (await guest.get(`/seeding-sheet/${SAMPLE.seedingShareToken}`)).text();
    expect(sheetHtml).not.toContain("INTERNAL_MEMO_E2E");
    const csv = await (await guest.get(`/api/applicants/export?token=${SAMPLE.applicantsShareToken}`)).text();
    expect(csv).not.toContain("INTERNAL_MEMO_E2E");
    await guest.dispose();

    // 대시보드 CSV에는 있어야 한다 (로그인한 사람만 받을 수 있다)
    const agencyCsv = await (await page.request.get(`/api/applicants/export?campaignId=${SAMPLE.campaignId}`)).text();
    expect(agencyCsv).toContain("INTERNAL_MEMO_E2E");
  });

  test("시안 미디어: 2MB 업로드가 성공하고, 밖에서는 파일을 받을 수 없다", async ({ page, request, playwright }) => {
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

    // **로그인하지 않은 쪽**에서 확인해야 한다. 직원은 자기 시안이라 토큰 없이도 봐야 맞다.
    // 쿠키가 있는 요청으로 확인하면 "밖에서도 열리는가" 를 검증하지 못한다.
    const outsider = await newPublicRequest(playwright);
    expect((await outsider.get(bare)).status()).toBe(401);
    expect((await outsider.get(`${bare}?token=wrong`)).status()).toBe(401);
    // 아직 승인 대기 상태가 아니므로 올바른 토큰으로도 열리지 않는다.
    expect((await outsider.get(src!)).status()).toBe(401);
    await outsider.dispose();

    // 직원(로그인)은 기획 단계 시안도 본다.
    const ok = await request.get(src!);
    expect(ok.status()).toBe(200);
    expect(ok.headers()["cache-control"]).toContain("private");

    // 확장자만 png 인 가짜 파일은 거부
    await page.locator("input[type='file']").first().setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("MZ this is not a png") });
    // 같은 문구가 화면 배너와 토스트 두 곳에 뜬다(토스트는 모달에 가리지 않으려고 같이 띄운다).
    // 둘 다 보이는 것이 맞으므로 각각을 따로 확인한다.
    await expect(page.getByLabel("알림 메시지").getByText(/파일 내용이 확장자와 다릅니다/)).toBeVisible();
    await expect(page.getByRole("main").getByText(/파일 내용이 확장자와 다릅니다/)).toBeVisible();

    // 승인 페이지에서도 토큰 붙은 URL로 보인다
    await page.getByRole("button", { name: "수정 저장" }).click();
    await page.goto(`/sns-approval/${SAMPLE.snsApprovalToken}`);
    const approvalImg = page.locator("img[src*='/api/media/']").first();
    if (await approvalImg.count()) {
      expect(await approvalImg.getAttribute("src")).toContain(`token=${SAMPLE.snsApprovalToken}`);
    }
  });
});
