import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadTestEnv, E2E_OWNER } from "./env";
import { NO_AUTH } from "./fixtures";

/**
 * 가입 초대 링크.
 *
 * 가입 화면은 로그인 없이 열리는 유일한 쓰기 경로다. 초대 링크가 있어야만 열리고,
 * 그 링크는 계정이 만들어지는 순간 죽는다. globalSetup 이 signup_invites 를 비우고 시작한다.
 *
 * 시도 횟수 제한(SIGNUP_BY_IP: 1시간 5회)에 걸리지 않도록 가입 시도는 이 파일에서 두 번만 한다.
 */

const env = loadTestEnv();
const admin = createClient(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const NEW_USER = { username: "e2e_newbie", displayName: "E2E 신입", password: "e2e-newbie-pass-2026!" };

/** 대표 관리자가 만든 것과 같은 모양의 초대를 직접 넣는다. 화면을 거치지 않고 준비만 한다. */
async function createInvite(label: string, expiresInMs = 60 * 60 * 1000): Promise<string> {
  const token = `e2e-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const { data: owner } = await admin.from("profiles").select("id, display_name").eq("username", E2E_OWNER.username).single();
  const { error } = await admin.from("signup_invites").insert({
    token,
    label,
    created_by: owner?.id ?? null,
    created_by_name: owner?.display_name ?? "대표",
    expires_at: new Date(Date.now() + expiresInMs).toISOString(),
  });
  if (error) throw new Error(`초대 생성 실패: ${error.message}`);
  return token;
}

async function fillSignupForm(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("#signup-username").fill(NEW_USER.username);
  await page.locator("#signup-name").fill(NEW_USER.displayName);
  await page.locator("#signup-password").fill(NEW_USER.password);
  await page.locator("#signup-password-confirm").fill(NEW_USER.password);
}

test.describe("가입 (로그인 없이)", () => {
  test.use({ storageState: NO_AUTH });

  test("초대 링크 없이는 가입 화면이 열리지 않는다", async ({ page }) => {
    // 주소만 아는 사람에게는 안내만 보인다. 폼 자체가 없다.
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "초대 링크가 필요합니다" })).toBeVisible();
    await expect(page.locator("#signup-username")).toHaveCount(0);

    // 아무 토큰이나 지어내도 열리지 않는다.
    await page.goto("/signup/not-a-real-token");
    await expect(page.getByRole("heading", { name: "쓸 수 없는 초대 링크입니다" })).toBeVisible();
  });

  test("기한이 지난 링크는 열리지 않는다", async ({ page }) => {
    const token = await createInvite("만료된 사람", -1000);
    await page.goto(`/signup/${token}`);
    await expect(page.getByRole("heading", { name: "쓸 수 없는 초대 링크입니다" })).toBeVisible();
  });

  test("초대 링크로 가입되고, 그 링크는 한 번 쓰면 죽는다", async ({ page }) => {
    const token = await createInvite("E2E 신입");

    await page.goto(`/signup/${token}`);
    await expect(page.getByRole("heading", { name: "RB Global 가입 신청" })).toBeVisible();
    // 누구를 위한 링크인지 화면에 보인다.
    await expect(page.getByText("E2E 신입", { exact: false })).toBeVisible();

    await fillSignupForm(page);
    await page.getByRole("button", { name: "가입 신청하기" }).click();
    await expect(page.getByRole("heading", { name: "가입 신청이 접수되었습니다" })).toBeVisible();

    // 같은 링크를 다시 열면 죽어 있다. 전달받은 사람이 또 써도 열리지 않는다는 뜻이다.
    await page.goto(`/signup/${token}`);
    await expect(page.getByRole("heading", { name: "쓸 수 없는 초대 링크입니다" })).toBeVisible();

    // 승인 전이므로 로그인해도 대시보드가 아니라 대기 화면이다.
    await page.goto("/login");
    await page.locator("#login-username").fill(NEW_USER.username);
    await page.locator("#login-password").fill(NEW_USER.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page.getByRole("heading", { name: "관리자 승인 대기 중입니다" })).toBeVisible();
    await expect(page).toHaveURL(/\/pending$/);
  });
});
