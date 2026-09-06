import { test, expect } from "@playwright/test";
import { SAMPLE, PPTX_MIME } from "./fixtures";

test.describe("C. SNS 운영", () => {
  test("광고주 승인 페이지는 승인대기만 보여주고 내부 메모·토큰을 노출하지 않는다", async ({ page }) => {
    await page.goto(`/sns-approval/${SAMPLE.snsApprovalToken}`);
    await expect(page.getByRole("heading", { name: SAMPLE.pendingContentTitle })).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain(SAMPLE.pendingContentMediaNote);
    expect(html).not.toContain(SAMPLE.snsIntakeToken);
    expect(html).not.toContain("intake_token");
    expect(html).not.toContain("view_count");
    // planning / posted 상태 콘텐츠는 보이지 않는다
    await expect(page.getByText("올리브영 단독 기획세트")).toBeHidden();
    await expect(page.getByText("비건 보습 루틴")).toBeHidden();
  });

  test("콘텐츠 생성 → 승인대기 → 광고주 수정요청 → 대시보드에 코멘트 표시 → 승인", async ({ page }) => {
    page.on("dialog", (d) => d.accept());

    // 1. 콘텐츠 생성
    await page.goto(`/sns/${SAMPLE.snsAccountId}`);
    await page.getByRole("button", { name: "새 콘텐츠 기획" }).click();
    await page.getByPlaceholder(/하이드라 세럼 제형 릴스/).fill("E2E 릴스 기획");
    await page.getByRole("button", { name: "기획안 등록" }).click();
    await page.getByRole("button", { name: /콘텐츠 목록 및 성과 관리/ }).click();
    const card = page.locator("div.rounded-3xl").filter({ has: page.getByRole("heading", { name: "E2E 릴스 기획" }) }).last();
    await expect(card).toBeVisible();

    // 2. 승인대기로 전이
    await card.getByRole("combobox").first().selectOption("pending_approval");
    await expect(card.getByRole("combobox").first()).toHaveValue("pending_approval");

    // 3. 광고주 페이지: 코멘트 없이 수정 요청 → 거부, 코멘트 입력 후 → 목록에서 제거
    await page.goto(`/sns-approval/${SAMPLE.snsApprovalToken}`);
    const approvalCard = page.locator("div.rounded-3xl").filter({ has: page.getByRole("heading", { name: "E2E 릴스 기획" }) }).last();
    await approvalCard.getByRole("button", { name: "수정 요청" }).click();
    await expect(page.getByText("수정 요청 사항을 입력해주세요.")).toBeVisible();
    await approvalCard.getByPlaceholder(/수정 요청 사항/).fill("두 번째 줄 문구를 바꿔주세요");
    await approvalCard.getByRole("button", { name: "수정 요청" }).click();
    await expect(page.getByRole("heading", { name: "E2E 릴스 기획" })).toBeHidden();
    await expect(page.getByText(/E2E 릴스 기획 — 수정 요청 전달/)).toBeVisible();

    // 4. 대시보드에 코멘트가 보이고 상태는 제작중
    await page.goto(`/sns/${SAMPLE.snsAccountId}`);
    await page.getByRole("button", { name: /콘텐츠 목록 및 성과 관리/ }).click();
    const dashCard = page.locator("div.rounded-3xl").filter({ has: page.getByRole("heading", { name: "E2E 릴스 기획" }) }).last();
    await expect(dashCard).toContainText("두 번째 줄 문구를 바꿔주세요");
    await expect(dashCard.getByRole("combobox").first()).toHaveValue("producing");

    // 5. 수정 후 다시 승인대기 → 승인
    await dashCard.getByRole("button", { name: "수정" }).click();
    await page.getByPlaceholder("캡션 본문...").fill("수정된 캡션");
    await page.getByRole("button", { name: "수정 저장" }).click();
    await expect(dashCard).toContainText("수정된 캡션");
    await dashCard.getByRole("combobox").first().selectOption("pending_approval");

    await page.goto(`/sns-approval/${SAMPLE.snsApprovalToken}`);
    const again = page.locator("div.rounded-3xl").filter({ has: page.getByRole("heading", { name: "E2E 릴스 기획" }) }).last();
    await expect(again).toContainText("수정된 캡션");
    await again.getByRole("button", { name: "시안 승인 (컨펌)" }).click();
    await expect(page.getByText(/E2E 릴스 기획 — 승인 완료/)).toBeVisible();

    // 6. 게시완료 후 성과 입력 (음수는 거부)
    await page.goto(`/sns/${SAMPLE.snsAccountId}`);
    await page.getByRole("button", { name: /콘텐츠 목록 및 성과 관리/ }).click();
    const finalCard = page.locator("div.rounded-3xl").filter({ has: page.getByRole("heading", { name: "E2E 릴스 기획" }) }).last();
    await expect(finalCard.getByRole("combobox").first()).toHaveValue("approved");
    await finalCard.getByRole("combobox").first().selectOption("posted");
    await finalCard.getByPlaceholder("조회수").fill("-5");
    await finalCard.getByRole("button", { name: "성과 저장" }).click();
    await expect(page.getByText(/조회수은\(는\) 0 이상의 정수여야 합니다/)).toBeVisible();
    await finalCard.getByPlaceholder("조회수").fill("1500");
    await finalCard.getByPlaceholder("좋아요").fill("20");
    await finalCard.getByRole("button", { name: "성과 저장" }).click();
    await expect(page.getByText("성과 수치가 저장되었습니다.")).toBeVisible();
  });

  test("사전설문 공개 폼 제출이 대시보드 탭에 질문 문구와 함께 표시된다", async ({ page }) => {
    await page.goto(`/sns-intake/${SAMPLE.snsIntakeToken}`);
    await page.locator("textarea").first().fill("E2E 톤앤매너 답변");
    await page.getByRole("button", { name: /제출/ }).click();
    await expect(page.getByText("사전설문 제출이 완료되었습니다!")).toBeVisible();

    await page.goto(`/sns/${SAMPLE.snsAccountId}`);
    await page.getByRole("button", { name: "광고주 사전설문 답변" }).click();
    await expect(page.getByText("E2E 톤앤매너 답변")).toBeVisible();
    await expect(page.getByText(/1\. 브랜드 톤앤매너와 핵심 고객 페르소나/)).toBeVisible();
  });

  test("운영안 저장 후 PPT 다운로드, 템플릿 미선택이면 다운로드 불가", async ({ page, request }) => {
    await page.goto(`/sns/${SAMPLE.snsAccountId}/plan`);
    await page.getByRole("button", { name: /^운영안 저장/ }).click();
    await expect(page.getByText(/운영안이 저장되었습니다/)).toBeVisible();
    await expect(page.getByRole("button", { name: "PPT 다운로드" })).toBeVisible();

    const ppt = await request.get(`/sns/${SAMPLE.snsAccountId}/plan/export`);
    expect(ppt.status()).toBe(200);
    expect(ppt.headers()["content-type"]).toContain(PPTX_MIME);

    await page.locator("select").selectOption("");
    await page.getByRole("button", { name: /^운영안 저장/ }).click();
    await expect(page.getByText(/템플릿 미선택/)).toBeVisible();
    await expect(page.getByRole("button", { name: "PPT 다운로드" })).toBeHidden();
    const noTemplate = await request.get(`/sns/${SAMPLE.snsAccountId}/plan/export`);
    expect(noTemplate.status()).toBe(400);
  });
});
