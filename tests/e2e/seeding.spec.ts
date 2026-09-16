import { test, expect, Page } from "@playwright/test";
import {
  NO_AUTH,
  SAMPLE,
  fillAllRequiredTextareas,
  newPublicContext,
  newPublicRequest,
  withServerAction,
} from "./fixtures";

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
    // 같은 문구가 폼 안 배너와 토스트 두 곳에 뜬다. 긴 폼에서는 배너가 화면 밖이라
    // 토스트를 같이 띄운다. 둘 다 보이는 것이 맞으므로 각각을 따로 확인한다.
    await expect(page.getByLabel("알림 메시지").getByText("개인정보 수집 및 이용에 동의해주세요.")).toBeVisible();
    await expect(page.locator("form").getByText("개인정보 수집 및 이용에 동의해주세요.")).toBeVisible();

    await page.getByLabel(/\(필수\) 개인정보/).check();
    await page.getByRole("button", { name: "인플루언서 지원서 제출하기" }).click();
    await expect(page.getByText("지원이 성공적으로 완료되었습니다!")).toBeVisible();

    // 4. 대시보드 지원자 목록에서 최종선정
    await page.goto(`/campaigns/${campaignId}/applicants`);
    const row = page.getByRole("row", { name: /E2E 인플루언서/ });
    await expect(row).toBeVisible();
    await expect(row).toContainText("010-5555-6666");
    // 화면은 누르는 즉시 바뀌지만 저장은 아직이다. 저장이 끝나기 전에 다른 화면으로 넘어가면
    // 관리시트에 나타나지 않는다. 서버 응답까지 기다린다.
    await withServerAction(page, () => row.getByRole("button", { name: "최종선정", exact: true }).click());
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

  test("광고주 공유 링크에서 예비선정할 수 있고 연락처는 노출되지 않는다", async ({ page, browser, playwright }) => {
    // 광고주는 로그인 계정이 없다. 쿠키 없는 창으로 열어 "로그인 없이 쓸 수 있다"까지 확인한다.
    const guest = await newPublicContext(browser);
    const guestPage = await guest.newPage();
    await guestPage.goto(`/applicants/${SAMPLE.applicantsShareToken}`);
    const html = await guestPage.content();
    expect(html).not.toContain(SAMPLE.appliedApplicantContact);

    const row = guestPage.getByRole("row", { name: new RegExp(SAMPLE.appliedApplicantName) });

    // **저장이 끝날 때까지 기다린다.** 화면은 서버 응답을 기다리지 않고 먼저 바뀐다
    // (ApplicantTable 의 낙관적 갱신). 그래서 버튼 모양만 보고 넘어가면 아직 저장 중인
    // 상태로 대시보드를 열게 되고, 거기서는 옛 값이 보인다. 실제로 이것 때문에 이 테스트가
    // 간헐적으로 실패했다 — 화면이 아니라 서버 액션 응답을 기다려야 한다.
    const [저장응답] = await Promise.all([
      guestPage.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes(SAMPLE.applicantsShareToken)
      ),
      row.getByRole("button", { name: "예비선정", exact: true }).click(),
    ]);
    expect(저장응답.ok(), "광고주 선정 저장이 실패했다").toBe(true);
    await expect(row.getByRole("button", { name: "최종선정 승격" })).toBeVisible();
    await guest.close();

    // 대시보드에도 반영되고 실행 주체가 '광고주'로 기록된다
    await page.goto(`/campaigns/${SAMPLE.campaignId}/applicants`);
    // 상태 칩은 DB 값을 그대로 센다.
    // 행 안의 "예비선정" 으로 확인하면 안 된다 — 그건 **버튼 이름**이라 상태가 무엇이든
    // 늘 맞는다. 실제로 이 자리에 있던 확인이 그래서 아무것도 확인하지 못했다.
    await expect(page.getByRole("button", { name: "예비선정 (1)" })).toBeVisible();
    const dashRow = page.getByRole("row", { name: new RegExp(SAMPLE.appliedApplicantName) });
    await dashRow.getByRole("button", { name: SAMPLE.appliedApplicantName }).click();
    await expect(page.getByRole("table").getByText(/선정 변경:\s*광고주/)).toBeVisible();

    // 토큰 CSV에는 연락처 컬럼이 없고(로그인 없이 받는다), 대시보드 CSV에는 있다(로그인 필요)
    const guestApi = await newPublicRequest(playwright);
    const publicCsv = await (await guestApi.get(`/api/applicants/export?token=${SAMPLE.applicantsShareToken}`)).text();
    expect(publicCsv).not.toContain("연락처");
    expect(publicCsv).not.toContain(SAMPLE.appliedApplicantContact);
    await guestApi.dispose();

    const agencyCsv = await (await page.request.get(`/api/applicants/export?campaignId=${SAMPLE.campaignId}`)).text();
    expect(agencyCsv).toContain(SAMPLE.appliedApplicantContact);
  });

  test("사전조사 공개 폼 제출이 대시보드에 반영된다", async ({ page }) => {
    await page.goto(`/pre-survey/${SAMPLE.preSurveyToken}`);
    // 기본 템플릿은 필수 문항이 여러 개다. 하나만 채우면 브라우저가 제출을 막는다.
    const filled = await fillAllRequiredTextareas(page, "E2E 사전조사 답변입니다");
    expect(filled).toBeGreaterThan(0);
    await page.getByRole("button", { name: "사전조사 제출 완료하기" }).click();
    await expect(page.getByText("사전조사서가 성공적으로 제출되었습니다!")).toBeVisible();

    await page.goto(`/campaigns/${SAMPLE.campaignId}/pre-survey`);
    await expect(page.locator("textarea").first()).toHaveValue("E2E 사전조사 답변입니다");
  });
});

