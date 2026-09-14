import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadTestEnv } from "./env";
import { NO_AUTH } from "./fixtures";

/**
 * 가입 초대 코드.
 *
 * 가입 화면은 로그인 없이 열리는 유일한 쓰기 경로다. `app_settings.signup_invite_code` 행이
 * 없으면 아무도 가입할 수 없고, 있으면 그 코드를 맞힌 사람만 가입한다(승인 대기 상태로).
 * globalSetup 이 app_settings 를 비우고 시작하므로 "코드가 없는 상태"에서 출발한다.
 *
 * 시도 횟수 제한(SIGNUP_BY_IP: 1시간 5회)에 걸리지 않도록 가입 시도는 이 파일에서 두 번만 한다.
 * 일부러 틀린 코드를 반복해서 넣지 않는다.
 */

const env = loadTestEnv();
const admin = createClient(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const INVITE_CODE = "E2ETEST2";
const NEW_USER = { username: "e2e_newbie", displayName: "E2E 신입", password: "e2e-newbie-pass-2026!" };

async function setInviteCode(value: string | null): Promise<void> {
  if (value === null) {
    const { error } = await admin.from("app_settings").delete().eq("key", "signup_invite_code");
    if (error) throw new Error(`초대 코드 삭제 실패: ${error.message}`);
    return;
  }
  const { error } = await admin
    .from("app_settings")
    .upsert({ key: "signup_invite_code", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`초대 코드 설정 실패: ${error.message}`);
}

async function fillSignupForm(page: import("@playwright/test").Page, code: string): Promise<void> {
  await page.locator("#signup-invite-code").fill(code);
  await page.locator("#signup-username").fill(NEW_USER.username);
  await page.locator("#signup-name").fill(NEW_USER.displayName);
  await page.locator("#signup-password").fill(NEW_USER.password);
  await page.locator("#signup-password-confirm").fill(NEW_USER.password);
}

test.describe("가입 (로그인 없이)", () => {
  test.use({ storageState: NO_AUTH });

  test("초대 코드가 설정되기 전에는 가입을 받지 않는다", async ({ page }) => {
    await setInviteCode(null);

    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "RB Global 가입 신청" })).toBeVisible();
    await fillSignupForm(page, INVITE_CODE);
    await page.getByRole("button", { name: "가입 신청하기" }).click();

    await expect(page.getByText("아직 가입을 받지 않습니다. 관리자에게 문의하세요.")).toBeVisible();
    // 계정이 만들어지지 않았어야 한다
    const { data } = await admin.from("profiles").select("username").eq("username", NEW_USER.username);
    expect(data ?? []).toHaveLength(0);
  });

  test("초대 코드가 있으면 가입되고, 승인 전까지는 대기 화면만 보인다", async ({ page }) => {
    await setInviteCode(INVITE_CODE);

    await page.goto("/signup");
    await fillSignupForm(page, INVITE_CODE.toLowerCase()); // 대소문자는 구분하지 않는다
    await page.getByRole("button", { name: "가입 신청하기" }).click();
    await expect(page.getByRole("heading", { name: "가입 신청이 접수되었습니다" })).toBeVisible();

    // 승인 전이므로 로그인해도 대시보드가 아니라 대기 화면이다
    await page.goto("/login");
    await page.locator("#login-username").fill(NEW_USER.username);
    await page.locator("#login-password").fill(NEW_USER.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page.getByRole("heading", { name: "관리자 승인 대기 중입니다" })).toBeVisible();
    await expect(page).toHaveURL(/\/pending$/);
  });
});
