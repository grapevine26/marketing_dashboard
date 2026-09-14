"use server";

import { ValidationError } from "@/lib/db";
import { ActionResult, runAction } from "@/lib/actions/result";
import { normalizeUsername, usernameToEmail } from "@/lib/auth/username";
import { signUpUser } from "@/lib/auth/users";
import { clearPersistence, createAuthClient, rememberPersistence } from "@/lib/supabase/auth";

/**
 * 로그인·가입·로그아웃 서버 액션.
 *
 * 로그인 전에 부르는 액션이라 `runAuthedAction` 을 쓰면 안 된다. 전부 맨 `runAction` 이다.
 * 대신 여기서 하는 일은 인증뿐이라 데이터에 닿지 않는다.
 *
 * 리다이렉트는 액션 안에서 하지 않는다. `redirect()` 는 예외를 던지는 방식이라
 * ActionResult 흐름과 섞이면 성공인지 실패인지 호출부에서 알아보기 어려워진다.
 * 어디로 보낼지만 정해서 돌려주고, 이동은 화면 쪽에서 router 로 한다.
 */

/**
 * 로그인 후 돌아갈 경로를 안전한 값으로 정리한다.
 *
 * `?next=https://남의사이트` 같은 값을 그대로 쓰면 로그인 화면이 외부로 튕기는
 * 오픈 리다이렉트가 된다. 그래서 **내부 경로만** 통과시킨다.
 * - `/` 로 시작해야 한다
 * - `//` 나 `/\` 로 시작하면 안 된다. 브라우저가 이걸 다른 호스트로 읽는다
 * - 로그인·가입 화면으로 되돌아가는 값은 무의미하므로 홈으로 바꾼다
 */
function sanitizeNext(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  const value = raw.trim();
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value === "/login" || value === "/signup" || value.startsWith("/login?") || value.startsWith("/signup?")) {
    return "/";
  }
  return value;
}

/** 아이디·비밀번호가 맞지 않을 때 쓰는 한 가지 문구. */
const CREDENTIAL_ERROR = "아이디 또는 비밀번호가 올바르지 않습니다.";

export async function loginAction(input: {
  username: unknown;
  password: unknown;
  persist: boolean;
  next?: string | null;
}): Promise<ActionResult<{ next: string }>> {
  return runAction(async () => {
    if (typeof input.password !== "string" || input.password.length === 0) {
      throw new ValidationError(CREDENTIAL_ERROR);
    }

    // 아이디 형식이 애초에 규칙에 맞지 않으면 그것도 같은 문구로 돌려준다.
    // 형식 안내를 따로 띄우면 "그런 아이디는 없다"는 정보가 되어버린다.
    let email: string;
    try {
      email = usernameToEmail(normalizeUsername(input.username));
    } catch {
      throw new ValidationError(CREDENTIAL_ERROR);
    }

    // 유지 선택을 signInWithPassword 보다 **먼저** 기록한다.
    // 로그인이 성공하면서 인증 쿠키가 바로 쓰이는데, 그때 쿠키 핸들러가 이 값을 보고
    // 만료를 정한다. 나중에 기록하면 첫 쿠키가 잘못된 만료로 굳는다.
    await rememberPersistence(input.persist);

    const supabase = await createAuthClient(input.persist);
    const { error } = await supabase.auth.signInWithPassword({ email, password: input.password });

    // 아이디가 없는 건지 비밀번호가 틀린 건지 구분해서 알려주지 않는다.
    // 구분해주면 아이디 목록을 훑어 계정이 있는지 알아낼 수 있다.
    if (error) throw new ValidationError(CREDENTIAL_ERROR);

    return { next: sanitizeNext(input.next) };
  });
}

/**
 * 가입. 성공해도 바로 로그인시키지 않는다.
 *
 * 가입 직후 상태는 `pending` 이라 로그인해도 대기 화면밖에 볼 게 없다.
 * "가입됨 → 승인 기다리는 중"을 한 화면에서 알려주고, 로그인은 나중에 직접 하게 하는 편이
 * 흐름이 분명하다.
 */
export async function signupAction(input: {
  username: unknown;
  display_name: unknown;
  password: unknown;
}): Promise<ActionResult<{ username: string }>> {
  return runAction(async () => {
    return signUpUser({
      username: input.username,
      display_name: input.display_name,
      password: input.password,
    });
  });
}

export async function logoutAction(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const supabase = await createAuthClient();
    await supabase.auth.signOut();
    // 유지 선택도 같이 지운다. 다음 사람이 이 브라우저에서 로그인할 때 영향받지 않도록.
    await clearPersistence();
    return null;
  });
}