/**
 * 공개 링크는 로그인 없이 열려야 한다. 로그인한 채로 확인하면 프록시를 그냥 통과해 버려서
 * 정작 확인하려는 것(비회원도 열 수 있다 / 열어도 개인정보는 없다)을 놓친다.
 */
test.describe("A-2. 공개 링크 (로그인 없이)", () => {
  test.use({ storageState: NO_AUTH });

  test("관리시트 공유 페이지는 조회 전용이고 개인정보가 없다", async ({ page }) => {
    await page.goto(`/seeding-sheet/${SAMPLE.seedingShareToken}`);
    await expect(page.getByRole("columnheader", { name: "D-day" })).toBeVisible();
    expect(await page.locator("table select").count()).toBe(0);
    expect(await page.locator("table input").count()).toBe(0);
    // HTML 전체를 본다. 화면에 안 그려도 서버가 클라이언트로 내려보내면 그것도 노출이다.
    const html = await page.content();
    expect(html, "연락처가 공유 페이지 HTML 에 들어 있다").not.toContain(SAMPLE.selectedApplicantContact);
    expect(html, "배송지가 공유 페이지 HTML 에 들어 있다").not.toContain(SAMPLE.selectedApplicantAddress);
  });

  test("지원자 공유 페이지와 신청폼은 로그인 없이 열린다", async ({ page }) => {
    await page.goto(`/applicants/${SAMPLE.applicantsShareToken}`);
    await expect(page).toHaveURL(new RegExp(`/applicants/${SAMPLE.applicantsShareToken}$`));
    await page.goto(`/apply/${SAMPLE.applyToken}`);
    await expect(page.getByRole("button", { name: "인플루언서 지원서 제출하기" })).toBeVisible();
  });

  test("잘못된 토큰은 한국어 404 화면", async ({ page }) => {
    const res = await page.goto("/apply/does_not_exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "열 수 없는 주소입니다" })).toBeVisible();
  });

  test("토큰 없는 내보내기 호출은 401 로 막힌다", async ({ playwright }) => {
    // 이 주소는 광고주 공유 링크(?token=)가 쓰기 때문에 프록시에서는 공개다.
    // 그래서 막는 일은 라우트 핸들러가 직접 한다: 토큰이 없으면 requireApiUser 가 401 을 낸다.
    // 로그인 화면으로 튕기지 않는 것이 맞다. 다운로드 요청에 HTML 을 돌려줄 이유가 없다.
    const anon = await newPublicRequest(playwright);
    const res = await anon.get(`/api/applicants/export?campaignId=${SAMPLE.campaignId}`);
    expect(res.status()).toBe(401);
    await anon.dispose();
  });
});
