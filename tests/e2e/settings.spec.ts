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
    // 같은 문구가 화면 안내와 토스트 두 곳에 뜬다. 화면 쪽(main)만 본다.
    await expect(page.getByRole("main").getByText(/질문 내용을 입력해주세요/)).toBeVisible();
  });

  test("PPT 템플릿 보관함: 내장 템플릿은 내려받기와 삭제만 되고 pptx 외 파일은 거부된다", async ({ page }) => {
    await page.goto("/settings/ppt-templates");
    await expect(page.getByText("기본 내장").first()).toBeVisible();

    const builtinCard = page
      .locator("div")
      .filter({ hasText: "기본 인플루언서 행사 운영안 템플릿" })
      .filter({ has: page.getByText("기본 내장") })
      .last();

    // 원본은 받을 수 있고, 지웠다가 되살릴 수 있다.
    await expect(builtinCard.getByTitle("원본 pptx 내려받기")).toHaveCount(1);
    await expect(builtinCard.getByTitle(/목록에서 지우기/)).toHaveCount(1);
    // 내용은 코드에서 만들어 쓰므로 이름·종류·파일은 바꿀 수 없다.
    await expect(builtinCard.getByTitle("이름과 종류 수정")).toHaveCount(0);
    await expect(builtinCard.getByTitle(/파일만 교체/)).toHaveCount(0);

    await page.getByPlaceholder(/템플릿 명칭/).fill("잘못된 파일");
    await page.locator("input[type='file']").first().setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await page.evaluate(() => document.querySelectorAll("input[required]").forEach((el) => el.removeAttribute("required")));
    await page.getByRole("button", { name: "템플릿 등록 및 분석" }).click();
    // 같은 문구가 화면 안내와 토스트 두 곳에 뜬다. 화면 쪽(main)만 본다.
    await expect(page.getByRole("main").getByText(".pptx 파일만 업로드할 수 있습니다.")).toBeVisible();
  });

  test("PPT 템플릿 보관함: 기본 템플릿을 지우면 되살리기 버튼이 나오고 되살아난다", async ({ page }) => {
    await page.goto("/settings/ppt-templates");
    page.on("dialog", (d) => d.accept());

    const before = await page.getByText("기본 내장").count();
    expect(before).toBeGreaterThan(0);

    await page.getByTitle(/목록에서 지우기/).first().click();
    await expect(page.getByText("기본 내장")).toHaveCount(before - 1);

    const restore = page.getByRole("button", { name: /지운 기본 템플릿 .*되살리기/ });
    await expect(restore).toBeVisible();
    await restore.click();
    // 되살리기 결과 안내가 뜬 뒤에 새로고침한다. 바로 새로고침하면 저장이 끊겨 되살아나지 않는다.
    await expect(page.getByRole("main").getByText(/기본 템플릿 \d+개를 되살렸습니다/)).toBeVisible();

    await page.reload();
    await expect(page.getByText("기본 내장")).toHaveCount(before);
  });
});

/**
 * 저장이 충돌했을 때 **새로고침 없이** 빠져나올 수 있어야 한다.
 *
 * 전에는 잠금이 걸리면 막다른 길이었다. 화면은 "새로고침한 뒤 다시 저장해주세요" 라고 하는데,
 * 기준 시각이 실패 경로에서 갱신되지 않아 **다시 눌러도 영원히 같은 오류**였고, 안내대로
 * 새로고침하면 그때까지 고친 문항이 통째로 사라졌다. 잠금은 옳게 동작하는데 회복 경로가 없었다.
 *
 * B 의 저장은 테스트 DB 에 직접 써서 흉내 낸다. 확인하려는 것은 "A 의 화면이 어떻게 빠져나오는가" 다.
 */
test("템플릿 저장이 충돌해도 새로고침 없이 빠져나올 수 있다", async ({ page }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const { loadTestEnv } = await import("./env");
  const env = loadTestEnv();
  const admin = createClient(env.url, env.serviceRoleKey, { auth: { persistSession: false } });

  await page.goto("/settings/templates");
  const 첫칸 = page.locator("input[placeholder*='핵심 특징은 무엇인가요']").first();
  await expect(첫칸).not.toHaveValue("");

  // A: 문항을 고친다. 아직 저장하지 않았다.
  await 첫칸.fill("A 가 고친 문항");

  // B: A 가 화면을 열어 둔 사이에 같은 템플릿을 저장한다. (트리거가 updated_at 을 올린다)
  const { data: 원본 } = await admin.from("pre_survey_template").select("questions").eq("id", 1).single();
  const 문항 = (원본?.questions ?? []) as { id: string; question: string }[];
  const { error } = await admin
    .from("pre_survey_template")
    .update({ questions: [{ ...문항[0], question: "B 가 먼저 쓴 문항" }, ...문항.slice(1)] })
    .eq("id", 1);
  expect(error, `B 의 저장이 실패하면 이 테스트는 의미가 없다: ${error?.message}`).toBeNull();

  // A: 저장 → 덮어쓰지 않고 알린다. 내 입력은 화면에 그대로 있어야 한다.
  await page.getByRole("button", { name: "템플릿 저장하기" }).click();
  await expect(page.getByText("다른 사람이 먼저 저장했습니다")).toBeVisible();
  await expect(첫칸).toHaveValue("A 가 고친 문항");

  // **여기가 핵심** — 새로고침하지 않고 버튼만으로 빠져나온다.
  await page.getByRole("button", { name: "내 내용으로 덮어쓰기" }).click();
  await expect(page.getByText("덮어쓸 준비가 됐습니다")).toBeVisible();
  // 최신 기준 시각은 서버 컴포넌트를 다시 받아 얻는다. 그것이 도착할 때까지 기다린다.
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "템플릿 저장하기" }).click();
  await expect(page.getByText("기본 템플릿이 성공적으로 저장되었습니다!")).toBeVisible();

  // 저장에 성공했으면 기준 시각도 갱신됐어야 한다. 연달아 한 번 더 저장해도 자기 자신과 충돌하면 안 된다.
  await page.getByRole("button", { name: "템플릿 저장하기" }).click();
  await expect(page.getByText("다른 사람이 먼저 저장했습니다")).toBeHidden();

  const { data: 결과 } = await admin.from("pre_survey_template").select("questions").eq("id", 1).single();
  expect(JSON.stringify(결과?.questions)).toContain("A 가 고친 문항");
});
