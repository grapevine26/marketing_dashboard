import { test, expect } from "@playwright/test";
import { NO_AUTH, PPTX_MIME, SAMPLE, contentCard, fillAllRequiredTextareas, withServerAction } from "./fixtures";

/** 광고주 승인 페이지는 로그인 계정이 없는 사람이 여는 곳이다. 쿠키 없는 창으로 확인한다. */
test.describe("C-0. 광고주 승인 페이지 (로그인 없이)", () => {
  test.use({ storageState: NO_AUTH });

  test("승인대기만 보여주고 내부 메모·토큰을 노출하지 않는다", async ({ page }) => {
    await page.goto(`/sns-approval/${SAMPLE.snsApprovalToken}`);
    await expect(page.getByRole("heading", { name: SAMPLE.pendingContentTitle })).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain(SAMPLE.pendingContentMediaNote);
    expect(html).not.toContain(SAMPLE.snsIntakeToken);
    expect(html).not.toContain("intake_token");
    expect(html).not.toContain("view_count");
    // planning / posted 상태 콘텐츠는 보이지 않는다
    await expect(page.getByText(SAMPLE.planningContentTitle)).toBeHidden();
    await expect(page.getByText(SAMPLE.postedContentTitle)).toBeHidden();
  });
});

test.describe("C. SNS 운영", () => {
  test("신규 기획안에서 고른 시안이 목록에 남고 등록과 함께 올라간다", async ({ page }) => {
    // 이미 만들어진 콘텐츠를 "수정" 하며 올리는 길과 달리, 신규 등록은 파일을 바로 올리지 않고
    // 화면에 쌓아 두었다가 등록 버튼을 누를 때 함께 보낸다. 그 "쌓아 두는" 부분이 조용히
    // 비어 버린 적이 있어(선택해도 아무 반응이 없었다) 여기서 지킨다.
    await page.goto(`/sns/${SAMPLE.snsAccountId}`);
    await page.getByRole("button", { name: "새 콘텐츠 기획" }).click();
    await page.getByPlaceholder(/하이드라 세럼 제형 릴스/).fill("신규 시안 첨부 테스트");

    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(1024, 7),
    ]);
    await page
      .locator("input[type='file']")
      .first()
      .setInputFiles({ name: "신규시안.png", mimeType: "image/png", buffer: png });

    // 고른 파일이 화면에 남아 있어야 한다. 여기서 사라지면 사용자는 아무 반응도 못 본다.
    await expect(page.getByText("신규시안.png")).toBeVisible();

    await page.getByRole("button", { name: "기획안 등록" }).click();
    await expect(page.getByRole("heading", { name: "신규 SNS 콘텐츠 기획안 등록" })).toBeHidden();

    // 등록된 콘텐츠에 그 시안이 실제로 붙어 있어야 한다.
    await page.getByRole("button", { name: /콘텐츠 목록 및 성과 관리/ }).click();
    const card = contentCard(page, "신규 시안 첨부 테스트");
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "수정", exact: true }).click();
    // 저장된 첨부는 섬네일과 파일명 두 군데에 이름이 나온다. 하나만 보면 된다.
    await expect(page.getByText("신규시안.png").first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator("img[src*='/api/media/']").first()).toBeVisible({ timeout: 20000 });
  });

  test("콘텐츠 생성 → 승인대기 → 광고주 수정요청 → 대시보드에 코멘트 표시 → 승인", async ({ page }) => {
    page.on("dialog", (d) => d.accept());

    // 1. 콘텐츠 생성
    await page.goto(`/sns/${SAMPLE.snsAccountId}`);
    await page.getByRole("button", { name: "새 콘텐츠 기획" }).click();
    await page.getByPlaceholder(/하이드라 세럼 제형 릴스/).fill("E2E 릴스 기획");
    await page.getByRole("button", { name: "기획안 등록" }).click();
    // 등록이 끝나야 모달이 닫힌다. 닫히기 전에 탭을 누르면 클릭이 모달에 먹힌다.
    await expect(page.getByRole("heading", { name: "신규 SNS 콘텐츠 기획안 등록" })).toBeHidden();
    await page.getByRole("button", { name: /콘텐츠 목록 및 성과 관리/ }).click();
    const card = contentCard(page, "E2E 릴스 기획");
    await expect(card).toBeVisible();

    // 2. 승인대기로 전이
    await withServerAction(page, () => card.getByRole("combobox").first().selectOption("pending_approval"));
    await expect(card.getByRole("combobox").first()).toHaveValue("pending_approval");

    // 3. 광고주 페이지: 코멘트 없이 수정 요청 → 거부, 코멘트 입력 후 → 목록에서 제거
    await page.goto(`/sns-approval/${SAMPLE.snsApprovalToken}`);
    const approvalCard = contentCard(page, "E2E 릴스 기획");
    await approvalCard.getByRole("button", { name: "수정 요청" }).click();
    // 같은 문구가 폼 안 배너와 토스트 두 곳에 뜬다. 긴 폼에서는 배너가 화면 밖이라
    // 토스트를 같이 띄운다. 둘 다 보이는 것이 맞으므로 각각을 따로 확인한다.
    await expect(page.getByLabel("알림 메시지").getByText("수정 요청 사항을 입력해주세요.")).toBeVisible();
    await approvalCard.getByPlaceholder(/수정 요청 사항/).fill("두 번째 줄 문구를 바꿔주세요");
    await approvalCard.getByRole("button", { name: "수정 요청" }).click();
    await expect(page.getByRole("heading", { name: "E2E 릴스 기획" })).toBeHidden();
    await expect(page.getByText(/E2E 릴스 기획 — 수정 요청 전달/)).toBeVisible();

    // 4. 대시보드에 코멘트가 보이고 상태는 제작중
    await page.goto(`/sns/${SAMPLE.snsAccountId}`);
    await page.getByRole("button", { name: /콘텐츠 목록 및 성과 관리/ }).click();
    const dashCard = contentCard(page, "E2E 릴스 기획");
    await expect(dashCard).toContainText("두 번째 줄 문구를 바꿔주세요");
    await expect(dashCard.getByRole("combobox").first()).toHaveValue("producing");

    // 5. 수정 후 다시 승인대기 → 승인
    await dashCard.getByRole("button", { name: "수정" }).click();
    await page.getByPlaceholder("캡션 본문...").fill("수정된 캡션");
    await page.getByRole("button", { name: "수정 저장" }).click();
    await expect(dashCard).toContainText("수정된 캡션");
    // 저장이 끝나기 전에 광고주 화면으로 넘어가면 상태 변경이 끊긴다.
    await withServerAction(page, () => dashCard.getByRole("combobox").first().selectOption("pending_approval"));
    await expect(dashCard.getByRole("combobox").first()).toHaveValue("pending_approval");

    await page.goto(`/sns-approval/${SAMPLE.snsApprovalToken}`);
    const again = contentCard(page, "E2E 릴스 기획");
    await expect(again).toContainText("수정된 캡션");
    await again.getByRole("button", { name: "시안 승인 (컨펌)" }).click();
    await expect(page.getByText(/E2E 릴스 기획 — 승인 완료/)).toBeVisible();

    // 6. 게시완료 후 성과 입력 (음수는 거부)
    await page.goto(`/sns/${SAMPLE.snsAccountId}`);
    await page.getByRole("button", { name: /콘텐츠 목록 및 성과 관리/ }).click();
    const finalCard = contentCard(page, "E2E 릴스 기획");
    await expect(finalCard.getByRole("combobox").first()).toHaveValue("approved");
    await withServerAction(page, () => finalCard.getByRole("combobox").first().selectOption("posted"));
    await finalCard.getByPlaceholder("조회수").fill("-5");
    await finalCard.getByRole("button", { name: "성과 저장" }).click();
    // 배너와 토스트 두 곳에 뜬다. 성과 입력칸이 목록 아래라 배너가 스크롤 밖이어서 토스트를 같이 띄운다.
    // `조회수` 는 받침이 없으니 "는" 이다. 전에는 "조회수은(는)" 이 그대로 나갔다.
    await expect(page.getByLabel("알림 메시지").getByText(/조회수는 0 이상의 정수여야 합니다/)).toBeVisible();
    await expect(page.getByRole("main").getByText(/조회수는 0 이상의 정수여야 합니다/)).toBeVisible();
    await finalCard.getByPlaceholder("조회수").fill("1500");
    await finalCard.getByPlaceholder("좋아요").fill("20");
    await finalCard.getByRole("button", { name: "성과 저장" }).click();
    // 같은 문구가 화면 안내와 토스트 두 곳에 뜬다. 화면 쪽(main)만 본다.
    await expect(page.getByRole("main").getByText("성과 수치가 저장되었습니다.")).toBeVisible();
  });

  test("사전설문 공개 폼 제출이 대시보드 탭에 질문 문구와 함께 표시된다", async ({ page }) => {
    await page.goto(`/sns-intake/${SAMPLE.snsIntakeToken}`);
    // 기본 템플릿은 필수 문항이 여러 개다. 하나만 채우면 브라우저가 제출을 막는다.
    const filled = await fillAllRequiredTextareas(page, "E2E 톤앤매너 답변");
    expect(filled).toBeGreaterThan(0);
    await page.getByRole("button", { name: /제출/ }).click();
    await expect(page.getByText("사전설문 제출이 완료되었습니다!")).toBeVisible();

    await page.goto(`/sns/${SAMPLE.snsAccountId}`);
    await page.getByRole("button", { name: "광고주 사전설문 답변" }).click();
    // 나머지 필수 문항도 같은 문구 + 번호로 채워져 있으므로 정확히 일치하는 칸만 본다.
    await expect(page.getByText("E2E 톤앤매너 답변", { exact: true })).toBeVisible();
    await expect(page.getByText(/1\. 브랜드 톤앤매너와 핵심 고객 페르소나/)).toBeVisible();
  });

  test("운영안 저장 후 PPT 다운로드, 템플릿 미선택이면 다운로드 불가", async ({ page, request }) => {
    await page.goto(`/sns/${SAMPLE.snsAccountId}/plan`);
    await page.getByRole("button", { name: /^운영안 저장/ }).click();
    // 저장하면 화면 안내와 토스트가 함께 뜬다. 둘 다 같은 문구라 안내 쪽을 정확히 집는다.
    await expect(page.getByText("운영안이 저장되었습니다. PPT를 다운로드할 수 있습니다.")).toBeVisible();
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

/**
 * 둘이 같은 콘텐츠를 고칠 때, 나중에 저장한 쪽이 앞사람 것을 조용히 덮어쓰면 안 된다.
 *
 * B 의 저장은 테스트 DB 에 직접 써서 흉내 낸다. 브라우저 두 개를 띄우는 것보다
 * 확실하고, 우리가 확인하려는 것은 "A 의 화면이 어떻게 반응하는가" 이기 때문이다.
 */
test("같은 콘텐츠를 둘이 고치면 덮어쓰지 않고 선택지를 준다", async ({ page }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const { loadTestEnv } = await import("./env");
  const env = loadTestEnv();
  const admin = createClient(env.url, env.serviceRoleKey, { auth: { persistSession: false } });

  await page.goto(`/sns/${SAMPLE.snsAccountId}?tab=list`);
  const card = contentCard(page, SAMPLE.pendingContentTitle);

  // A: 편집을 연다. 이 순간의 기준 시각이 화면에 담긴다.
  await card.getByRole("button", { name: "수정", exact: true }).click();
  const 제목칸 = page.getByPlaceholder("예: 3초 속건조 탈출! 하이드라 세럼 제형 릴스");
  await expect(제목칸).toBeVisible();

  // B: A 가 창을 열어 둔 사이에 같은 콘텐츠를 고친다.
  const { error } = await admin
    .from("sns_contents")
    .update({ caption: "B 가 먼저 쓴 카피" })
    .eq("title", SAMPLE.pendingContentTitle);
  expect(error, `B 의 저장이 실패하면 이 테스트는 의미가 없다: ${error?.message}`).toBeNull();

  // A: 제목을 고쳐 저장한다.
  await 제목칸.fill("A 가 고친 제목");
  await page.getByRole("button", { name: "수정 저장" }).click();

  // 덮어쓰지 않고 알린다. 내 글은 화면에 그대로 있어야 한다.
  await expect(page.getByText("다른 사람이 먼저 저장했습니다")).toBeVisible();
  await expect(제목칸).toHaveValue("A 가 고친 제목");
  await expect(page.getByRole("button", { name: "내 내용으로 덮어쓰기" })).toBeVisible();
  await expect(page.getByRole("button", { name: /최신 내용 불러오기/ })).toBeVisible();

  // B 의 글은 아직 살아 있다.
  const { data } = await admin
    .from("sns_contents")
    .select("caption, title")
    .eq("title", SAMPLE.pendingContentTitle)
    .maybeSingle();
  expect(data?.caption).toBe("B 가 먼저 쓴 카피");
});

/**
 * 혼자 작업하는데 "다른 사람이 먼저 저장했습니다" 가 뜨면 안 된다.
 *
 * 첨부는 콘텐츠 행을 직접 고치고, DB 트리거가 그때마다 `updated_at` 을 올린다(마이그레이션 0008).
 * 수정 모달은 **열 때** 잡아 둔 기준 시각으로 충돌을 판정하므로, 같은 모달 안에서 파일 하나만
 * 붙여도 그 기준이 낡는다. 그대로 두면 자기가 붙인 첨부 때문에 자기 저장이 거부되고,
 * 거기서 "최신 내용 불러오기" 를 고르면 방금 쓴 캡션이 사라진다.
 *
 * 앞의 테스트(진짜 충돌)와 짝이다. 하나는 "남이 고쳤으면 막아야 한다", 이건 "나만 고쳤으면
 * 막으면 안 된다" — 둘 다 있어야 잠금이 제 역할만 한다.
 */
test("첨부를 붙인 뒤 저장해도 가짜 충돌이 나지 않는다", async ({ page }) => {
  await page.goto(`/sns/${SAMPLE.snsAccountId}?tab=list`);
  const card = contentCard(page, SAMPLE.pendingContentTitle);

  await card.getByRole("button", { name: "수정", exact: true }).click();
  const 제목칸 = page.getByPlaceholder("예: 3초 속건조 탈출! 하이드라 세럼 제형 릴스");
  await expect(제목칸).toBeVisible();

  // 같은 모달 안에서 첨부를 하나 올린다. 이것만으로 행의 updated_at 이 바뀐다.
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(1024, 7),
  ]);
  await page.locator("input[type='file']").first().setInputFiles({
    name: "가짜충돌확인.png",
    mimeType: "image/png",
    buffer: png,
  });
  // 파일명은 목록 카드와 모달 양쪽에 나온다. 올라왔다는 사실만 확인하면 되므로 첫 번째를 본다.
  await expect(page.getByText("가짜충돌확인.png").first()).toBeVisible({ timeout: 20000 });

  // 그리고 본문을 고쳐 저장한다. 남은 아무도 건드리지 않았다.
  await 제목칸.fill("첨부 후에도 저장되는 제목");
  await page.getByRole("button", { name: "수정 저장" }).click();

  await expect(page.getByText("다른 사람이 먼저 저장했습니다")).toBeHidden();
  await expect(page.getByText("콘텐츠가 수정되었습니다.")).toBeVisible();
});
